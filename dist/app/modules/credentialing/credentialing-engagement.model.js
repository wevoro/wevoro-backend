"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialingEngagement = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
/**
 * SCRUM-87/88: Credentialing-mode share-onboarding attribution.
 *
 * One record per (caregiver, agency) pair, created when an agency completes
 * onboarding via a caregiver's share link (SCRUM-64). This is the missing
 * attribution layer the credentialing-mode Offers tab consumes:
 *   - Submitted = engagement exists, no download yet (SCRUM-67)
 *   - Received  = engagement exists AND the agency has downloaded ≥1 document
 *
 * The pair is keyed by (caregiver, agency) — an agency that onboards via several
 * caregivers' links is tracked independently in each caregiver's view, and vice
 * versa (SCRUM-87/88 Scenario 5). The single scalar `sourceCaregiverId` on the
 * User model cannot express this many-to-many relationship, which is why this
 * dedicated collection exists.
 */
const CredentialingEngagementSchema = new mongoose_1.Schema({
    caregiver: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    agency: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // When the agency completed onboarding via the caregiver's share link.
    onboardedAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});
// One engagement per (caregiver, agency) pair. Guarantees idempotent
// record-keeping so the "Agency Onboarded" notification fires exactly once.
CredentialingEngagementSchema.index({ caregiver: 1, agency: 1 }, { unique: true });
exports.CredentialingEngagement = (0, mongoose_1.model)('CredentialingEngagement', CredentialingEngagementSchema);
