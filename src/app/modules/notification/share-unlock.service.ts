/**
 * SCRUM-133: when a caregiver's share link is unlocked, and telling them the
 * moment it happens.
 *
 * ONE RULE. The caregiver's own share card (frontend share-profile-gate.tsx
 * #getShareGate), the public /p/<shareId> lookup (user.service
 * #getUserByShareId) and the "your link is ready" alert below all ask the same
 * question, so they read the same answer. When they disagreed, the card said
 * "Agencies can see your profile only after all 5 credentials are verified"
 * while the public link opened for a caregiver with 0 of 5.
 *
 * A required credential counts only while it is Confirmed: approved by an
 * admin and not past its expiration date. One marked "no expiration", or with
 * no date on file, never lapses. Expired or rejected keeps the link shut, the
 * same as the Expired / Rejected pills on the credential cards (SCRUM-136).
 *
 * THE ALERT. The In-review card promises "We'll email you the moment your link
 * is ready", and nothing did: approving the fifth credential sent no email and
 * no in-app notice, so the caregiver had to keep checking the page. It fires
 * from the admin's approval (document.service#reviewDocument) only on the
 * approval that takes the caregiver from locked to unlocked. Re-approving a
 * credential on an already-unlocked profile sends nothing, and it is sent at
 * most once per caregiver.
 */

import { credentialExpiresAt } from '../../../helpers/credentialExpiry';
import { Types } from 'mongoose';
import { Documents } from '../document/documents.model';
import { Notification } from '../user/notification.model';
import { User } from '../user/user.model';
import { PersonalInfo } from '../user/personal-info.model';
import { sendEmail } from '../auth/sendMail';
import {
  REQUIRED_CREDENTIAL_KEYS,
  RequiredCredentialKey,
  isPrimaryCredentialRow,
} from '../../../constants/credentials';
import {
  EMAIL_COLORS as C,
  emailAppUrl,
  emailDetailRow,
  escapeHtml,
  renderAlertEmail,
} from './email-layout';

/** Is this credential document Confirmed right now? */
export const isCredentialConfirmed = (doc: any, now: number = Date.now()): boolean => {
  if (!doc || doc.reviewStatus !== 'approved') return false;
  if (doc.hasNoExpiration || !doc.credentialExpirationDate) return true;
  // SCRUM-169: the same expiry instant as the cards and the emails.
  const expiresAt = credentialExpiresAt(doc.credentialExpirationDate);
  // An unreadable date is treated as "no date on file", as the card does.
  return Number.isNaN(expiresAt) || expiresAt > now;
};

export interface ShareGateSummary {
  items: {
    key: RequiredCredentialKey;
    document: any | null;
    verified: boolean;
  }[];
  verified: number;
  total: number;
  /** All required credentials Confirmed: the share link may open. */
  unlocked: boolean;
}

export const getShareGateSummary = async (
  caregiverId: string | Types.ObjectId
): Promise<ShareGateSummary> => {
  // SCRUM-176: oldest first, stated rather than assumed. The map below keeps
  // the LAST row of each type, and this query carried no sort, so the row that
  // decided the share gate was whatever order the database returned. createdAt
  // ascending is exactly that effective order today — no gate verdict moves,
  // it is simply no longer left to chance.
  const documents = await Documents.find({ user: caregiverId })
    .sort({ createdAt: 1 })
    .lean();
  // The caregiver's card keys credentials by type and keeps the LAST row of
  // each (app/actions.ts#getCredentialStatus on the frontend), so do the same.
  // Taking the first row would disagree with the card whenever a caregiver has
  // an older duplicate of a credential.
  //
  // SCRUM-165: the RN/LPN practical sign-off is a second 'certifications' row
  // and is not one of the five. Left in, whichever of the two sorted last
  // decided "PCA Certificate": an approved sign-off opened the public link with
  // the written exam still pending, and a pending one kept a verified PCA shut.
  // Only the primary row is mapped, the same as the card, so the written exam
  // (or legacy certificate) alone decides it and the sign-off never unlocks or
  // locks anything.
  const byType: Record<string, any> = {};
  documents.forEach((d: any) => {
    if (isPrimaryCredentialRow(d)) byType[d.documentType] = d;
  });

  const now = Date.now();
  const items = REQUIRED_CREDENTIAL_KEYS.map((key) => {
    const document = byType[key] || null;
    return { key, document, verified: isCredentialConfirmed(document, now) };
  });
  const verified = items.filter((i) => i.verified).length;
  const total = REQUIRED_CREDENTIAL_KEYS.length;

  return { items, verified, total, unlocked: verified === total };
};
