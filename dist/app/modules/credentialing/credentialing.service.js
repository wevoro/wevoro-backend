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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialingService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const credentialing_engagement_model_1 = require("./credentialing-engagement.model");
const download_audit_model_1 = require("../document/download-audit.model");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const notification_model_1 = require("../user/notification.model");
/**
 * SCRUM-87/88: Credentialing-mode engagement service.
 *
 * Consumes share-onboarding attribution (this module) + download events
 * (SCRUM-67 DownloadAudit) to drive the repurposed Offers tab on both sides.
 */
const displayName = (info, fallback) => {
    var _a;
    return ((_a = info === null || info === void 0 ? void 0 : info.companyName) === null || _a === void 0 ? void 0 : _a.trim()) ||
        `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() ||
        fallback;
};
/**
 * Record that `agencyId` onboarded via `caregiverId`'s share link.
 *
 * Idempotent: at most one engagement per (caregiver, agency) pair, so the
 * "Agency Onboarded" notification fires exactly once (SCRUM-87 Scenario 4 parity
 * for the onboarding event). Safe to call on every onboarding save.
 */
const recordEngagement = (caregiverId, agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!caregiverId || !agencyId)
        return null;
    if (caregiverId.toString() === agencyId.toString())
        return null;
    const existing = yield credentialing_engagement_model_1.CredentialingEngagement.findOne({
        caregiver: caregiverId,
        agency: agencyId,
    });
    if (existing)
        return existing; // already recorded — do not re-notify
    let engagement;
    try {
        engagement = yield credentialing_engagement_model_1.CredentialingEngagement.create({
            caregiver: caregiverId,
            agency: agencyId,
            onboardedAt: new Date(),
        });
    }
    catch (err) {
        // Unique-index race: another request just created it. Treat as recorded.
        if ((err === null || err === void 0 ? void 0 : err.code) === 11000) {
            return credentialing_engagement_model_1.CredentialingEngagement.findOne({
                caregiver: caregiverId,
                agency: agencyId,
            });
        }
        throw err;
    }
    // SCRUM-87: notify the caregiver, CTA deep-links to the Submitted entry.
    const agencyInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: agencyId });
    const agencyName = displayName(agencyInfo, 'An agency');
    yield notification_model_1.Notification.create({
        user: caregiverId,
        message: `<strong>${agencyName}</strong> onboarded to WeVoro via your share link.`,
        type: 'agency_onboarded',
        ctaLink: '/pro/offers?tab=submitted',
        isRead: false,
    });
    return engagement;
});
/**
 * SCRUM-67: fire the one-time "Credentials Downloaded" notification to the
 * caregiver. Caller (download.service) is responsible for first-download
 * detection so this fires exactly once per (caregiver, agency) pair.
 */
const notifyCredentialsDownloaded = (caregiverId, agencyName) => __awaiter(void 0, void 0, void 0, function* () {
    yield notification_model_1.Notification.create({
        user: caregiverId,
        message: `<strong>${agencyName || 'An agency'}</strong> downloaded your credentials.`,
        type: 'credentials_downloaded',
        ctaLink: '/pro/offers?tab=received',
        isRead: false,
    });
});
/**
 * SCRUM-87: caregiver's view of the repurposed Offers tab.
 *
 * The entry set is the union of (agencies engaged via the caregiver's share
 * link) and (agencies that have downloaded the caregiver's credentials). An
 * entry with ≥1 download lands in Received (with the latest download date);
 * otherwise it stays in Submitted. Keyed by (caregiver, agency).
 */
const getCaregiverEngagements = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const caregiverObjId = new mongoose_1.default.Types.ObjectId(caregiverId);
    const engagements = yield credentialing_engagement_model_1.CredentialingEngagement.find({
        caregiver: caregiverId,
    }).lean();
    // Latest download timestamp per agency for this caregiver (SCRUM-67).
    const downloadAgg = yield download_audit_model_1.DownloadAudit.aggregate([
        { $match: { caregiver: caregiverObjId } },
        { $group: { _id: '$agency', latest: { $max: '$createdAt' } } },
    ]);
    const onboardedMap = new Map();
    engagements.forEach((e) => onboardedMap.set(e.agency.toString(), e.onboardedAt));
    const downloadedMap = new Map();
    downloadAgg.forEach((d) => {
        if (d._id)
            downloadedMap.set(d._id.toString(), d.latest);
    });
    const agencyIds = Array.from(new Set([...onboardedMap.keys(), ...downloadedMap.keys()]));
    const infos = yield personal_info_model_1.PersonalInfo.find({ user: { $in: agencyIds } }).lean();
    const infoMap = new Map();
    infos.forEach((p) => infoMap.set(p.user.toString(), p));
    const received = [];
    const submitted = [];
    for (const agencyId of agencyIds) {
        const info = infoMap.get(agencyId);
        const downloadedAt = downloadedMap.get(agencyId) || null;
        const entry = {
            agencyId,
            name: displayName(info, 'Agency'),
            image: (info === null || info === void 0 ? void 0 : info.image) || null,
            onboardedAt: onboardedMap.get(agencyId) || null,
            downloadedAt,
        };
        if (downloadedAt)
            received.push(entry);
        else
            submitted.push(entry);
    }
    submitted.sort((a, b) => +new Date(b.onboardedAt || 0) - +new Date(a.onboardedAt || 0));
    received.sort((a, b) => +new Date(b.downloadedAt || 0) - +new Date(a.downloadedAt || 0));
    return { received, submitted };
});
/**
 * SCRUM-88: agency's view of the repurposed Offers tab — the symmetric mirror of
 * getCaregiverEngagements. Entry set is the union of (caregivers the agency
 * onboarded via their share link) and (caregivers the agency has downloaded
 * from). An entry with ≥1 download lands in Received; otherwise Submitted.
 * Each caregiver card also carries the CNA/PCA role badge (SCRUM-60). Keyed by
 * (agency, caregiver).
 */
const getAgencyEngagements = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    const agencyObjId = new mongoose_1.default.Types.ObjectId(agencyId);
    const engagements = yield credentialing_engagement_model_1.CredentialingEngagement.find({
        agency: agencyId,
    }).lean();
    // Latest download timestamp per caregiver for this agency (SCRUM-67).
    const downloadAgg = yield download_audit_model_1.DownloadAudit.aggregate([
        { $match: { agency: agencyObjId } },
        { $group: { _id: '$caregiver', latest: { $max: '$createdAt' } } },
    ]);
    const onboardedMap = new Map();
    engagements.forEach((e) => onboardedMap.set(e.caregiver.toString(), e.onboardedAt));
    const downloadedMap = new Map();
    downloadAgg.forEach((d) => {
        if (d._id)
            downloadedMap.set(d._id.toString(), d.latest);
    });
    const caregiverIds = Array.from(new Set([...onboardedMap.keys(), ...downloadedMap.keys()]));
    const [infos, profInfos] = yield Promise.all([
        personal_info_model_1.PersonalInfo.find({ user: { $in: caregiverIds } }).lean(),
        professional_info_model_1.ProfessionalInfo.find({ user: { $in: caregiverIds } })
            .select('user role')
            .lean(),
    ]);
    const infoMap = new Map();
    infos.forEach((p) => infoMap.set(p.user.toString(), p));
    const roleMap = new Map();
    profInfos.forEach((p) => {
        if (p.role)
            roleMap.set(p.user.toString(), p.role);
    });
    const received = [];
    const submitted = [];
    for (const caregiverId of caregiverIds) {
        const info = infoMap.get(caregiverId);
        const downloadedAt = downloadedMap.get(caregiverId) || null;
        const entry = {
            caregiverId,
            name: displayName(info, 'Caregiver'),
            image: (info === null || info === void 0 ? void 0 : info.image) || null,
            role: roleMap.get(caregiverId) || null,
            onboardedAt: onboardedMap.get(caregiverId) || null,
            downloadedAt,
        };
        if (downloadedAt)
            received.push(entry);
        else
            submitted.push(entry);
    }
    submitted.sort((a, b) => +new Date(b.onboardedAt || 0) - +new Date(a.onboardedAt || 0));
    received.sort((a, b) => +new Date(b.downloadedAt || 0) - +new Date(a.downloadedAt || 0));
    return { received, submitted };
});
exports.CredentialingService = {
    recordEngagement,
    notifyCredentialsDownloaded,
    getCaregiverEngagements,
    getAgencyEngagements,
};
