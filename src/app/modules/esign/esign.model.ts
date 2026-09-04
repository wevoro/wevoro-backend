import { Schema, model } from 'mongoose';

/**
 * SCRUM-117/118: e-signature.
 *
 * SigningDocument — one file in an agency's signing library, grouped by role
 * (CNA/PCA). A group is "active" once it has at least one active document;
 * there is no separate toggle. Replacing bumps `version` and re-issues pending
 * copies; removing keeps already-sent copies in flight (they are snapshotted
 * into packets) but stops new sends.
 *
 * SignaturePacket — the per-(offer, caregiver) snapshot created when the
 * caregiver completes Step 1 of the accept flow. Items are copies of the
 * library documents at that moment, each signed in sequence. The agency is
 * only ever notified on FULL completion (2026-08-31 meeting decision) and no
 * partial packet is ever delivered.
 */

export const ESIGN_ROLES = ['CNA', 'PCA'] as const;
export type EsignRole = (typeof ESIGN_ROLES)[number];

const signingDocumentSchema = new Schema(
  {
    agency: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ESIGN_ROLES, required: true },
    title: { type: String, required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: 'application/pdf' },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);
signingDocumentSchema.index({ agency: 1, role: 1, status: 1 });

const packetItemSchema = new Schema(
  {
    signingDocument: { type: Schema.Types.ObjectId, ref: 'SigningDocument', required: true },
    title: { type: String, required: true },
    fileName: { type: String },
    fileUrl: { type: String, required: true },
    version: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['pending', 'signed', 'outdated'],
      default: 'pending',
    },
    signedAt: { type: Date },
    /** Audit captured at the moment of signing. */
    signatureIp: { type: String },
    signatureUserAgent: { type: String },
    /**
     * The signed artefact: the original with the caregiver's signature stamped
     * onto it plus a certificate page. This is what the agency receives — the
     * database record alone is not something anyone can hand to an auditor.
     */
    signedFileUrl: { type: String },
  },
  { _id: true }
);

const signaturePacketSchema = new Schema(
  {
    offer: { type: Schema.Types.ObjectId, ref: 'Offer', required: true, index: true },
    agency: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    caregiver: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ESIGN_ROLES, required: true },
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    items: [packetItemSchema],
    /**
     * The system-generated stamp, created ONCE per packet and reused on every
     * document (2026-08-31 decision: not freehand, not typed, not regenerated
     * per document). stampId also serves as the signature's audit reference.
     */
    stampName: { type: String, required: true },
    stampId: { type: String, required: true },
    /**
     * The caregiver's hand-drawn signature as a PNG data URL, captured once and
     * reused on every document in the packet — the ticket is explicit that it is
     * not recreated per document.
     */
    signatureImage: { type: String },
    /** ZIP of every signed document, delivered to the agency on completion. */
    packageUrl: { type: String },
    packageSentAt: { type: Date },
    /** Step 1 (upload + approval checkbox) completion — starts the reminder clock. */
    step1CompletedAt: { type: Date, required: true },
    completedAt: { type: Date },
    /** Reminder escalation bookkeeping: which tiers (hours offsets) already fired. */
    remindersSent: [{ type: Number }],
  },
  { timestamps: true }
);
signaturePacketSchema.index({ offer: 1, caregiver: 1 }, { unique: true });
signaturePacketSchema.index({ status: 1, step1CompletedAt: 1 });

export const SigningDocument = model('SigningDocument', signingDocumentSchema);
export const SignaturePacket = model('SignaturePacket', signaturePacketSchema);
