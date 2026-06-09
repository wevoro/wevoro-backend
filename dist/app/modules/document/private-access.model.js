"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivateAccess = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
/**
 * SCRUM-67: Private Document Access Control
 * Tracks per-agency consent for private supporting documents
 */
const PrivateAccessSchema = new mongoose_1.Schema({
    agency: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    caregiver: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
});
// Compound index: one access request per agency-caregiver pair
PrivateAccessSchema.index({ agency: 1, caregiver: 1 }, { unique: true });
exports.PrivateAccess = (0, mongoose_1.model)('PrivateAccess', PrivateAccessSchema);
