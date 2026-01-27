"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Documents = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const DocumentsSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
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
    consent: {
        type: Boolean,
    },
}, {
    timestamps: true,
});
exports.Documents = (0, mongoose_1.model)('Documents', DocumentsSchema);
