"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfessionalInfo = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const ProfessionalInfoSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    education: [
        {
            degree: String,
            institution: String,
            yearOfGraduation: Number,
            fieldOfStudy: String,
            grade: String,
        },
    ],
    experience: [
        {
            jobTitle: String,
            companyName: String,
            duration: String,
            responsibilities: String,
        },
    ],
    certifications: [
        {
            fileId: { type: String },
            title: { type: String },
            institution: { type: String },
            issueDate: { type: Date },
            expireDate: { type: Date },
            credentialId: { type: String },
            credentialUrl: { type: String },
            certificateFile: { type: String },
        },
    ],
    skills: [String],
}, {
    timestamps: true,
});
exports.ProfessionalInfo = (0, mongoose_1.model)('ProfessionalInformation', ProfessionalInfoSchema);
