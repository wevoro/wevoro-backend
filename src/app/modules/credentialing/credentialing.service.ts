import mongoose from 'mongoose';
import { CredentialingEngagement } from './credentialing-engagement.model';
import { DownloadAudit } from '../document/download-audit.model';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { Notification } from '../user/notification.model';

/**
 * SCRUM-87/88: Credentialing-mode engagement service.
 *
 * Consumes share-onboarding attribution (this module) + download events
 * (SCRUM-67 DownloadAudit) to drive the repurposed Offers tab on both sides.
 */

const displayName = (info: any, fallback: string): string =>
  info?.companyName?.trim() ||
  `${info?.firstName || ''} ${info?.lastName || ''}`.trim() ||
  fallback;

/**
 * Record that `agencyId` onboarded via `caregiverId`'s share link.
 *
 * Idempotent: at most one engagement per (caregiver, agency) pair, so the
 * "Agency Onboarded" notification fires exactly once (SCRUM-87 Scenario 4 parity
 * for the onboarding event). Safe to call on every onboarding save.
 */
const recordEngagement = async (
  caregiverId: string,
  agencyId: string
): Promise<any> => {
  if (!caregiverId || !agencyId) return null;
  if (caregiverId.toString() === agencyId.toString()) return null;

  const existing = await CredentialingEngagement.findOne({
    caregiver: caregiverId,
    agency: agencyId,
  });
  if (existing) return existing; // already recorded — do not re-notify

  let engagement;
  try {
    engagement = await CredentialingEngagement.create({
      caregiver: caregiverId,
      agency: agencyId,
      onboardedAt: new Date(),
    });
  } catch (err: any) {
    // Unique-index race: another request just created it. Treat as recorded.
    if (err?.code === 11000) {
      return CredentialingEngagement.findOne({
        caregiver: caregiverId,
        agency: agencyId,
      });
    }
    throw err;
  }

  // SCRUM-87: notify the caregiver, CTA deep-links to the Submitted entry.
  const agencyInfo = await PersonalInfo.findOne({ user: agencyId });
  const agencyName = displayName(agencyInfo, 'An agency');
  await Notification.create({
    user: caregiverId,
    message: `<strong>${agencyName}</strong> onboarded to WeVoro via your share link.`,
    type: 'agency_onboarded',
    ctaLink: '/pro/offers?tab=submitted',
    isRead: false,
  });

  return engagement;
};

/**
 * SCRUM-67: fire the one-time "Credentials Downloaded" notification to the
 * caregiver. Caller (download.service) is responsible for first-download
 * detection so this fires exactly once per (caregiver, agency) pair.
 */
const notifyCredentialsDownloaded = async (
  caregiverId: string,
  agencyName: string
): Promise<void> => {
  await Notification.create({
    user: caregiverId,
    message: `<strong>${agencyName || 'An agency'}</strong> downloaded your credentials.`,
    type: 'credentials_downloaded',
    ctaLink: '/pro/offers?tab=received',
    isRead: false,
  });
};

/**
 * SCRUM-87: caregiver's view of the repurposed Offers tab.
 *
 * The entry set is the union of (agencies engaged via the caregiver's share
 * link) and (agencies that have downloaded the caregiver's credentials). An
 * entry with ≥1 download lands in Received (with the latest download date);
 * otherwise it stays in Submitted. Keyed by (caregiver, agency).
 */
