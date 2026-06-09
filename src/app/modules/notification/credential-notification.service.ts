import { Documents } from '../document/documents.model';
import { Notification } from '../user/notification.model';
import { User } from '../user/user.model';
import { PersonalInfo } from '../user/personal-info.model';
import { getEngagedAgencies } from './engagement.helper';

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

const CREDENTIAL_LABELS: Record<string, string> = {
  certifications: 'CNA Certification',
  driver_license: "Driver's License",
  auto_insurance: 'Auto Insurance',
  cpr_test: 'CPR Test',
  tb_tests: 'TB Test',
};

/**
 * Check if a notification has already been sent for this credential + type combination
 */
const isNotificationAlreadySent = async (
  userId: string,
  credentialDocumentId: string,
  type: string
): Promise<boolean> => {
  const existing = await Notification.findOne({
    user: userId,
    credentialDocumentId,
    type,
  });
  return !!existing;
};

/**
 * Get caregiver's display name from PersonalInfo
 */
const getCaregiverName = async (userId: string): Promise<string> => {
  const personalInfo = await PersonalInfo.findOne({ user: userId });
  if (personalInfo) {
    const first = personalInfo.firstName || '';
    const last = personalInfo.lastName || '';
    return `${first} ${last}`.trim() || 'Caregiver';
  }
  return 'Caregiver';
};

/**
 * Fire a notification to a user
 */
const fireNotification = async (params: {
  userId: string;
  message: string;
  type: string;
  credentialDocumentId: string;
  credentialName: string;
  ctaLink: string;
}): Promise<void> => {
  const { userId, message, type, credentialDocumentId, credentialName, ctaLink } = params;

  // Deduplication check
  const alreadySent = await isNotificationAlreadySent(userId, credentialDocumentId, type);
  if (alreadySent) return;

  await Notification.create({
    user: userId,
    message,
    type,
    credentialDocumentId,
    credentialName,
    ctaLink,
    isRead: false,
  });

  console.log(`📢 Notification fired: [${type}] to user ${userId} for ${credentialName}`);
};

/**
 * Main cron job function: evaluates all verified credentials
 */
export const evaluateCredentialExpirations = async (): Promise<void> => {
  console.log('🔄 [Cron] Running credential expiration check...');

  try {
    // Find all verified credentials with expiration dates
    const verifiedDocs = await Documents.find({
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
        await fireNotification({
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
        await fireNotification({
          userId: caregiverId,
          message: `Your <strong>${credentialName}</strong> expires in ${daysUntilExpiration} days. Please renew now to keep your profile active.`,
          type: 'credential_red',
          credentialDocumentId: docId,
          credentialName,
          ctaLink: '/pro/profile#credentials',
        });

        // Agency notifications for Red band
        const engagedAgencies = await getEngagedAgencies(caregiverId);
        const caregiverName = await getCaregiverName(caregiverId);

        for (const agencyId of engagedAgencies) {
          await fireNotification({
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
        await fireNotification({
          userId: caregiverId,
          message: `Your <strong>${credentialName}</strong> has expired. Renew now to restore your profile.`,
          type: 'credential_expired',
          credentialDocumentId: docId,
          credentialName,
          ctaLink: '/pro/profile#credentials',
        });

        // Agency notifications for Expiration
        const engagedAgencies = await getEngagedAgencies(caregiverId);
        const caregiverName = await getCaregiverName(caregiverId);

        for (const agencyId of engagedAgencies) {
          await fireNotification({
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
  } catch (error) {
    console.error('❌ [Cron] Error evaluating credential expirations:', error);
  }
};

/**
 * SCRUM-65: Fire a per-credential rejection notification (called in real-time from reviewDocument)
 */
export const fireRejectionNotification = async (params: {
  caregiverId: string;
  credentialDocumentId: string;
  credentialName: string;
  rejectionReason: string;
}): Promise<void> => {
  const { caregiverId, credentialDocumentId, credentialName, rejectionReason } = params;

  const reason = rejectionReason || 'Review required';
  const message = `Your <strong>${credentialName}</strong> needs attention: ${reason}. Please re-upload to continue verification.`;

  await Notification.create({
    user: caregiverId,
    message,
    type: 'credential_rejected',
    credentialDocumentId,
    credentialName,
    ctaLink: '/pro/profile#credentials',
    isRead: false,
  });

  console.log(`📢 Rejection notification fired for ${credentialName} to caregiver ${caregiverId}`);
};

/**
 * Start the daily cron job using setInterval (runs every 24 hours)
 * Also runs once immediately on startup
 */
export const startCredentialNotificationCron = (): void => {
  console.log('⏰ [Cron] Credential notification cron started');

  // Run once after a short delay to let DB stabilize
  setTimeout(() => {
    evaluateCredentialExpirations();
  }, 10000);

  // Then run every 24 hours
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    evaluateCredentialExpirations();
  }, TWENTY_FOUR_HOURS);
};
