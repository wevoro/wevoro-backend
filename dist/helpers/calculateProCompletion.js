"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateProCompletion = calculateProCompletion;
const credentials_1 = require("../constants/credentials");
/**
 * Calculates pro profile completion percentage (0–100).
 *
 * Breakdown:
 *   Personal Info completed         → 25%
 *   Professional Info completed     → 25%
 *   Each required credential (5)    → 10%  (5% uploaded + 5% admin-approved)
 *
 * SCRUM-93: the credential half of the score used to track only Driver's License
 * and TB Test at 25% each. When SCRUM-60 grew the required list to five, the
 * formula was never updated, so 25+25+25+25 reached 100% while the Role
 * Certificate, Auto Insurance and CPR Test were all still missing. It now scores
 * every credential in REQUIRED_CREDENTIAL_KEYS, so 100% is only reachable once
 * all five are uploaded AND approved.
 *
 * Note the score is intentionally monotonic in credentials: a caregiver who has
 * finished both info steps sits at exactly 50% with zero credentials, and
 * credentials only add from there. Login routing keys off `>= 50`, so widening
 * the credential set cannot reroute anyone back into onboarding.
 */
function calculateProCompletion(personalInfo, professionalInfo, documents = []) {
    let score = 0;
    if (personalInfo && Object.keys(personalInfo).length > 0)
        score += 25;
    if (professionalInfo && Object.keys(professionalInfo).length > 0)
        score += 25;
    const docsByType = {};
    (documents !== null && documents !== void 0 ? documents : []).forEach((doc) => {
        if (doc === null || doc === void 0 ? void 0 : doc.documentType)
            docsByType[doc.documentType] = doc;
    });
    // 50% split evenly across the required credentials, half for uploading and
    // half for passing admin review — preserving the original upload/approve split.
    const perCredential = 50 / credentials_1.REQUIRED_CREDENTIAL_KEYS.length;
    credentials_1.REQUIRED_CREDENTIAL_KEYS.forEach(key => {
        const doc = docsByType[key];
        if (!doc)
            return;
        score += perCredential / 2;
        if (doc.reviewStatus === 'approved')
            score += perCredential / 2;
    });
    return Math.floor(score);
}
