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
exports.runSigningReminders = exports.signItem = exports.getMyPackets = exports.startPacket = exports.getOfferContext = exports.restoreDocument = exports.removeDocument = exports.pendingCopiesCount = exports.replaceDocument = exports.addDocuments = exports.getLibrary = exports.reminderTiersHours = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const notification_model_1 = require("../user/notification.model");
const personal_info_model_1 = require("../user/personal-info.model");
const professional_info_model_1 = require("../user/professional-info.model");
const esign_model_1 = require("./esign.model");
const esign_email_service_1 = require("./esign-email.service");
/**
 * SCRUM-117/118: e-signature service.
 *
 * Agency side (117): the per-role signing library — upload, replace, remove —
 * plus the sent / fully-signed counts the Documents page shows per group.
 *
 * Caregiver side (118): the signature packet snapshotted at Step 1 of the
 * accept flow, signed document-by-document, resumable, with the agency
 * notified on FULL completion only and a system-driven reminder escalation
 * while signing is stalled.
 */
const MAX_DOCS_PER_GROUP = 10; // 2026-08-31 meeting decision
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
/**
 * Reminder escalation tiers, in hours after Step 1 completion. Deliberately
 * configurable via env (ESIGN_REMINDER_HOURS="2,24,72") so the cadence can be
 * tuned without a code change — the final policy is still to be set by
 * Alfonza/Faisal/Emon. This is NOT the credential-expiration band policy;
 * signature reminders run on hours-to-days, not weeks.
 */
const reminderTiersHours = () => (process.env.ESIGN_REMINDER_HOURS || '2,24,72')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
exports.reminderTiersHours = reminderTiersHours;
const displayName = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName lastName companyName');
    const person = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim();
    return (info === null || info === void 0 ? void 0 : info.companyName) || person || 'A WeVoro user';
});
const caregiverRole = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const info = yield professional_info_model_1.ProfessionalInfo.findOne({ user: userId }).select('role');
    return (info === null || info === void 0 ? void 0 : info.role) || 'CNA';
});
const titleFromFileName = (fileName) => fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || fileName;
// ---------------------------------------------------------------------------
// Agency library (SCRUM-117)
// ---------------------------------------------------------------------------
/** The Documents page payload: both role groups + footer counts. */
const getLibrary = (agencyId) => __awaiter(void 0, void 0, void 0, function* () {
    const docs = yield esign_model_1.SigningDocument.find({ agency: agencyId, status: 'active' }).sort({
        createdAt: 1,
    });
    const groups = {};
    for (const role of esign_model_1.ESIGN_ROLES) {
        const packets = yield esign_model_1.SignaturePacket.find({ agency: agencyId, role }).select('status');
        groups[role] = {
            role,
            documents: docs.filter((d) => d.role === role),
            caregiversSent: packets.length,
            fullySigned: packets.filter((p) => p.status === 'completed').length,
        };
    }
    return groups;
});
exports.getLibrary = getLibrary;
const addDocuments = (agencyId, role, files) => __awaiter(void 0, void 0, void 0, function* () {
    if (!esign_model_1.ESIGN_ROLES.includes(role)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Role must be CNA or PCA');
    }
    const existing = yield esign_model_1.SigningDocument.countDocuments({
        agency: agencyId,
        role,
        status: 'active',
    });
    if (existing + files.length > MAX_DOCS_PER_GROUP) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `A role group holds at most ${MAX_DOCS_PER_GROUP} documents (${existing} already uploaded)`);
    }
    // Per-file validation: only the failing file is rejected, valid files in the
    // same batch proceed (Scenario 6).
    const accepted = [];
    const rejected = [];
    for (const file of files) {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            rejected.push({ fileName: file.originalname, reason: 'Only PDF or DOCX files are accepted' });
            continue;
        }
        if (file.size > MAX_FILE_BYTES) {
            rejected.push({
                fileName: file.originalname,
                reason: 'File is larger than 10 MB — upload a smaller PDF or DOCX',
            });
            continue;
        }
        const uploaded = yield (0, bunny_upload_1.uploadFile)(file);
        const doc = yield esign_model_1.SigningDocument.create({
            agency: agencyId,
            role,
            title: titleFromFileName(file.originalname),
            fileName: file.originalname,
            fileUrl: (uploaded === null || uploaded === void 0 ? void 0 : uploaded.url) || uploaded,
            fileSize: file.size,
            mimeType: file.mimetype,
        });
        accepted.push(doc);
    }
    return { accepted, rejected };
});
exports.addDocuments = addDocuments;
/**
 * Replace: bump the version and re-issue automatically — pending copies are
 * marked outdated, the new version is appended to every still-pending packet,
 * and each affected caregiver is notified in-app + email. No manual resend.
 */
