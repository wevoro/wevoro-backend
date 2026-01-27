"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Offer = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const OfferSchema = new mongoose_1.Schema({
    partner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    pro: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    jobLink: {
        type: String,
    },
    // All requested documents (existing from profile + new requests)
    documentsNeeded: [
        {
            // Reference to existing document (null for new requests)
            document: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Document',
                default: null,
            },
            title: {
                type: String,
                required: true,
            },
            category: {
                type: String,
            },
            privacy: {
                type: String,
                // Only set for existing documents, null for new requests
            },
            url: {
                type: String,
            },
            status: {
                type: String,
                enum: ['pending', 'granted', 'denied'],
                default: 'pending',
            },
        },
    ],
    notes: [
        {
            role: {
                type: String,
                enum: ['partner', 'pro'],
            },
            note: {
                type: String,
            },
        },
    ],
    status: {
        type: String,
        enum: ['pending', 'onboarded', 'rejected', 'responded'],
        default: 'pending',
    },
    isRemovedByPro: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
exports.Offer = (0, mongoose_1.model)('Offer', OfferSchema);
