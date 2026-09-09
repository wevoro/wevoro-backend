import axios from 'axios';
import JSZip from 'jszip';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import config from '../../../config';

/**
 * SCRUM-118: turning a signature into a document the agency can actually hold.
 *
 * Recording the signature in the database is not enough — nobody can hand a
 * mongo row to an auditor. This burns the caregiver's hand-drawn signature and
 * the WeVoro mark onto the original PDF, appends a certificate page carrying
 * the audit trail, and packages the finished set as a ZIP.
 *
 * Everything runs in memory; the results go to the same Bunny CDN the rest of
 * the platform uses.
 */

const GREEN = rgb(0, 0.502, 0);
const INK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.37, 0.41, 0.39);

const cdnBase = (): string => {
  const base = String(config.bunny.cdn_url || '').replace(/\/+$/, '');
  return base.startsWith('http') ? base : `https://${base}`;
};

/** Push bytes to the CDN and return the public URL. */
const upload = async (fileName: string, bytes: Buffer, contentType: string): Promise<string> => {
  const unique = `esign/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${fileName}`;
  await axios.put(
    `https://storage.bunnycdn.com/${config.bunny.storage_zone}/${unique}`,
    bytes,
    { headers: { AccessKey: config.bunny.api_key as string, 'Content-Type': contentType } }
  );
  return `${cdnBase()}/${unique}`;
};

const fetchBytes = async (url: string): Promise<Buffer> => {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
  return Buffer.from(res.data);
};

const safeName = (s: string): string =>
  String(s || 'document').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_') || 'document';

export interface SignStampInput {
  /** Public URL of the document being signed. */
  fileUrl: string;
  title: string;
  /** Hand-drawn signature as a PNG data URL. */
  signatureImage?: string;
  signerName: string;
  stampId: string;
  signedAt: Date;
  ip?: string;
  userAgent?: string;
  agencyName: string;
}

/**
 * Stamp one document and return the signed bytes plus the hash of the original,
 * so the certificate can prove which version was signed.
 */
/**
 * A drawing only counts if pdf-lib can actually burn it onto the page.
 * `startsWith('data:image')` is not that test — the literal 10-character
 * string "data:image" passes it, and the stamper then printed the signer's
 * name instead, producing exactly the document the signature check exists to
 * prevent: one that asserts a signature nobody ever made.
 */
export const isDrawnSignature = (value?: string | null): boolean => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(
    String(value || '')
  );
  if (!m) return false;
  const bytes = Buffer.from(m[1], 'base64');
  return (
    bytes.length > 8 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  );
};

