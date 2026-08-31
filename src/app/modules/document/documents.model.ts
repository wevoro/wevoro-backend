/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const DocumentsSchema = new Schema<any>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    category: {
      type: String,
    },
    documentType: {
      type: String,
    },
    title: {
      type: String,
    },
    privacy: {
      type: String,
      enum: ['public', 'private'],
      default: 'private',
    },
    url: {
      type: String,
    },
    // Byte size of the uploaded file, so the document card can show "( 2.1 MB )".
    fileSize: {
      type: Number,
    },
    consent: {
      type: Boolean,
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    reviewedAt: {
      type: Date,
    },
    credentialIdNumber: { type: String },
    credentialIssueDate: { type: Date },
    credentialExpirationDate: { type: Date },
    issuingOrganization: { type: String },
    rejectionReason: { type: String },

    // SCRUM-109 platform gap: some credentials legitimately have no expiry
    // (PCA written exam / practical sign-off, GCHEXS). Previously an expiration
    // date was hard-required to confirm anything, so admins invented dates.
    // This flag is the explicit "Reviewed, no fixed renewal" state.
    hasNoExpiration: { type: Boolean, default: false },

    // SCRUM-109 / SCRUM-110: the caregiver's own credential ID from the
    // provider is `credentialIdNumber`. This is WeVoro's own generated ID,
    // issued at confirmation, so agencies get a verifiable trail.
    wevoroCredentialId: { type: String, index: true },

    // SCRUM-110: PCA is one credential made of two documents. `parentDocument`
    // links the RN/LPN practical sign-off to the written exam; `part` says
    // which half this document is.
    parentDocument: { type: Schema.Types.ObjectId, ref: 'Documents' },
    part: {
      type: String,
      enum: ['written_exam', 'practical_signoff'],
    },

    // SCRUM-109: TB test is an anchor record with linked ANNUAL SCREENINGS.
    // A screening is its own document row pointing at the initial test via
    // `parentDocument`, flagged here and carrying who signed it.
    isAnnualScreening: { type: Boolean, default: false },
    screeningDate: { type: Date },
    screeningSignedBy: { type: String },

    // SCRUM-109: structured rejection reason.
    // rejectionReason (above) stays the caregiver-facing message; this is the
    // category behind it, so reasons can be reported on and measured.
    rejectionReasonCode: {
      type: String,
      enum: [
        'unreadable',
        'expired',
        'information_missing',
        'name_mismatch',
        'wrong_document_type',
        'issuer_not_confirmed',
        'does_not_meet_requirement',
        'appears_altered',
        'other',
      ],
    },
    /** Admin asked the caregiver to upload a replacement. */
    replacementRequested: { type: Boolean, default: false },

    // SCRUM-109 accuracy logging: what the AI suggested vs what the admin
    // decided, so each reason category can be measured before it is trusted
    // with any more automation.
    aiSuggestedReason: { type: String },
    adminAgreedWithAi: { type: Boolean },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

export const Documents = model<any>('Documents', DocumentsSchema);
