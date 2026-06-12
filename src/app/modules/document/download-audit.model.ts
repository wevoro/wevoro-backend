/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

/**
 * SCRUM-67: Download Audit Trail
 * Logs every document download by an agency for compliance tracking
 */
const DownloadAuditSchema = new Schema<any>(
  {
    agency: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    caregiver: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Documents',
    },
    documentTitle: {
      type: String,
    },
    downloadType: {
      type: String,
      enum: ['individual', 'bulk'],
      required: true,
    },
    // For bulk downloads, list all included documents
    documentsIncluded: [
      {
        documentId: { type: Schema.Types.ObjectId, ref: 'Documents' },
        title: { type: String },
      },
    ],
    // Denormalized agency info for display
    agencyName: { type: String },
    agencyEmail: { type: String },
  },
  {
    timestamps: true,
  }
);

export const DownloadAudit = model<any>('DownloadAudit', DownloadAuditSchema);
