import { REQUIRED_CREDENTIAL_KEYS } from '../../../constants/credentials';
import { Documents } from './documents.model';
import { DocumentService } from './document.service';
import { extractCredential, isCredentialAiConfigured } from './credential-ai.service';
import { getAiSettings } from './credential-ai.settings';

/**
 * Letting the AI actually decide.
 *
 * `extractCredential` only ever reads and stores an opinion. This is the layer
 * that acts on it — confirming the credential, or marking it not confirmed with
 * a reason and a message to the caregiver. It is used from two places:
 *
 *  - the admin's "Run AI check" button, which sweeps one caregiver on demand;
 *  - the upload handler, when AI automation is switched on.
 *
 * It refuses to decide in the cases the reader itself flagged as needing a
 * person, and it never touches a credential an admin has already reviewed.
 */

export type AiDecision =
  | 'confirmed'
  | 'not_confirmed'
  | 'needs_human'
  | 'skipped'
  | 'failed';

export interface AiDecisionResult {
  documentId: string;
  documentType: string;
  part?: string | null;
  decision: AiDecision;
  reasonCode?: string | null;
  message?: string;
  /** Why it was skipped or could not be decided — for the admin, in plain words. */
  detail?: string;
  confidence?: number | null;
}

const isCredentialSlot = (documentType?: string | null): boolean =>
  (REQUIRED_CREDENTIAL_KEYS as readonly string[]).includes(String(documentType));

/**
 * Read one credential and act on what was read.
 *
 * `reviewDocument` refuses to confirm without an issue date and an issuing
 * organisation, and without either an expiry or the no-expiration flag. Rather
 * than let that throw, the cases it would reject are turned into `needs_human`
 * here, so the admin sees "waiting for you" instead of an error.
 */
export const decideCredential = async (
  documentId: string
): Promise<AiDecisionResult> => {
  const doc = await Documents.findById(documentId).select(
    'documentType part reviewStatus url'
  );
  const base = {
    documentId,
    documentType: String(doc?.documentType || ''),
    part: doc?.part ?? null,
  };

  if (!doc) return { ...base, decision: 'skipped', detail: 'Document not found' };
  if (!doc.url) return { ...base, decision: 'skipped', detail: 'No file on this document' };
  if (!isCredentialSlot(doc.documentType)) {
    return { ...base, decision: 'skipped', detail: 'Not one of the required credentials' };
  }
  // Never overrule a human, and never re-decide something already decided.
  if (doc.reviewStatus && doc.reviewStatus !== 'pending') {
    return { ...base, decision: 'skipped', detail: 'Already reviewed' };
  }

  let ai: any;
  try {
    ai = await extractCredential(documentId);
  } catch (err: any) {
    return {
      ...base,
      decision: 'failed',
      detail: err?.message || 'The document could not be read',
    };
  }

  const confidence = typeof ai.confidence === 'number' ? ai.confidence : null;

  if (ai.needsHuman) {
    return {
      ...base,
      decision: 'needs_human',
      reasonCode: ai.suggestedReasonCode ?? null,
      confidence,
      detail: ai.suggestedReasonCode
        ? 'This reason has to be decided by a person.'
        : 'Nothing looked wrong, but the issue date or the issuing organisation is not on the document.',
    };
  }

  if (ai.suggestion === 'reject') {
    await DocumentService.reviewDocument(documentId, {
      reviewStatus: 'rejected',
      rejectionReasonCode: ai.suggestedReasonCode,
      rejectionReason: ai.caregiverMessage,
      requestReplacement: true,
      aiSuggestedReason: ai.suggestedReasonCode,
    } as any);
    return {
      ...base,
      decision: 'not_confirmed',
      reasonCode: ai.suggestedReasonCode,
      message: ai.caregiverMessage,
      confidence,
    };
  }

  const f = ai.fields || {};
  if (!f.hasNoExpiration && !f.credentialExpirationDate) {
    return {
      ...base,
      decision: 'needs_human',
      confidence,
      detail: 'No expiry is printed on the document, so it cannot be confirmed automatically.',
    };
  }

  await DocumentService.reviewDocument(documentId, {
    reviewStatus: 'approved',
    credentialIdNumber: f.credentialIdNumber || undefined,
    credentialIssueDate: f.credentialIssueDate,
    credentialExpirationDate: f.hasNoExpiration ? undefined : f.credentialExpirationDate,
    issuingOrganization: f.issuingOrganization,
    hasNoExpiration: f.hasNoExpiration === true,
    aiSuggestedReason: null,
  } as any);

  // Recorded on the document so an audit can tell a confirmation nobody looked
  // at from one an admin pressed.
  await Documents.findByIdAndUpdate(documentId, {
    $set: { 'aiExtraction.autoDecided': true, 'aiExtraction.autoDecidedAt': new Date() },
  });

  return { ...base, decision: 'confirmed', confidence };
};

/**
 * Sweep every required credential of one caregiver. Used by the admin's
 * "Run AI check" button, which is why it reports on skipped documents too —
 * the admin needs to see that nothing was silently passed over.
 */
export const decideAllForUser = async (userId: string) => {
  if (!isCredentialAiConfigured()) {
    return {
      ran: false,
      reason: 'Automatic reading is not configured on this environment',
      results: [] as AiDecisionResult[],
    };
  }

  const docs = await Documents.find({
    user: userId,
    documentType: { $in: REQUIRED_CREDENTIAL_KEYS as unknown as string[] },
  })
    .select('_id documentType part reviewStatus createdAt')
    .sort({ createdAt: 1 });

  const results: AiDecisionResult[] = [];
  // Deliberately sequential. Each read is an upload to the model, and a
  // caregiver has at most six credentials — firing them together buys a second
  // or two and risks rate limiting the account for every other admin.
  for (const d of docs) {
    results.push(await decideCredential(String(d._id)));
  }

  const count = (decision: AiDecision) =>
    results.filter((r) => r.decision === decision).length;

  return {
    ran: true,
    results,
    summary: {
      confirmed: count('confirmed'),
      notConfirmed: count('not_confirmed'),
      needsHuman: count('needs_human'),
      skipped: count('skipped'),
      failed: count('failed'),
    },
  };
};

/**
 * Called after a caregiver uploads a credential. Does nothing unless an admin
 * has switched AI automation on, and never throws — a failure here must not
 * fail the upload the caregiver just made.
 */
export const autoDecideOnUpload = async (documentId?: string): Promise<void> => {
  if (!documentId) return;
  try {
    if (!isCredentialAiConfigured()) return;
    const settings = await getAiSettings();
    if (!settings.automationEnabled) return;
    await decideCredential(documentId);
  } catch (err: any) {
    console.error('[credential-ai] auto decision failed:', err?.message);
  }
};