export const buildSignedPdf = async (
  input: SignStampInput
): Promise<{ bytes: Buffer; sourceHash: string }> => {
  const original = await fetchBytes(input.fileUrl);
  const sourceHash = crypto.createHash('sha256').update(original).digest('hex');

  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // --- the signature block, stamped at the foot of the last page ---
  const pages = pdf.getPages();
  const last = pages[pages.length - 1];
  const { width } = last.getSize();

  // The block was 260x92 with only 34pt of height for the drawing itself, which
  // squeezed a real signature down to a few millimetres and clipped tall ones —
  // raised in review as a legal/acceptance risk on a document an auditor reads.
  // It is now roomy enough for a full-size signature, and every metadata line
  // sits on its own row instead of sharing one.
  const boxW = 300;
  const boxH = 140;
  const boxX = 56;
  const boxY = 48;

  last.drawRectangle({
    x: boxX, y: boxY, width: boxW, height: boxH,
    borderColor: GREEN, borderWidth: 1.2,
    color: rgb(0.945, 0.984, 0.957),
  });

  // The caregiver's own drawing is the mark. It sits in the middle of the block
  // between "Signed by" and the WeVoro line; the name, time and id are metadata
  // underneath rather than the signature itself.
  last.drawText('Signed by', { x: boxX + 12, y: boxY + boxH - 16, size: 7, font: helv, color: MUTED });

  let drewSignature = false;
  if (isDrawnSignature(input.signatureImage)) {
    try {
      const b64 = (input.signatureImage as string).split(',')[1] || '';
      const png = await pdf.embedPng(Buffer.from(b64, 'base64'));
      const maxW = boxW - 24;
      const maxH = 62;
      const scale = Math.min(maxW / png.width, maxH / png.height, 1);
      const drawnW = png.width * scale;
      const drawnH = png.height * scale;
      // Sit the drawing on the baseline of its band and centre it in the leftover
      // width, so a short signature does not float and a wide one still starts
      // level with the labels beneath it.
      last.drawImage(png, {
        x: boxX + 12 + Math.max(0, (maxW - drawnW) / 2),
        y: boxY + 46,
        width: drawnW,
        height: drawnH,
      });
      drewSignature = true;
    } catch {
      // Swallowed deliberately — the throw below is the single place that
      // decides what an unembeddable drawing means.
    }
  }
  if (!drewSignature) {
    // Refuse rather than print the name. Falling back to typed text produced a
    // legal-looking document with no signature on it, and signItem then marked
    // the item signed. A caller that genuinely has no drawing is rejected
    // earlier, so reaching here means the drawing was unusable.
    throw new Error('The signature could not be embedded into the document');
  }

  last.drawText(`${input.signerName}  ·  WeVoro`, {
    x: boxX + 12, y: boxY + 32, size: 8, font: helvBold, color: GREEN,
  });
  last.drawText(input.signedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC', {
    x: boxX + 12, y: boxY + 21, size: 6.5, font: helv, color: MUTED,
  });
  // Its own line now. Sharing a row with the timestamp meant a long id ran into
  // the edge of the block, and agencies need this readable — they quote it in
  // their state audit records.
  last.drawText(`Signature ID ${input.stampId}`, {
    x: boxX + 12, y: boxY + 10, size: 6.5, font: helv, color: MUTED,
  });

  // --- certificate of completion ---
  const cert = pdf.addPage([width, 792]);
  let y = 720;
  const line = (text: string, size = 10, font = helv, color = INK, gap = 18) => {
    cert.drawText(text, { x: 56, y, size, font, color });
    y -= gap;
  };

  line('Certificate of Completion', 18, helvBold, INK, 30);
  line('This page is generated by WeVoro and records how the document above was signed.', 9, helv, MUTED, 28);

  const rows: Array<[string, string]> = [
    ['Document', input.title],
    ['Signed by', input.signerName],
    ['Signature ID', input.stampId],
    ['Signed at', `${input.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC`],
    ['Sent by', input.agencyName],
    ['IP address', input.ip || 'not recorded'],
    ['Browser', (input.userAgent || 'not recorded').slice(0, 90)],
    ['Document hash', `sha256:${sourceHash}`],
  ];
  for (const [label, value] of rows) {
    cert.drawText(label.toUpperCase(), { x: 56, y, size: 7, font: helvBold, color: MUTED });
    y -= 13;
    cert.drawText(value, { x: 56, y, size: 10, font: helv, color: INK });
    y -= 22;
  }

  y -= 6;
  cert.drawText(
    'The hash identifies the exact version of the document that was signed.',
    { x: 56, y, size: 8, font: helv, color: MUTED }
  );

  return { bytes: Buffer.from(await pdf.save()), sourceHash };
};

/** Stamp and store one document, returning its public URL. */
export const stampAndStore = async (input: SignStampInput): Promise<string> => {
  const { bytes } = await buildSignedPdf(input);
  return upload(`${safeName(input.title)}-signed.pdf`, bytes, 'application/pdf');
};

/**
 * Bundle every signed document into one ZIP and store it. Returned as both a
 * URL (for the agency's account) and bytes (to attach to the email), so the
 * documents are only built once.
 */
export const buildPackage = async (params: {
  caregiverName: string;
  role: string;
  files: Array<{ title: string; url: string }>;
}): Promise<{ url: string; bytes: Buffer; fileName: string }> => {
  const zip = new JSZip();
  for (const f of params.files) {
    try {
      zip.file(`${safeName(f.title)}.pdf`, await fetchBytes(f.url));
    } catch (err: any) {
      console.error(`[esign] could not add ${f.title} to the package:`, err?.message);
    }
  }
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const fileName = `${safeName(params.caregiverName)}-${params.role}-signed-documents.zip`;
  const url = await upload(fileName, bytes, 'application/zip');
  return { url, bytes, fileName };
};
