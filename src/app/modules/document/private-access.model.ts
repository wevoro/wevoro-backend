/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

/**
 * SCRUM-67: Private Document Access Control
 * Tracks per-agency consent for private supporting documents
 */
const PrivateAccessSchema = new Schema<any>(
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
    status: {
      type: String,
      enum: ['pending', 'granted', 'revoked'],
      default: 'pending',
    },
    grantedAt: {
      type: Date,
    },
    revokedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one access request per agency-caregiver pair
PrivateAccessSchema.index({ agency: 1, caregiver: 1 }, { unique: true });

export const PrivateAccess = model<any>('PrivateAccess', PrivateAccessSchema);
