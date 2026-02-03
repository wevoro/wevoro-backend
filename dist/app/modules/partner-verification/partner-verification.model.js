"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PartnerVerification = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const PartnerVerificationSchema = new mongoose_1.Schema({
    licenseNumber: {
        type: String,
        required: true,
    },
    ein: {
        type: String,
        required: true,
    },
    licenseFile: {
        type: String,
        required: true,
    },
    partner: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
}, {
    timestamps: true,
});
exports.PartnerVerification = (0, mongoose_1.model)('PartnerVerification', PartnerVerificationSchema);
