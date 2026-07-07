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
}, {
    timestamps: true,
});
exports.Notification = (0, mongoose_1.model)('Notification', NotificationSchema);
