/* eslint-disable @typescript-eslint/no-this-alias */
import { Schema, model } from 'mongoose';

const NotificationSchema = new Schema<any>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    message: {
      type: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // SCRUM-65: Notification type for credential alerts
    type: {
      type: String,
      enum: [
        'general',
        'credential_yellow',
        'credential_red',
        'credential_expired',
        'credential_rejected',
        'private_access_request',
        'private_access_granted',
        'private_access_revoked',
      ],
      default: 'general',
    },
    // SCRUM-65: Reference to credential document (for deduplication)
    credentialDocumentId: {
      type: Schema.Types.ObjectId,
      ref: 'Documents',
    },
    // SCRUM-65: Credential name for display
    credentialName: {
      type: String,
    },
    // SCRUM-65: Deep-link URL for notification CTA
    ctaLink: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = model<any>('Notification', NotificationSchema);