const getCaregiverEngagements = async (
  caregiverId: string
): Promise<{ received: any[]; submitted: any[] }> => {
  const caregiverObjId = new mongoose.Types.ObjectId(caregiverId);

  const engagements = await CredentialingEngagement.find({
    caregiver: caregiverId,
  }).lean();

  // Latest download timestamp per agency for this caregiver (SCRUM-67).
  const downloadAgg = await DownloadAudit.aggregate([
    { $match: { caregiver: caregiverObjId } },
    { $group: { _id: '$agency', latest: { $max: '$createdAt' } } },
  ]);

  const onboardedMap = new Map<string, Date>();
  engagements.forEach((e: any) =>
    onboardedMap.set(e.agency.toString(), e.onboardedAt)
  );

  const downloadedMap = new Map<string, Date>();
  downloadAgg.forEach((d: any) => {
    if (d._id) downloadedMap.set(d._id.toString(), d.latest);
  });

  const agencyIds = Array.from(
    new Set<string>([...onboardedMap.keys(), ...downloadedMap.keys()])
  );

  const infos = await PersonalInfo.find({ user: { $in: agencyIds } }).lean();
  const infoMap = new Map<string, any>();
  infos.forEach((p: any) => infoMap.set(p.user.toString(), p));

  const received: any[] = [];
  const submitted: any[] = [];

  for (const agencyId of agencyIds) {
    const info = infoMap.get(agencyId);
    const downloadedAt = downloadedMap.get(agencyId) || null;
    const entry = {
      agencyId,
      name: displayName(info, 'Agency'),
      image: info?.image || null,
      onboardedAt: onboardedMap.get(agencyId) || null,
      downloadedAt,
    };
    if (downloadedAt) received.push(entry);
    else submitted.push(entry);
  }

  submitted.sort(
    (a, b) =>
      +new Date(b.onboardedAt || 0) - +new Date(a.onboardedAt || 0)
  );
  received.sort(
    (a, b) =>
      +new Date(b.downloadedAt || 0) - +new Date(a.downloadedAt || 0)
  );

  return { received, submitted };
};

/**
 * SCRUM-88: agency's view of the repurposed Offers tab — the symmetric mirror of
 * getCaregiverEngagements. Entry set is the union of (caregivers the agency
 * onboarded via their share link) and (caregivers the agency has downloaded
 * from). An entry with ≥1 download lands in Received; otherwise Submitted.
 * Each caregiver card also carries the CNA/PCA role badge (SCRUM-60). Keyed by
 * (agency, caregiver).
 */
const getAgencyEngagements = async (
  agencyId: string
): Promise<{ received: any[]; submitted: any[] }> => {
  const agencyObjId = new mongoose.Types.ObjectId(agencyId);

  const engagements = await CredentialingEngagement.find({
    agency: agencyId,
  }).lean();

  // Latest download timestamp per caregiver for this agency (SCRUM-67).
  const downloadAgg = await DownloadAudit.aggregate([
    { $match: { agency: agencyObjId } },
    { $group: { _id: '$caregiver', latest: { $max: '$createdAt' } } },
  ]);

  const onboardedMap = new Map<string, Date>();
  engagements.forEach((e: any) =>
    onboardedMap.set(e.caregiver.toString(), e.onboardedAt)
  );

  const downloadedMap = new Map<string, Date>();
  downloadAgg.forEach((d: any) => {
    if (d._id) downloadedMap.set(d._id.toString(), d.latest);
  });

  const caregiverIds = Array.from(
    new Set<string>([...onboardedMap.keys(), ...downloadedMap.keys()])
  );

  const [infos, profInfos] = await Promise.all([
    PersonalInfo.find({ user: { $in: caregiverIds } }).lean(),
    ProfessionalInfo.find({ user: { $in: caregiverIds } })
      .select('user role')
      .lean(),
  ]);
  const infoMap = new Map<string, any>();
  infos.forEach((p: any) => infoMap.set(p.user.toString(), p));
  const roleMap = new Map<string, string>();
  profInfos.forEach((p: any) => {
    if (p.role) roleMap.set(p.user.toString(), p.role);
  });

  const received: any[] = [];
  const submitted: any[] = [];

  for (const caregiverId of caregiverIds) {
    const info = infoMap.get(caregiverId);
    const downloadedAt = downloadedMap.get(caregiverId) || null;
    const entry = {
      caregiverId,
      name: displayName(info, 'Caregiver'),
      image: info?.image || null,
      role: roleMap.get(caregiverId) || null,
      onboardedAt: onboardedMap.get(caregiverId) || null,
      downloadedAt,
    };
    if (downloadedAt) received.push(entry);
    else submitted.push(entry);
  }

  submitted.sort(
    (a, b) => +new Date(b.onboardedAt || 0) - +new Date(a.onboardedAt || 0)
  );
  received.sort(
    (a, b) => +new Date(b.downloadedAt || 0) - +new Date(a.downloadedAt || 0)
  );

  return { received, submitted };
};

export const CredentialingService = {
  recordEngagement,
  notifyCredentialsDownloaded,
  getCaregiverEngagements,
  getAgencyEngagements,
};
