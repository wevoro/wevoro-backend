"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DownloadAudit = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
/**
 * SCRUM-67: Download Audit Trail
 * Logs every document download by an agency for compliance tracking
 */
const DownloadAuditSchema = new mongoose_1.Schema({
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
    documentId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
            documentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Documents' },
            title: { type: String },
        },
    ],
}, {
    timestamps: true,
});
exports.DownloadAudit = (0, mongoose_1.model)('DownloadAudit', DownloadAuditSchema);
