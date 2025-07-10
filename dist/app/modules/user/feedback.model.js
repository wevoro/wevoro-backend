"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Feedback = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const FeedbackSchema = new mongoose_1.Schema({
    user: {
        image: {
            type: String,
            required: false,
            default: 'https://med.gov.bz/wp-content/uploads/2020/08/dummy-profile-pic.jpg',
        },
        role: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
            required: false,
        },
        address: {
            type: String,
            required: false,
        },
    },
    message: {
        type: String,
    },
    feedbackType: {
        type: String,
        enum: ['Feature request', 'Report a bug to fix', 'Others'],
        default: 'Others',
    },
    selections: {
        type: [String],
        default: [],
    },
    isReadByAdmin: {
        type: Boolean,
        default: false,
    },
    status: {
        type: String,
        enum: ['New', 'Pending', 'Solved'],
        default: 'New',
    },
}, {
    timestamps: true,
});
exports.Feedback = (0, mongoose_1.model)('Feedback', FeedbackSchema);
// sample data
