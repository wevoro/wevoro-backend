"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const NotificationSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
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
            // SCRUM-87/88: credentialing-mode engagement notifications
            'agency_onboarded',
            'credentials_downloaded',
            // SCRUM-117/118: e-signature flow
            'esign_reminder',
            'esign_completed',
            'esign_replaced',
            'esign_added',
            // SCRUM-141: Onboard → Respond → Submitted
            'onboard_request',
            'onboard_submitted',
            // SCRUM-210: the caregiver replaced a credential inside an agency's
            // paid 30-day window, so the agency is told which one changed.
            'credential_updated',
        ],
        default: 'general',
    },
    // SCRUM-65: Reference to credential document (for deduplication)
    credentialDocumentId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
    // SCRUM-192: when a renewal ended the lifecycle this notification belongs
    // to. The row is kept — it is the caregiver's record that the credential
    // once entered that band — but a superseded row no longer answers the
    // dedup check in credential-notification.service, so the renewed
    // credential can fire its own Yellow/Red/Expired alerts. Unset means "this
    // is the current lifecycle", which is what every pre-SCRUM-192 row is.
    supersededAt: {
        type: Date,
    },
}, {
    timestamps: true,
});
exports.Notification = (0, mongoose_1.model)('Notification', NotificationSchema);