const replaceDocument = (agencyId, documentId, file) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield esign_model_1.SigningDocument.findOne({ _id: documentId, agency: agencyId });
    if (!doc)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    if (!ALLOWED_MIME.includes(file.mimetype)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Only PDF or DOCX files are accepted');
    }
    if (file.size > MAX_FILE_BYTES) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'File is larger than 10 MB — upload a smaller PDF or DOCX');
    }
    const uploaded = yield (0, bunny_upload_1.uploadFile)(file);
    doc.title = titleFromFileName(file.originalname);
    doc.fileName = file.originalname;
    doc.fileUrl = (uploaded === null || uploaded === void 0 ? void 0 : uploaded.url) || uploaded;
    doc.fileSize = file.size;
    doc.mimeType = file.mimetype;
    doc.version += 1;
    yield doc.save();
    // Re-issue into every packet still waiting on the old version.
    const pendingPackets = yield esign_model_1.SignaturePacket.find({
        status: 'pending',
        'items.signingDocument': doc._id,
        'items.status': 'pending',
    });
    const agencyName = yield displayName(agencyId);
    let affected = 0;
    for (const packet of pendingPackets) {
        let touched = false;
        for (const item of packet.items) {
            if (String(item.signingDocument) === String(doc._id) && item.status === 'pending') {
                item.status = 'outdated';
                touched = true;
            }
        }
        if (!touched)
            continue;
        packet.items.push({
            signingDocument: doc._id,
            title: doc.title,
            fileName: doc.fileName,
            fileUrl: doc.fileUrl,
            version: doc.version,
            status: 'pending',
        });
        yield packet.save();
        affected += 1;
        yield notification_model_1.Notification.create({
            user: packet.caregiver,
            message: `<strong>This document was updated</strong><br />` +
                `Your agency sent a newer version. The previous copy is no longer valid — please sign the updated document below.`,
            type: 'esign_replaced',
            ctaLink: '/pro/offers',
            isRead: false,
        });
        yield (0, esign_email_service_1.sendDocumentReplacedEmail)({
            caregiverId: String(packet.caregiver),
            agencyName,
            documentTitle: doc.title,
        });
    }
    return { document: doc, caregiversNotified: affected };
});
exports.replaceDocument = replaceDocument;
/** How many caregivers still have a pending copy — powers the warning modal. */
const pendingCopiesCount = (agencyId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield esign_model_1.SigningDocument.findOne({ _id: documentId, agency: agencyId });
    if (!doc)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    const count = yield esign_model_1.SignaturePacket.countDocuments({
        status: 'pending',
        items: { $elemMatch: { signingDocument: doc._id, status: 'pending' } },
    });
    return { pendingCaregivers: count };
});
exports.pendingCopiesCount = pendingCopiesCount;
/**
 * Remove: new caregivers stop receiving it; copies already awaiting signature
 * are NOT withdrawn (their packets hold snapshots, so nothing else to do).
 */
