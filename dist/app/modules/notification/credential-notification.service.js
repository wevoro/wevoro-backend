"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCredentialNotificationCron = exports.fireRejectionNotification = exports.evaluateCredentialExpirations = void 0;
const documents_model_1 = require("../document/documents.model");
const notification_model_1 = require("../user/notification.model");
const personal_info_model_1 = require("../user/personal-info.model");
const engagement_helper_1 = require("./engagement.helper");
/**
 * SCRUM-65: Credential Expiration Notification Cron Service
 *
 * Runs daily to scan all Verified credentials and fire notifications
 * when they cross band thresholds:
 * - Yellow entry: 60 days (caregiver only)
 * - Red entry: 30 days (caregiver + engaged agencies)
 * - Expiration: 0 days (caregiver + engaged agencies)
 *
 * Deduplication: checks if a notification with the same type + credentialDocumentId
 * already exists before firing.
 */
const CREDENTIAL_LABELS = {
    certifications: 'CNA Certification',
    driver_license: "Driver's License",
    auto_insurance: 'Auto Insurance',
    cpr_test: 'CPR Test',
    tb_tests: 'TB Test',
};
/**
 * Check if a notification has already been sent for this credential + type combination
 */
const isNotificationAlreadySent = (userId, credentialDocumentId, type) => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield notification_model_1.Notification.findOne({
        user: userId,
        credentialDocumentId,
        type,
    });
    return !!existing;
});
/**
 * Get caregiver's display name from PersonalInfo
 */
const getCaregiverName = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const personalInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: userId });
    if (personalInfo) {
        const first = personalInfo.firstName || '';
        const last = personalInfo.lastName || '';
        return `${first} ${last}`.trim() || 'Caregiver';
    }
    return 'Caregiver';
});
/**
 * Fire a notification to a user
 */
const fireNotification = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, message, type, credentialDocumentId, credentialName, ctaLink } = params;
    // Deduplication check
    const alreadySent = yield isNotificationAlreadySent(userId, credentialDocumentId, type);
    if (alreadySent)
        return;
    yield notification_model_1.Notification.create({
        user: userId,
        message,
        type,
        credentialDocumentId,
        credentialName,
        ctaLink,
        isRead: false,
    });
    console.log(`📢 Notification fired: [${type}] to user ${userId} for ${credentialName}`);
});
/**
 * Main cron job function: evaluates all verified credentials
 */
const evaluateCredentialExpirations = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('🔄 [Cron] Running credential expiration check...');
    try {
        // Find all verified credentials with expiration dates
        const verifiedDocs = yield documents_model_1.Documents.find({
            reviewStatus: 'approved',
            credentialExpirationDate: { $exists: true, $ne: null },
        });
        console.log(`Found ${verifiedDocs.length} verified credentials to evaluate`);
        const now = new Date();
        for (const doc of verifiedDocs) {
            const expirationDate = new Date(doc.credentialExpirationDate);
            const diffMs = expirationDate.getTime() - now.getTime();
            const daysUntilExpiration = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const credentialName = CREDENTIAL_LABELS[doc.documentType] || doc.title || 'Credential';
            const caregiverId = doc.user.toString();
            const docId = doc._id.toString();
            // Yellow band entry: 60 days (caregiver only)
            if (daysUntilExpiration <= 60 && daysUntilExpiration > 30) {
                yield fireNotification({
                    userId: caregiverId,
                    message: `Your <strong>${credentialName}</strong> expires in ${daysUntilExpiration} days. Plan ahead to renew before it enters urgent status.`,
                    type: 'credential_yellow',
                    credentialDocumentId: docId,
                    credentialName,
                    ctaLink: '/pro/profile#credentials',
                });
                // No agency notification for Yellow band
            }
            // Red band entry: 30 days (caregiver + engaged agencies)
            if (daysUntilExpiration <= 30 && daysUntilExpiration > 0) {
                yield fireNotification({
                    userId: caregiverId,
                    message: `Your <strong>${credentialName}</strong> expires in ${daysUntilExpiration} days. Please renew now to keep your profile active.`,
                    type: 'credential_red',
                    credentialDocumentId: docId,
                    credentialName,
                    ctaLink: '/pro/profile#credentials',
                });
                // Agency notifications for Red band
                const engagedAgencies = yield (0, engagement_helper_1.getEngagedAgencies)(caregiverId);
                const caregiverName = yield getCaregiverName(caregiverId);
                for (const agencyId of engagedAgencies) {
                    yield fireNotification({
                        userId: agencyId,
                        message: `<strong>${caregiverName}</strong>'s <strong>${credentialName}</strong> expires in ${daysUntilExpiration} days. You may want to confirm renewal plans before assigning further shifts.`,
                        type: 'credential_red',
                        credentialDocumentId: docId,
                        credentialName,
                        ctaLink: `/partner/pros/${caregiverId}`,
                    });
                }
            }
            // Expiration: 0 days or below (caregiver + engaged agencies)
            if (daysUntilExpiration <= 0) {
                yield fireNotification({
                    userId: caregiverId,
                    message: `Your <strong>${credentialName}</strong> has expired. Renew now to restore your profile.`,
                    type: 'credential_expired',
                    credentialDocumentId: docId,
                    credentialName,
                    ctaLink: '/pro/profile#credentials',
                });
                // Agency notifications for Expiration
                const engagedAgencies = yield (0, engagement_helper_1.getEngagedAgencies)(caregiverId);
                const caregiverName = yield getCaregiverName(caregiverId);
                for (const agencyId of engagedAgencies) {
                    yield fireNotification({
                        userId: agencyId,
                        message: `<strong>${caregiverName}</strong>'s <strong>${credentialName}</strong> has expired. They cannot be scheduled until they renew.`,
                        type: 'credential_expired',
                        credentialDocumentId: docId,
                        credentialName,
                        ctaLink: `/partner/pros/${caregiverId}`,
                    });
                }
            }
        }
        console.log('✅ [Cron] Credential expiration check completed');
    }
    catch (error) {
        console.error('❌ [Cron] Error evaluating credential expirations:', error);
    }
});
exports.evaluateCredentialExpirations = evaluateCredentialExpirations;
/**
 * SCRUM-65: Fire a per-credential rejection notification (called in real-time from reviewDocument)
 */
const fireRejectionNotification = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { caregiverId, credentialDocumentId, credentialName, rejectionReason } = params;
    const reason = rejectionReason || 'Review required';
    const message = `Your <strong>${credentialName}</strong> needs attention: ${reason}. Please re-upload to continue verification.`;
    yield notification_model_1.Notification.create({
        user: caregiverId,
        message,
        type: 'credential_rejected',
        credentialDocumentId,
        credentialName,
        ctaLink: '/pro/profile#credentials',
        isRead: false,
    });
    console.log(`📢 Rejection notification fired for ${credentialName} to caregiver ${caregiverId}`);
});
exports.fireRejectionNotification = fireRejectionNotification;
/**
 * Start the daily cron job using setInterval (runs every 24 hours)
 * Also runs once immediately on startup
 */
const startCredentialNotificationCron = () => {
    console.log('⏰ [Cron] Credential notification cron started');
    // Run once after a short delay to let DB stabilize
    setTimeout(() => {
        (0, exports.evaluateCredentialExpirations)();
    }, 10000);
    // Then run every 24 hours
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    setInterval(() => {
        (0, exports.evaluateCredentialExpirations)();
    }, TWENTY_FOUR_HOURS);
};
exports.startCredentialNotificationCron = startCredentialNotificationCron;
