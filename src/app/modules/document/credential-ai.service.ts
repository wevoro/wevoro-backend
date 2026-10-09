import httpStatus from 'http-status';
import { PDFDocument } from 'pdf-lib';
import config from '../../../config';
import ApiError from '../../../errors/ApiError';
import { Documents } from './documents.model';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';

/**
 * AI credential reading.
 *
 * Confirming a credential means an admin opens the file, reads it, and types
 * four fields — ID number, issue date, expiry, issuing organisation — for every
 * document of every caregiver. This reads the document, fills those in, and
 * reports the problems that would otherwise have to be spotted by eye.
 *
 * It SUGGESTS. Nothing here approves or rejects: the endpoint only writes
 * `aiExtraction` onto the document, and the admin still presses Confirm.
 * `aiSuggestedReason` / `adminAgreedWithAi` (already on the model) record
 * whether the admin agreed, so accuracy can be measured before any of this is
 * trusted with more.
 */

/** Big enough for a scanned certificate, small enough to send in one request. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * gpt-4o family — reading a PDF needs a vision-capable model.
 *
 * `gpt-4o-mini` reads the fields off a clean credential perfectly well, but its
 * judgement calls are not stable: run the same nine documents through it twice
 * and it changes its mind about which of them look altered, which issuers it
 * recognises and which expiry dates it can see. Since a wrong call here becomes
 * a rejection reason sent to a caregiver, the full model is worth the money —
 * still well under a cent per document at one page.
 */
const MODEL = process.env.OPENAI_CREDENTIAL_MODEL || 'gpt-4o';

export const isCredentialAiConfigured = (): boolean => !!config.openai_api_key;

/** What the slot the caregiver uploaded into is supposed to hold. */
const EXPECTED: Record<string, string> = {
  certifications: 'a CNA or PCA certificate (nurse aide or personal care aide)',
  cpr_test:
    'a CPR / First Aid certification card, which Georgia requires to cover BOTH CPR and First Aid — a CPR-only or BLS-only card falls short',
  tb_tests:
    'a TB (tuberculosis) test or screening result, showing the result itself and not merely that a test was booked',
  driver_license: 'a government-issued driver license',
  auto_insurance: 'an auto insurance policy or insurance card',
  gchexs: 'a GCHEXS background check confirmation',
};

/**
 * Reasons the AI must never decide by itself, only suggest.
 *
 * Mirrors `aiSuggestOnly` in the frontend's lib/rejection-reasons.ts. An
 * altered document is an accusation, so it always escalates to a person even
 * when automation is on.
 */
const AI_SUGGEST_ONLY = ['appears_altered'];

/**
 * Reasons that are not selectable for a given credential.
 *
 * Mirrors the `reserved` / `never` entries in the frontend's APPLICABILITY
 * matrix: the registry checks that would confirm a certificate's or a CPR
 * card's issuer do not exist yet, so the AI must not raise that reason there.
 * Keep the two lists in step.
 */
const NOT_APPLICABLE: Record<string, string[]> = {
  certifications: ['issuer_not_confirmed'],
  cpr_test: ['issuer_not_confirmed'],
  gchexs: ['issuer_not_confirmed'],
};

/** Fallback caregiver-facing wording, used when the model does not write one. */
const DEFAULT_MESSAGE: Record<string, string> = {
  unreadable:
    'We could not read the document you uploaded. Please upload a clear, straight photo or scan of the whole page with all four corners visible.',
  expired:
    'The document you uploaded has expired. Please upload your current one.',
  information_missing:
    'The document you uploaded is missing the issue date or the name of the organisation that issued it. Please upload a copy that shows both.',
  name_mismatch:
    'The name on the document you uploaded does not match the name on your profile. Please upload the document in your own name, or update your profile name if it has changed.',
  wrong_document_type:
    'The file you uploaded is not the document this section asks for. Please check you have picked the right file.',
  issuer_not_confirmed:
    'We could not confirm the organisation that issued this document. Please upload a document issued by the official body for this credential.',
  does_not_meet_requirement:
    'The document you uploaded does not cover everything this credential requires. Please upload a document that does.',
  appears_altered:
    'Some details on the document you uploaded do not look original. Please upload an unedited copy straight from the issuer.',
  other:
    'We could not accept the document you uploaded for this credential. Please upload the certificate, licence or result itself.',
};

