"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Shift = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const ShiftSchema = new mongoose_1.Schema({
    partner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    numberOfCaregivers: {
        type: Number,
        required: true,
        min: 1,
        max: 10,
    },
    positions: [
        {
            type: String,
            required: true,
            enum: ['CNA', 'PCA'],
        },
    ],
    startingDate: {
        type: Date,
        required: true,
    },
    shiftDays: [
        {
            type: String,
            required: true,
            enum: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        },
    ],
    startingTime: {
        type: String,
        required: true,
    },
    endingTime: {
        type: String,
        required: true,
    },
    shiftLength: {
        type: Number,
    },
    shiftType: {
        type: String,
        enum: ['Day Shift', 'Night Shift'],
    },
    hourRate: {
        type: Number,
        required: true,
        min: 0,
    },
    isNegotiable: {
        type: Boolean,
        default: false,
    },
    address: {
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
    },
    documentsNeeded: [
        {
            title: { type: String, required: true },
            isPreset: { type: Boolean, default: false },
            isSelected: { type: Boolean, default: false },
        },
    ],
    notes: {
        type: String,
    },
    isUrgent: {
        type: Boolean,
        default: false,
    },
    isPublic: {
        type: Boolean,
        default: true,
    },
    status: {
        type: String,
        enum: ['pending', 'upcoming', 'active', 'completed', 'removed'],
        default: 'pending',
    },
    assignedCaregivers: [
        {
            caregiver: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'User',
            },
            status: {
                type: String,
                enum: ['pending', 'accepted', 'declined'],
                default: 'pending',
            },
        },
    ],
}, {
    timestamps: true,
});
exports.Shift = (0, mongoose_1.model)('Shift', ShiftSchema);
