"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonalInfo = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const PersonalInfoSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    firstName: {
        type: String,
    },
    lastName: {
        type: String,
    },
    phone: {
        type: String,
        required: false,
    },
    image: {
        type: String,
        default: 'https://med.gov.bz/wp-content/uploads/2020/08/dummy-profile-pic.jpg',
    },
    bio: {
        type: String,
    },
    dateOfBirth: {
        type: Date,
    },
    dateEstablished: {
        type: Date,
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
    },
    companyName: {
        type: String,
    },
    industry: {
        type: String,
    },
    // SCRUM-99: which CPR certification providers this agency accepts
    // (e.g. 'red_cross', 'aha', 'hsi', 'any'). Used by the share flow to warn a
    // caregiver pre-share if their CPR provider isn't accepted by this agency.
    acceptedCprProviders: {
        type: [String],
        default: [],
    },
    address: {
        street: {
            type: String,
        },
        city: {
            type: String,
        },
        state: {
            type: String,
        },
        zipCode: {
            type: String,
        },
        country: {
            type: String,
        },
    },
}, {
    timestamps: true,
});
exports.PersonalInfo = (0, mongoose_1.model)('PersonalInformation', PersonalInfoSchema);