/** The document kinds the model may answer with, mapped back to our slots. */
const KIND_TO_SLOT: Record<string, string> = {
  caregiver_certificate: 'certifications',
  cpr_card: 'cpr_test',
  tb_test: 'tb_tests',
  driver_license: 'driver_license',
  auto_insurance: 'auto_insurance',
  background_check: 'gchexs',
};

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const extensionOf = (url: string): string => {
  const name = String(url).split(/[?#]/)[0].split('/').pop() || '';
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
};

const normaliseName = (value?: string | null): string =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The document is in the right name when the parts of the profile name all
 * appear on it, or one string contains the other. Middle names, initials and a
 * different order are all normal on a real certificate, so this is deliberately
 * loose: it exists to catch somebody uploading another person's document, not
 * to police spelling.
 */
const namesMatch = (onFile: string, onDocument: string): boolean => {
  const a = normaliseName(onFile);
  const b = normaliseName(onDocument);
  if (!a || !b) return true;
  if (a === b || b.includes(a) || a.includes(b)) return true;
  const parts = a.split(' ').filter((p) => p.length > 2);
  if (!parts.length) return true;
  return parts.every((p) => b.includes(p));
};

const asDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** The model is told to answer with JSON; a fenced block is still possible. */
const parseJson = (text: string): any => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('the model did not return JSON');
  return JSON.parse(text.slice(start, end + 1));
};

const buildPrompt = (expected: string, caregiverName: string): string =>
  [
    'You are helping a healthcare credentialing administrator in Georgia, USA check one uploaded document.',
    '',
    `The caregiver is named: ${caregiverName || 'unknown'}`,
    `They uploaded this file as: ${expected}.`,
    '',
    'Read the document and answer with JSON only, no prose, exactly these keys:',
    '{',
    '  "documentKind": one of "caregiver_certificate" | "cpr_card" | "tb_test" | "driver_license" | "auto_insurance" | "background_check" | "other",',
    '  "holderName": the full name printed on the document, or null,',
    '  "credentialIdNumber": the licence, certificate or policy number printed on it, or null,',
    '  "issueDate": "YYYY-MM-DD" or null,',
    '  "expirationDate": "YYYY-MM-DD" or null,',
    '  "hasNoExpiration": true only if the document states that it does not expire,',
    '  "imageQuality": "good" if the characters on the page can be made out, "poor" only if the image itself is too blurred, dark, skewed or cut off to read them,',
    '  "issuingOrganization": the body that issued it, as printed, or null,',
    '  "issuerIsRecognisedAuthority": true if the issuer is the kind of body that can issue this credential — a driver license must come from a government motor-vehicle authority, insurance from a licensed insurer, a TB result from a clinic or laboratory, a certificate from a training provider or school; false if the issuer is a private outfit with no such standing, such as a club or association selling its own "international" document; null if you cannot tell,',
    '  "isAboutThisCredential": true if this document concerns the credential named above at all, even if it is not the credential itself; false if it is about something else entirely,',
    '  "isCredentialEvidence": true if this document is itself the certificate, licence, card, form or result that records the credential — a form with some fields left blank is still the record, so answer true. Answer false only when the document exists for some other purpose: an appointment or reminder letter, a booking confirmation, a receipt, an invoice, an application, instructions, or a request for documents,',
    '  "meetsRequirement": false ONLY when the document is the right kind, from the right sort of issuer and readable, but its CONTENT stops short of what was asked for above — a CPR card covering CPR but not First Aid is the example. If the trouble is that it is the wrong kind of document, the wrong person, out of date, unreadable, missing fields, or not the credential itself, answer null and let the field for that say so. true when it covers everything; null when you cannot tell,',
    '  "requirementProblem": one short sentence naming what it falls short of, or null,',
    '  "alterationSigns": one short sentence describing visible signs that a value was edited, pasted over, retyped, whited out or set in a mismatched font; null if you see none,',
    '  "confidence": a number from 0 to 1, how sure you are of the fields above,',
    '  "notes": one short sentence for the administrator, or "",',
    '  "caregiverMessage": if anything is wrong, one or two plain sentences telling the caregiver what to upload instead, addressed to them; otherwise ""',
    '}',
    '',
    'Rules: never invent a value — use null when it is not printed on the document.',
    'Convert dates exactly as printed into YYYY-MM-DD.',
    'For a screening or renewal record, use the date it was performed or issued as issueDate.',
    // The two mistakes this reader actually made on real-shaped documents, in
    // the order it made them. Both were layout assumptions, not reading errors.
    // Without this, a QA specimen watermark came back readable:false on a
    // perfectly crisp page — and because "unreadable" is judged first, it hid
    // the reason the document was actually wrong.
    '"imageQuality" is about the picture, never about whether you would accept the document. If you were able to read ANY of the values above off the page, answer "good". A watermark, a SPECIMEN, SAMPLE, VOID or COPY marking, a stamp, a coloured background, a disclaimer, or a line saying the document is a test or is not valid, has nothing to do with image quality — answer "good" anyway and report the real problem in the other fields.',
    'Likewise "alterationSigns" means visible evidence that a value on the page was edited after it was issued: a figure in a mismatched font, a patch pasted over a date, whiteout, a line that does not sit straight with the rest. A watermark, a stamp, a specimen marking or a disclaimer is not a sign of alteration — answer null.',
    'Judge the document on what it says it is. A marking that it is a specimen or a copy does not change its documentKind, its issuer or whether it meets the requirement.',
    'A label is not always printed before its value. On certification cards the value is printed on a rule with its label in small type DIRECTLY UNDERNEATH it. Pair a label with the value above it when that is how the document is set.',
    'Only the number identifying THIS credential counts as credentialIdNumber. A training centre, training site, instructor, school, employer, clinic, laboratory, billing account, student or employee number is never it; neither is the issuer\'s own licence number, a nurse\'s licence number, a form or revision number, a specimen or lot number, a document discriminator, an NAIC code or a vehicle identification number. If the only numbers on the page are of that kind, answer null.',
    'issueDate is the date printed on the document for this credential — the date it was issued, examined, evaluated, collected or placed. A date of hire, a date of birth, a training date range, a print or submission date and a signature date are not it.',
    'When a renewal is printed as a month with no day, the credential is valid through the LAST day of that month.',
  ].join('\n');

/**
 * Ask the model to read one document.
 *
 * Only the first page is sent: a credential prints what matters on page one,
 * and a long scan would otherwise cost tokens and seconds for nothing — this
 * runs inside a request the admin is sitting and waiting on.
 */
const readDocument = async (
  url: string,
  expected: string,
  caregiverName: string
): Promise<any> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(httpStatus.BAD_GATEWAY, 'The stored file could not be downloaded');
  }
  let bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This file is too large to read automatically');
  }

  const ext = extensionOf(url);
  const headerType = (res.headers.get('content-type') || '').split(';')[0].trim();
  const isPdf = ext === 'pdf' || headerType === 'application/pdf';
  const imageMime =
    IMAGE_MIME[ext] || (headerType.startsWith('image/') ? headerType : '');

  if (!isPdf && !imageMime) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Only PDF and image credentials can be read automatically'
    );
  }

  if (isPdf) {
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (src.getPageCount() > 1) {
        const out = await PDFDocument.create();
        const [first] = await out.copyPages(src, [0]);
        out.addPage(first);
        bytes = Buffer.from(await out.save());
      }
    } catch {
      // Not splittable (encrypted, or not really a PDF). Send it as it is and
      // let the model report whether it could read anything.
    }
  }

  const b64 = bytes.toString('base64');
  const filePart = isPdf
    ? {
        type: 'input_file',
        filename: 'credential.pdf',
        file_data: `data:application/pdf;base64,${b64}`,
      }
    : { type: 'input_image', image_url: `data:${imageMime};base64,${b64}` };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const ai = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openai_api_key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        max_output_tokens: 700,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildPrompt(expected, caregiverName) },
              filePart,
            ],
          },
        ],
      }),
    });
    const body: any = await ai.json().catch(() => ({}));
    if (!ai.ok) {
      console.error(
        '[credential-ai] OpenAI refused:',
        ai.status,
        body?.error?.message || JSON.stringify(body).slice(0, 300)
      );
      throw new ApiError(
        httpStatus.BAD_GATEWAY,
        'The document could not be read automatically. Enter the details by hand.'
      );
    }
    const text = (body.output ?? [])
      .flatMap((item: any) => item?.content ?? [])
      .filter((part: any) => part?.type === 'output_text')
      .map((part: any) => part.text)
      .join('')
      .trim();
    if (!text) throw new Error('the model returned nothing');
    return parseJson(text);
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    console.error('[credential-ai] read failed:', err?.message);
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'The document could not be read automatically. Enter the details by hand.'
    );
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Read one credential and store what was found on the document row.
 *
 * The warnings are worked out HERE, in plain code, from the fields the model
 * read — they are not asked of the model. Whether a date has passed, or a name
 * matches the profile, is arithmetic and string comparison: it has to give the
 * same answer every time, and be explainable to whoever asks why a credential
 * was flagged.
 */
