/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

/**
 * SCRUM-178: Credential Audit Trail
 *
 * Update Verification (a re-upload over a confirmed credential) and Remove both
 * destroy the state an agency relied on, so both have to leave a record.
 *
 * SCRUM-67's DownloadAudit is the precedent for how this codebase logs an
 * auditable action: a row of its own, written from the service that performs
 * the action, best-effort so a logging failure never fails the action. These
 * two cannot go INTO DownloadAudit — every row there requires an `agency` and a
 * `downloadType`, and credentialing.service aggregates that whole collection as
 * "latest download per agency", so a caregiver's re-upload written there would
 * read back as an agency download. Same shape and same pattern, separate
 * collection.
 *
 * Deliberately no read route and no admin screen: SCRUM-178 asks for the two
 * actions to be logged, nothing more.
 */
const CredentialAuditSchema = new Schema<any>(
  {
    caregiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    /** Who performed it — the caregiver themselves, or an admin acting for them. */
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    action: {
      type: String,
      enum: ['update_verification', 'remove'],
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Documents',
    },
    documentTitle: { type: String },
    documentType: { type: String },
    /** SCRUM-165: which half of the PCA certificate, when the row is one. */
    part: { type: String },
    /** The review state the document was in before the action. */
    previousReviewStatus: { type: String },
  },
  {
    timestamps: true,
  }
);

export const CredentialAudit = model<any>(
  'CredentialAudit',
  CredentialAuditSchema
);

/**
 * Write one audit row. Best-effort, exactly as SCRUM-87's notification hook in
 * download.service is: losing the log must never fail the caregiver's action.
 */
export const logCredentialAction = async (params: {
  caregiverId: string;
  actorId?: string;
  action: 'update_verification' | 'remove';
  document?: any;
}): Promise<void> => {
  try {
    await CredentialAudit.create({
      caregiver: params.caregiverId,
      actor: params.actorId,
      action: params.action,
      documentId: params.document?._id,
      documentTitle: params.document?.title,
      documentType: params.document?.documentType,
      part: params.document?.part,
      previousReviewStatus: params.document?.reviewStatus,
    });
  } catch (err) {
    console.error('Failed to write credential audit row:', err);
  }
};
