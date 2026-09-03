/**
 * SCRUM-117/118: e-signature emails.
 *
 * Every caregiver-facing communication in the signing flow ships via email in
 * addition to in-app (2026-08-31 meeting decision), and the agency's signing-
 * complete notice ships via email for the same reason SCRUM-108 did it for
 * credential alerts: in-app alone is missed when nobody is in the app, which
 * stalls onboarding at the exact moment WeVoro is meant to speed it up.
 *
 * Templates ride the shared SCRUM-108 layout (email-layout.ts) so the whole
 * family looks the same. No preferences footer: WeVoro has no notification
 * preferences system yet, so a link implying control would be misleading.
 */

import { User } from '../user/user.model';
import { PersonalInfo } from '../user/personal-info.model';
import { sendEmail } from '../auth/sendMail';
import {
  EMAIL_COLORS as C,
  emailAppUrl,
  emailDetailRow,
  escapeHtml,
  renderAlertEmail,
} from '../notification/email-layout';

const CAREGIVER_FOOTER =
  'You&rsquo;re receiving this automated alert because an agency on WeVoro is waiting on your documents.';
const AGENCY_FOOTER =
  'You&rsquo;re receiving this automated alert because a caregiver connected to your agency completed their signing documents.';

const firstNameOf = async (userId: string): Promise<string> => {
  const info = await PersonalInfo.findOne({ user: userId }).select('firstName');
  return escapeHtml(info?.firstName || 'there');
};

const deliver = async (userId: string, subject: string, html: string, tag: string) => {
  try {
    const user = await User.findById(userId).select('email');
    if (!user?.email) {
      console.warn(`[esign] no email on record for user ${userId}; skipped ${tag}`);
      return;
    }
    await sendEmail(user.email, subject, html);
    console.log(`[esign] ${tag} email sent to ${user.email}`);
  } catch (err: any) {
    // A mail failure must never break the signing flow or the cron.
    console.error(`[esign] ${tag} email FAILED for user ${userId}:`, err?.message);
  }
};

/**
 * SCRUM-118: reminder while signing is stalled (Step 1 done, Step 2 not).
 * Copy and structure follow Faisal's approved template (Figma 10547:3949):
 * pencil emblem, SIGNATURE NEEDED eyebrow, role in the heading, a DOCUMENTS /
 * FROM detail card, "Review & sign documents", the reminder number, and the
 * SignWell-on-behalf-of footer.
 */
export const sendSignatureReminderEmail = async (params: {
  caregiverId: string;
  agencyName: string;
  pendingCount: number;
  role: string;
  /** 1-based position in the escalation, shown as "reminder N". */
  reminderNumber: number;
}): Promise<void> => {
  const { caregiverId, agencyName, pendingCount, role, reminderNumber } = params;
  const n = pendingCount;
  const docWord = n === 1 ? 'document' : 'documents';
  const agency = escapeHtml(agencyName);
  const html = renderAlertEmail({
    emblem: 'emblem-sign.png',
    eyebrow: 'SIGNATURE NEEDED',
    accent: C.amber,
    heading: `Please sign your ${escapeHtml(role)} documents`,
    greetingName: await firstNameOf(caregiverId),
    intro: `${agency} is waiting on your signature on ${n} ${docWord} to finish onboarding. It only takes a minute to sign them securely online &mdash; no printing or scanning needed.`,
    detailRowsHtml:
      emailDetailRow('DOCUMENTS', `${n} ${docWord} (${escapeHtml(role)})`, 0) +
      emailDetailRow('FROM', agency, 14),
    cta: 'Review &amp; sign documents',
    ctaHref: `${emailAppUrl()}/pro/offers`,
    note: `This is reminder ${reminderNumber} of your signature request. You&rsquo;ll stop receiving these once all documents are signed.`,
    footerLine: `Sent securely via SignWell on behalf of ${agency}.`,
  });
  await deliver(
    caregiverId,
    `Please sign your ${role} documents`,
    html,
    'reminder'
  );
};