export const extractCredential = async (documentId: string) => {
  if (!isCredentialAiConfigured()) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Automatic reading is not configured on this environment'
    );
  }

  const doc = await Documents.findById(documentId);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  if (!doc.url) throw new ApiError(httpStatus.BAD_REQUEST, 'This document has no file');

  const [info, prof] = await Promise.all([
    PersonalInfo.findOne({ user: doc.user }).select('firstName lastName'),
    ProfessionalInfo.findOne({ user: doc.user }).select('role'),
  ]);
  const caregiverName = `${info?.firstName || ''} ${info?.lastName || ''}`.trim();

  const slot = String(doc.documentType || '');
  const role = (prof as any)?.role;
  const expected =
    slot === 'certifications' && role
      ? `a ${role} certificate`
      : EXPECTED[slot] || 'a credential document';

  const read = await readDocument(doc.url, expected, caregiverName);

  const warnings: Array<{ code: string; detail: string }> = [];
  const issueDate = asDate(read.issueDate);
  const expirationDate = asDate(read.expirationDate);

  // Pushed in the order an admin would notice them, because the first one
  // becomes the suggested rejection reason: can it be read at all, is it
  // genuine, is it the right document, is it the right person, is it current,
  // does it go far enough, is the issuer real, is anything missing.
  // Did the model manage to read anything off the page at all? This is what
  // decides "unreadable", not the model's own opinion of the document: it kept
  // answering that a perfectly crisp page was unreadable because it carried a
  // watermark or a disclaimer, and because unreadable outranked everything the
  // real reason never surfaced. A page nothing could be read off is unreadable;
  // a page with values on it is not, whatever is stamped across it.
  const readAnything = !!(
    read.credentialIdNumber ||
    read.issueDate ||
    read.expirationDate ||
    read.issuingOrganization ||
    read.holderName
  );
  const poorImage = read.imageQuality === 'poor' || read.readable === false;

  // Specific reasons first: the first one pushed becomes the suggested
  // rejection reason, and an admin wants to be told what is actually wrong
  // before being told the picture could be better.
  const readSlot = KIND_TO_SLOT[String(read.documentKind)];
  const aboutThisCredential = read.isAboutThisCredential !== false;
  if (readSlot && slot && readSlot !== slot) {
    warnings.push({
      code: 'wrong_document_type',
      detail: `This looks like ${EXPECTED[readSlot] || readSlot}, but it was uploaded as ${expected}.`,
    });
  } else if (slot && !readSlot && !aboutThisCredential) {
    // A perfectly good document about something else entirely — a utility
    // bill, a payslip. There is no slot to name it by, so say what it is not.
    warnings.push({
      code: 'wrong_document_type',
      detail: `This is not ${expected}.`,
    });
  }

  if (read.holderName && !namesMatch(caregiverName, read.holderName)) {
    warnings.push({
      code: 'name_mismatch',
      detail: `The document is in the name of "${read.holderName}", the profile says "${caregiverName}".`,
    });
  }
  if (expirationDate && expirationDate.getTime() < Date.now()) {
    warnings.push({
      code: 'expired',
      detail: `It expired on ${expirationDate.toISOString().slice(0, 10)}.`,
    });
  }
  if (read.issuerIsRecognisedAuthority === false) {
    warnings.push({
      code: 'issuer_not_confirmed',
      detail: `"${read.issuingOrganization || 'The issuer'}" is not a body that can issue this credential.`,
    });
  }

  if (poorImage && !readAnything) {
    warnings.push({
      code: 'unreadable',
      detail: 'Nothing could be read off the file.',
    });
  }

  // "Other reason" is the bucket for a document that fits none of the eight
  // named reasons: a notice, an appointment letter, a receipt about the right
  // credential that simply is not the credential. It is judged before
  // "information missing" because it says what the document IS, which is more
  // use to a caregiver than being told a field is absent from a page that was
  // never going to carry it.
  if (read.isCredentialEvidence === false && aboutThisCredential && !warnings.length) {
    warnings.push({
      code: 'other',
      detail: 'This is not the certificate, licence or result itself.',
    });
  }
  if (!issueDate || !read.issuingOrganization) {
    warnings.push({
      code: 'information_missing',
      detail: 'The issue date or the issuing organisation is not printed on the document.',
    });
  }

  // After the objective checks, not before them. Whether a document looks
  // tampered with is the one judgement here that cannot be verified in code,
  // and the model reaches for it unevenly — the same expired TB record came
  // back clean on one run and "altered" on the next. Ranked first it hid the
  // expiry, which is checkable and is what the caregiver can actually act on.
  // It still escalates to a person wherever it does fire.
  if (read.alterationSigns) {
    warnings.push({
      code: 'appears_altered',
      detail: String(read.alterationSigns),
    });
  }

  // Last, because it is the reason that fits when nothing else does: the
  // document is the right one, from the right issuer, current and legible, and
  // still does not go far enough. Judged first, the model reached for it
  // whenever it disliked a document for some other reason.
  if (read.meetsRequirement === false) {
    warnings.push({
      code: 'does_not_meet_requirement',
      detail:
        String(read.requirementProblem || '').trim() ||
        'It does not cover everything this credential requires.',
    });
  }

  // Reasons this credential's own matrix does not allow — the registry check
  // that would back them does not exist yet, so the AI must not raise them.
  const blocked = NOT_APPLICABLE[slot] || [];
  const applicable = warnings.filter((w) => !blocked.includes(w.code));

  const suggestedReasonCode = applicable.length ? applicable[0].code : null;
  const caregiverMessage = applicable.length
    ? String(read.caregiverMessage || '').trim() ||
      DEFAULT_MESSAGE[suggestedReasonCode as string] ||
      DEFAULT_MESSAGE.other
    : '';

  const aiExtraction = {
    model: MODEL,
    extractedAt: new Date(),
    holderName: read.holderName ?? null,
    documentKind: read.documentKind ?? null,
    readable: !(poorImage && !readAnything),
    imageQuality: read.imageQuality || (read.readable === false ? 'poor' : 'good'),
    confidence: typeof read.confidence === 'number' ? read.confidence : null,
    notes: read.notes || '',
    fields: {
      credentialIdNumber: read.credentialIdNumber ?? null,
      credentialIssueDate: issueDate,
      credentialExpirationDate: expirationDate,
      issuingOrganization: read.issuingOrganization ?? null,
      hasNoExpiration: read.hasNoExpiration === true,
    },
    warnings: applicable,
    // The admin decides. This is the opinion, stored so it can be compared with
    // what the admin actually did.
    suggestion: applicable.length ? 'reject' : 'approve',
    suggestedReasonCode,
    // What the caregiver would be told, so the admin can accept it as written
    // or rewrite it before it is sent.
    caregiverMessage,
    // Automation must stop here and wait for a person: either the reason is one
    // the AI may only suggest, or confirming would mean inventing the two
    // fields reviewDocument requires.
    needsHuman:
      (suggestedReasonCode !== null && AI_SUGGEST_ONLY.includes(suggestedReasonCode)) ||
      (!applicable.length && (!issueDate || !read.issuingOrganization)) ||
      // No name read off the document means the name check never ran, and a
      // check that did not run is not a check that passed. On one run this
      // confirmed a certificate made out to somebody else entirely. Automation
      // stops here; an admin can still confirm it by eye.
      (!applicable.length && !read.holderName),
  };

  await Documents.findByIdAndUpdate(documentId, { $set: { aiExtraction } });
  return aiExtraction;
};