const removeDocument = (agencyId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield esign_model_1.SigningDocument.findOneAndUpdate({ _id: documentId, agency: agencyId, status: 'active' }, { $set: { status: 'removed' } }, { new: true });
    if (!doc)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    return doc;
});
exports.removeDocument = removeDocument;
/** Undo for the removal toast. */
const restoreDocument = (agencyId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const doc = yield esign_model_1.SigningDocument.findOneAndUpdate({ _id: documentId, agency: agencyId, status: 'removed' }, { $set: { status: 'active' } }, { new: true });
    if (!doc)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found');
    return doc;
});
exports.restoreDocument = restoreDocument;
// ---------------------------------------------------------------------------
// Caregiver packet (SCRUM-118)
// ---------------------------------------------------------------------------
/**
 * What the offer card needs: the documents the caregiver would sign for this
 * agency (their role's active library) and their packet if one exists.
 */
const getOfferContext = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { offerId, agencyId, caregiverId } = params;
    const role = yield caregiverRole(caregiverId);
    const packet = yield esign_model_1.SignaturePacket.findOne({ offer: offerId, caregiver: caregiverId });
    const documents = packet
        ? [] // once a packet exists the snapshot is the source of truth
        : yield esign_model_1.SigningDocument.find({ agency: agencyId, role, status: 'active' }).select('title fileName version');
    return { role, documents, packet };
});
exports.getOfferContext = getOfferContext;
/**
 * Called when the caregiver completes Step 1 (upload + approval checkbox).
 * Snapshots the agency's active documents for their role into a packet. When
 * the role has no documents the flow is skipped entirely (e-signature is
 * optional per agency — the Continue-anyway path) and null is returned.
 */
const startPacket = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { offerId, agencyId, caregiverId } = params;
    const existing = yield esign_model_1.SignaturePacket.findOne({ offer: offerId, caregiver: caregiverId });
    if (existing)
        return existing; // resume, never restart
    const role = yield caregiverRole(caregiverId);
    const docs = yield esign_model_1.SigningDocument.find({ agency: agencyId, role, status: 'active' }).sort({
        createdAt: 1,
    });
    if (docs.length === 0)
        return null;
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: caregiverId }).select('firstName lastName');
    const stampName = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim() || 'WeVoro Caregiver';
    return esign_model_1.SignaturePacket.create({
        offer: offerId,
        agency: agencyId,
        caregiver: caregiverId,
        role,
        stampName,
        stampId: `WV-SIG-${new Date().getFullYear()}-${Math.random()
            .toString(16)
            .slice(2, 8)
            .toUpperCase()}`,
        step1CompletedAt: new Date(),
        items: docs.map((d) => ({
            signingDocument: d._id,
            title: d.title,
            fileName: d.fileName,
            fileUrl: d.fileUrl,
            version: d.version,
            status: 'pending',
        })),
    });
});
exports.startPacket = startPacket;
/**
 * Every packet belonging to this caregiver, newest first, with the agency name
 * resolved. Powers the caregiver's signing panel: in credentialing mode the
 * Offers tab shows agency engagements rather than the classic offer box, so
 * without this there is no surface anywhere that a pending packet can be
 * reached from.
 */
const getMyPackets = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    const packets = yield esign_model_1.SignaturePacket.find({ caregiver: caregiverId }).sort({ createdAt: -1 });
    return Promise.all(packets.map((p) => __awaiter(void 0, void 0, void 0, function* () {
        return ({
            _id: p._id,
            offer: p.offer,
            role: p.role,
            status: p.status,
            stampName: p.stampName,
            stampId: p.stampId,
            items: p.items,
            agencyName: yield displayName(String(p.agency)),
            pendingCount: p.items.filter((i) => i.status === 'pending').length,
            signedCount: p.items.filter((i) => i.status === 'signed').length,
        });
    })));
});
exports.getMyPackets = getMyPackets;
/**
 * Sign one document. Each signature commits immediately (resume-safe). When
 * the last pending item is signed the packet completes and the agency gets its
 * one and only notification — in-app + email, full completion, never partial.
 */