/** SCRUM-117: a document awaiting the caregiver's signature was replaced. */
export const sendDocumentReplacedEmail = async (params: {
  caregiverId: string;
  agencyName: string;
  documentTitle: string;
}): Promise<void> => {
  const { caregiverId, agencyName, documentTitle } = params;
  const html = renderAlertEmail({
    emblem: 'emblem-replaced.png',
    eyebrow: 'DOCUMENT UPDATED',
    accent: C.amber,
    heading: 'A document you were signing was updated',
    greetingName: await firstNameOf(caregiverId),
    intro: `${escapeHtml(agencyName)} replaced one of the documents in your signing packet. The earlier version is no longer valid &mdash; please review and sign the new version.`,
    detailRowsHtml:
      emailDetailRow('DOCUMENT', escapeHtml(documentTitle), 0) +
      emailDetailRow('AGENCY', escapeHtml(agencyName), 14),
    cta: 'Review & sign new version',
    ctaHref: `${emailAppUrl()}/pro/offers`,
    note: 'This is an automated alert from WeVoro.',
    footerLine: CAREGIVER_FOOTER,
  });
  await deliver(caregiverId, `Updated: ${documentTitle} needs your signature again`, html, 'replaced');
};

/** SCRUM-117: agency notice on FULL completion only — never per-document. */
export const sendSigningCompleteEmail = async (params: {
  agencyId: string;
  caregiverName: string;
  role: string;
  count: number;
}): Promise<void> => {
  const { agencyId, caregiverName, role, count } = params;
  const docWord = count === 1 ? 'document' : 'documents';
  const html = renderAlertEmail({
    emblem: 'emblem-complete.png',
    eyebrow: 'SIGNING COMPLETE',
    accent: C.green,
    heading: `${escapeHtml(caregiverName)} signed all your documents`,
    greetingName: await firstNameOf(agencyId),
    intro: `${escapeHtml(caregiverName)} has completed every ${escapeHtml(role)} signing ${docWord} for your agency. Nothing else is needed from them on this step.`,
    detailRowsHtml:
      emailDetailRow('CAREGIVER', escapeHtml(caregiverName), 0) +
      emailDetailRow('SIGNED', `${count} of ${count} ${docWord}`, 14),
    cta: 'View caregiver',
    ctaHref: `${emailAppUrl()}/partner/onboardings`,
    note: 'This is an automated alert from WeVoro.',
    footerLine: AGENCY_FOOTER,
  });
  await deliver(agencyId, `${caregiverName} signed all your documents`, html, 'complete');
};

/** SCRUM-118: offer-received parity email (in-app existed already). */
export const sendOfferReceivedEmail = async (params: {
  caregiverId: string;
  agencyName: string;
  signCount: number;
}): Promise<void> => {
  const { caregiverId, agencyName, signCount } = params;
  const extra =
    signCount > 0
      ? ` It includes ${signCount} ${signCount === 1 ? 'document' : 'documents'} to sign, so have a couple of minutes ready.`
      : '';
  const html = renderAlertEmail({
    emblem: 'emblem-offer.png',
    eyebrow: 'NEW OFFER',
    accent: C.green,
    heading: `${escapeHtml(agencyName)} sent you an offer`,
    greetingName: await firstNameOf(caregiverId),
    intro: `you have a new offer waiting on WeVoro.${extra}`,
    detailRowsHtml: emailDetailRow('FROM', escapeHtml(agencyName), 0),
    cta: 'View offer',
    ctaHref: `${emailAppUrl()}/pro/offers`,
    note: 'This is an automated alert from WeVoro.',
    footerLine: CAREGIVER_FOOTER,
  });
  await deliver(caregiverId, `${agencyName} sent you an offer on WeVoro`, html, 'offer-received');
};
