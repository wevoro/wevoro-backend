"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateProCompletion = calculateProCompletion;
/**
 * Calculates pro profile completion percentage (0–100).
 *
 * Breakdown:
 *   Personal Info completed       → 25%
 *   Professional Info completed   → 25%
 *   Driver's License uploaded     → 12.5%  (+12.5% if admin-approved = 25% total)
 *   TB Test uploaded              → 12.5%  (+12.5% if admin-approved = 25% total)
 */
function calculateProCompletion(personalInfo, professionalInfo, driverLicense, tbTest) {
    let score = 0;
    if (personalInfo && Object.keys(personalInfo).length > 0)
        score += 25;
    if (professionalInfo && Object.keys(professionalInfo).length > 0)
        score += 25;
    if (driverLicense) {
        score += 12.5;
        if (driverLicense.reviewStatus === 'approved')
            score += 12.5;
    }
    if (tbTest) {
        score += 12.5;
        if (tbTest.reviewStatus === 'approved')
            score += 12.5;
    }
    return Math.floor(score);
}