const signItem = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const { packetId, itemId, caregiverId, ip, userAgent } = params;
    const packet = yield esign_model_1.SignaturePacket.findOne({ _id: packetId, caregiver: caregiverId });
    if (!packet)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Signing packet not found');
    if (packet.status === 'completed') {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'This packet is already fully signed');
    }
    const item = packet.items.find((i) => String(i._id) === String(itemId));
    if (!item)
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Document not found in packet');
    if (item.status === 'outdated') {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'This version was replaced — sign the new one');
    }
    if (item.status === 'signed')
        return packet; // idempotent
    item.status = 'signed';
    item.signedAt = new Date();
    item.signatureIp = ip;
    item.signatureUserAgent = userAgent;
    const allSigned = packet.items.every((i) => i.status !== 'pending');
    if (allSigned) {
        packet.status = 'completed';
        packet.completedAt = new Date();
    }
    yield packet.save();
    if (allSigned) {
        const caregiverName = yield displayName(String(packet.caregiver));
        const count = packet.items.filter((i) => i.status === 'signed').length;
        yield notification_model_1.Notification.create({
            user: packet.agency,
            message: `<strong>${caregiverName}</strong> signed all ${count} ${packet.role} documents.`,
            type: 'esign_completed',
            ctaLink: '/partner/onboardings',
            isRead: false,
        });
        yield (0, esign_email_service_1.sendSigningCompleteEmail)({
            agencyId: String(packet.agency),
            caregiverName,
            role: packet.role,
            count,
        });
    }
    return packet;
});
exports.signItem = signItem;
// ---------------------------------------------------------------------------
// Reminder escalation (SCRUM-118) — system-driven, never via the agency
// ---------------------------------------------------------------------------
/**
 * Scan pending packets and fire the reminder tier that has come due. Each tier
 * fires once per packet (remindersSent records the tier hours). Runs hourly:
 * locally via setInterval, on Vercel via the cron in vercel.json.
 */
const runSigningReminders = () => __awaiter(void 0, void 0, void 0, function* () {
    const tiers = (0, exports.reminderTiersHours)();
    const now = Date.now();
    const packets = yield esign_model_1.SignaturePacket.find({ status: 'pending' });
    console.log(`[esign] reminder scan: ${packets.length} pending packets, tiers ${tiers.join('/')}h`);
    for (const packet of packets) {
        const hoursSinceStep1 = (now - new Date(packet.step1CompletedAt).getTime()) / 3600000;
        const due = tiers.filter((t) => hoursSinceStep1 >= t && !packet.remindersSent.includes(t));
        if (due.length === 0)
            continue;
        // If several tiers lapsed while the job was down, send ONE reminder and
        // mark them all — never burst multiple emails at once.
        const pendingCount = packet.items.filter((i) => i.status === 'pending').length;
        if (pendingCount === 0)
            continue;
        const agencyName = yield displayName(String(packet.agency));
        yield notification_model_1.Notification.create({
            user: packet.caregiver,
            message: `<strong>${agencyName}</strong> is waiting on your signature on ${pendingCount} ${pendingCount === 1 ? 'document' : 'documents'}. It only takes a minute to finish.`,
            type: 'esign_reminder',
            ctaLink: '/pro/offers',
            isRead: false,
        });
        yield (0, esign_email_service_1.sendSignatureReminderEmail)({
            caregiverId: String(packet.caregiver),
            agencyName,
            pendingCount,
            role: packet.role,
            // The template prints "reminder N", so count what has already gone out.
            reminderNumber: packet.remindersSent.length + 1,
        });
        packet.remindersSent.push(...due);
        yield packet.save();
        console.log(`[esign] reminder (tier ${due.join('+')}h) sent to caregiver ${packet.caregiver} for packet ${packet._id}`);
    }
});
exports.runSigningReminders = runSigningReminders;
