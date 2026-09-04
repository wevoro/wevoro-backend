import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError';
import { uploadFile } from '../../../helpers/bunny-upload';
import { Notification } from '../user/notification.model';
import { PersonalInfo } from '../user/personal-info.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { Offer } from '../offer/offer.model';
import { ESIGN_ROLES, EsignRole, SignaturePacket, SigningDocument } from './esign.model';
import { stampAndStore, buildPackage } from './esign-document.service';
import {
  sendDocumentReplacedEmail,
  sendSignedPackageEmail,
  sendSignatureReminderEmail,
  sendSigningCompleteEmail,
} from './esign-email.service';

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
export const reminderTiersHours = (): number[] =>
  (process.env.ESIGN_REMINDER_HOURS || '2,24,72')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

/**
 * The name printed under the signature.
 *
 * Several accounts are created with firstName AND lastName both set to the
 * email address, which rendered the block as the address printed twice. Drop
 * the duplicate, and strip an address down to its local part so it reads like
 * a name. Resolved every time a document is stamped rather than frozen onto
 * the packet, so a packet created before this existed — or one belonging to a
 * caregiver who has since filled in their real name — comes out correct.
 */
export const signatureName = async (caregiverId: string): Promise<string> => {
  const info = await PersonalInfo.findOne({ user: caregiverId }).select(
    'firstName lastName'
  );
  const first = (info?.firstName || '').trim();
  const last = (info?.lastName || '').trim();
  const joined =
    first && last && first.toLowerCase() !== last.toLowerCase()
      ? `${first} ${last}`
      : first || last;
  return (
    (joined.includes('@')
      ? joined.split('@')[0].replace(/[._-]+/g, ' ').trim()
      : joined) || 'WeVoro Caregiver'
  );
};

const displayName = async (userId: string): Promise<string> => {
  const info = await PersonalInfo.findOne({ user: userId }).select(
    'firstName lastName companyName'
  );
  const person = `${info?.firstName || ''} ${info?.lastName || ''}`.trim();
  return (info as any)?.companyName || person || 'A WeVoro user';
};

const caregiverRole = async (userId: string): Promise<EsignRole> => {
  const info = await ProfessionalInfo.findOne({ user: userId }).select('role');
  return (info?.role as EsignRole) || 'CNA';
};

const titleFromFileName = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim() || fileName;

// ---------------------------------------------------------------------------
// Agency library (SCRUM-117)
// ---------------------------------------------------------------------------

/** The Documents page payload: both role groups + footer counts. */
export const getLibrary = async (agencyId: string) => {
  const docs = await SigningDocument.find({ agency: agencyId, status: 'active' }).sort({
    createdAt: 1,
  });

  const groups: Record<string, any> = {};
  for (const role of ESIGN_ROLES) {
    const packets = await SignaturePacket.find({ agency: agencyId, role }).select('status');
    groups[role] = {
      role,
      documents: docs.filter((d) => d.role === role),
      caregiversSent: packets.length,
      fullySigned: packets.filter((p) => p.status === 'completed').length,
    };
  }
  return groups;
};

/**
 * A packet is a snapshot of the library taken when the caregiver connected, so
 * a document uploaded afterwards would never reach anyone already onboarding —
 * the agency saw two documents in the group while the caregiver was still only
 * asked to sign one.
 *
 * This pushes the missing active documents into a packet. It matches on the
 * source document id, so a document already present in any state (signed,
 * pending or outdated) is never issued twice, and a document the agency has
 * since removed is never reintroduced.
 *
 * Returns the documents that were actually added.
 */
const reconcilePacketItems = (packet: any, docs: any[]): any[] => {
  const present = new Set(
    (packet.items as any[]).map((i) => String(i.signingDocument))
  );
  const missing = docs.filter((d) => !present.has(String(d._id)));
  for (const d of missing) {
    (packet.items as any[]).push({
      signingDocument: d._id,
      title: d.title,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      version: d.version,
      status: 'pending',
    });
  }
  return missing;
};

/**
 * Issue newly uploaded documents into every packet still open for that role,
 * mirroring how replaceDocument re-issues a new version. Completed packets are
 * left alone: reopening finished paperwork is a product decision, not a bug fix.
 */
const issueToOpenPackets = async (
  agencyId: string,
  role: EsignRole,
  docs: any[]
): Promise<number> => {
  if (!docs.length) return 0;
  const packets = await SignaturePacket.find({
    agency: agencyId,
    role,
    status: { $ne: 'completed' },
  });
  const agencyName = await displayName(agencyId);
  let notified = 0;
  for (const packet of packets) {
    const added = reconcilePacketItems(packet, docs);
    if (!added.length) continue;
    await packet.save();
    notified += 1;
    await Notification.create({
      user: packet.caregiver,
      message:
        `<strong>${added.length === 1 ? 'A new document needs your signature' : `${added.length} new documents need your signature`}</strong><br />` +
        `${agencyName} added ${added.length === 1 ? added[0].title : `${added.length} documents`} to your onboarding.`,
      type: 'esign_added',
      ctaLink: '/pro/offers',
      isRead: false,
    });
  }
  return notified;
};

export const addDocuments = async (
  agencyId: string,
  role: EsignRole,
  files: Array<{ path?: string; originalname: string; mimetype: string; size: number }>
) => {
  if (!ESIGN_ROLES.includes(role)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role must be CNA or PCA');
  }
  const existing = await SigningDocument.countDocuments({
    agency: agencyId,
    role,
    status: 'active',
  });
  if (existing + files.length > MAX_DOCS_PER_GROUP) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `A role group holds at most ${MAX_DOCS_PER_GROUP} documents (${existing} already uploaded)`
    );
  }

  // Per-file validation: only the failing file is rejected, valid files in the
  // same batch proceed (Scenario 6).
  const accepted: any[] = [];
  const rejected: Array<{ fileName: string; reason: string }> = [];
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
    const uploaded: any = await uploadFile(file);
    const doc = await SigningDocument.create({
      agency: agencyId,
      role,
      title: titleFromFileName(file.originalname),
      fileName: file.originalname,
      fileUrl: uploaded?.url || uploaded,
      fileSize: file.size,
      mimeType: file.mimetype,
    });
    accepted.push(doc);
  }

  // Caregivers already onboarding must receive the new documents too, otherwise
  // the agency's group and the caregiver's list disagree for ever.
  const caregiversNotified = await issueToOpenPackets(agencyId, role, accepted);
  return { accepted, rejected, caregiversNotified };
};

/**
 * Replace: bump the version and re-issue automatically — pending copies are
 * marked outdated, the new version is appended to every still-pending packet,
 * and each affected caregiver is notified in-app + email. No manual resend.
 */
export const replaceDocument = async (
  agencyId: string,
  documentId: string,
  file: { path?: string; originalname: string; mimetype: string; size: number }
) => {
  const doc = await SigningDocument.findOne({ _id: documentId, agency: agencyId });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only PDF or DOCX files are accepted');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'File is larger than 10 MB — upload a smaller PDF or DOCX'
    );
  }

  const uploaded: any = await uploadFile(file);
  doc.title = titleFromFileName(file.originalname);
  doc.fileName = file.originalname;
  doc.fileUrl = uploaded?.url || uploaded;
  doc.fileSize = file.size;
  doc.mimeType = file.mimetype;
  doc.version += 1;
  await doc.save();

  // Re-issue into every packet still waiting on the old version.
  const pendingPackets = await SignaturePacket.find({
    status: 'pending',
    'items.signingDocument': doc._id,
    'items.status': 'pending',
  });

  const agencyName = await displayName(agencyId);
  let affected = 0;
  for (const packet of pendingPackets) {
    let touched = false;
    for (const item of packet.items as any[]) {
      if (String(item.signingDocument) === String(doc._id) && item.status === 'pending') {
        item.status = 'outdated';
        touched = true;
      }
    }
    if (!touched) continue;
    (packet.items as any[]).push({
      signingDocument: doc._id,
      title: doc.title,
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      version: doc.version,
      status: 'pending',
    });
    await packet.save();
    affected += 1;

    await Notification.create({
      user: packet.caregiver,
      message:
        `<strong>This document was updated</strong><br />` +
        `Your agency sent a newer version. The previous copy is no longer valid — please sign the updated document below.`,
      type: 'esign_replaced',
      ctaLink: '/pro/offers',
      isRead: false,
    });
    await sendDocumentReplacedEmail({
      caregiverId: String(packet.caregiver),
      agencyName,
      documentTitle: doc.title,
    });
  }
  return { document: doc, caregiversNotified: affected };
};

/** How many caregivers still have a pending copy — powers the warning modal. */
export const pendingCopiesCount = async (agencyId: string, documentId: string) => {
  const doc = await SigningDocument.findOne({ _id: documentId, agency: agencyId });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  const count = await SignaturePacket.countDocuments({
    status: 'pending',
    items: { $elemMatch: { signingDocument: doc._id, status: 'pending' } },
  });
  return { pendingCaregivers: count };
};

/**
 * Remove: new caregivers stop receiving it; copies already awaiting signature
 * are NOT withdrawn (their packets hold snapshots, so nothing else to do).
 */
export const removeDocument = async (agencyId: string, documentId: string) => {
  const doc = await SigningDocument.findOneAndUpdate(
    { _id: documentId, agency: agencyId, status: 'active' },
    { $set: { status: 'removed' } },
    { new: true }
  );
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  return doc;
};

/** Undo for the removal toast. */
export const restoreDocument = async (agencyId: string, documentId: string) => {
  const doc = await SigningDocument.findOneAndUpdate(
    { _id: documentId, agency: agencyId, status: 'removed' },
    { $set: { status: 'active' } },
    { new: true }
  );
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  return doc;
};


/**
 * SCRUM-117/118: an agency downloading a caregiver's credentials IS the
 * "connection" the ticket and the Figma dev notes talk about ("documents
 * auto-send when a caregiver connects"). But every signing surface in the
 * design hangs off an offer, so a connection with no offer had nowhere to show
 * the documents and nothing was ever sent.
 *
 * On the first download we therefore open an offer for that pair, which is what
 * carries "Documents to be signed" to the caregiver. Idempotent: an agency that
 * already has an offer with this caregiver never gets a second one, so repeat
 * downloads are silent.
 *
 * Returns the offer when one was created, otherwise null.
 */
export const ensureOfferOnConnection = async (params: {
  agencyId: string;
  caregiverId: string;
}): Promise<any | null> => {
  const { agencyId, caregiverId } = params;
  const existing = await Offer.findOne({ partner: agencyId, pro: caregiverId });
  if (existing) return null;

  const offer = await Offer.create({
    partner: agencyId,
    pro: caregiverId,
    status: 'pending',
  });
  console.log(
    `[esign] connection offer opened for agency ${agencyId} -> caregiver ${caregiverId}`
  );
  return offer;
};

// ---------------------------------------------------------------------------
// Caregiver packet (SCRUM-118)
// ---------------------------------------------------------------------------

/**
 * What the offer card needs: the documents the caregiver would sign for this
 * agency (their role's active library) and their packet if one exists.
 */
export const getOfferContext = async (params: {
  offerId: string;
  agencyId: string;
  caregiverId: string;
}) => {
  const { offerId, agencyId, caregiverId } = params;
  const role = await caregiverRole(caregiverId);
  const packet = await SignaturePacket.findOne({ offer: offerId, caregiver: caregiverId });
  const active = await SigningDocument.find({ agency: agencyId, role, status: 'active' }).sort({
    createdAt: 1,
  });

  // The offer card lists the packet's items, so reconcile here too — otherwise a
  // document added after the caregiver connected stays invisible on the card
  // until they happen to open the signing modal.
  if (packet && packet.status !== 'completed') {
    const added = reconcilePacketItems(packet, active);
    if (added.length) await packet.save();
  }

  const documents = packet
    ? [] // once a packet exists the snapshot is the source of truth
    : active.map((d: any) => ({
        _id: d._id,
        title: d.title,
        fileName: d.fileName,
        version: d.version,
      }));
  return { role, documents, packet };
};

/**
 * Called when the caregiver completes Step 1 (upload + approval checkbox).
 * Snapshots the agency's active documents for their role into a packet. When
 * the role has no documents the flow is skipped entirely (e-signature is
 * optional per agency — the Continue-anyway path) and null is returned.
 */
export const startPacket = async (params: {
  offerId: string;
  agencyId: string;
  caregiverId: string;
}) => {
  const { offerId, agencyId, caregiverId } = params;
  const role = await caregiverRole(caregiverId);
  const docs = await SigningDocument.find({ agency: agencyId, role, status: 'active' }).sort({
    createdAt: 1,
  });

  const existing = await SignaturePacket.findOne({ offer: offerId, caregiver: caregiverId });
  if (existing) {
    // Resume, never restart — but reconcile first, so a packet created before
    // the library grew (or before addDocuments issued new documents) picks up
    // anything it is missing instead of staying short for ever.
    if (existing.status !== 'completed') {
      const added = reconcilePacketItems(existing, docs);
      if (added.length) await existing.save();
    }
    return existing;
  }
  if (docs.length === 0) return null;

  const stampName = await signatureName(caregiverId);

  return SignaturePacket.create({
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
};

/**
 * Every packet belonging to this caregiver, newest first, with the agency name
 * resolved. Powers the caregiver's signing panel: in credentialing mode the
 * Offers tab shows agency engagements rather than the classic offer box, so
 * without this there is no surface anywhere that a pending packet can be
 * reached from.
 */
export const getMyPackets = async (caregiverId: string) => {
  const packets = await SignaturePacket.find({ caregiver: caregiverId }).sort({ createdAt: -1 });
  return Promise.all(
    packets.map(async (p) => ({
      _id: p._id,
      offer: p.offer,
      role: p.role,
      status: p.status,
      stampName: p.stampName,
      stampId: p.stampId,
      items: p.items,
      agencyName: await displayName(String(p.agency)),
      pendingCount: (p.items as any[]).filter((i) => i.status === 'pending').length,
      signedCount: (p.items as any[]).filter((i) => i.status === 'signed').length,
    }))
  );
};

/**
 * Sign one document. Each signature commits immediately (resume-safe). When
 * the last pending item is signed the packet completes and the agency gets its
 * one and only notification — in-app + email, full completion, never partial.
 */
export const signItem = async (params: {
  packetId: string;
  itemId: string;
  caregiverId: string;
  ip?: string;
  userAgent?: string;
  /** Hand-drawn signature as a PNG data URL, sent with the first signature. */
  signatureImage?: string;
}) => {
  const { packetId, itemId, caregiverId, ip, userAgent, signatureImage } = params;
  const packet = await SignaturePacket.findOne({ _id: packetId, caregiver: caregiverId });
  if (!packet) throw new ApiError(httpStatus.NOT_FOUND, 'Signing packet not found');
  if (packet.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This packet is already fully signed');
  }

  const item = (packet.items as any[]).find((i) => String(i._id) === String(itemId));
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found in packet');
  if (item.status === 'outdated') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This version was replaced — sign the new one');
  }
  if (item.status === 'signed') return packet; // idempotent

  // The drawing is captured once and reused for the rest of the packet.
  if (signatureImage && !packet.signatureImage) {
    packet.signatureImage = signatureImage;
  }

  item.status = 'signed';
  item.signedAt = new Date();
  item.signatureIp = ip;
  item.signatureUserAgent = userAgent;

  // Burn the signature onto the document so there is a real artefact to hand
  // over. A stamping failure must not lose the signature itself, so it is
  // caught: the item stays signed and the file can be regenerated.
  try {
    const agencyName = await displayName(String(packet.agency));
    // Resolved now, not at startPacket: older packets carry a name captured
    // before the duplicate-email cleanup existed.
    const signerName = await signatureName(String(packet.caregiver));
    if (signerName !== packet.stampName) packet.stampName = signerName;
    item.signedFileUrl = await stampAndStore({
      fileUrl: item.fileUrl,
      title: item.title,
      signatureImage: packet.signatureImage,
      signerName,
      stampId: packet.stampId,
      signedAt: item.signedAt,
      ip,
      userAgent,
      agencyName,
    });
  } catch (err: any) {
    console.error(`[esign] could not stamp ${item.title}:`, err?.message);
  }

  const allSigned = (packet.items as any[]).every((i) => i.status !== 'pending');
  if (allSigned) {
    packet.status = 'completed';
    packet.completedAt = new Date();
  }
  await packet.save();

  if (allSigned) {
    const caregiverName = await displayName(String(packet.caregiver));
    const count = (packet.items as any[]).filter((i) => i.status === 'signed').length;
    await Notification.create({
      user: packet.agency,
      message: `<strong>${caregiverName}</strong> signed all ${count} ${packet.role} documents.`,
      type: 'esign_completed',
      ctaLink: '/partner/onboardings',
      isRead: false,
    });
    // Package everything and deliver it. The agency gets the ZIP attached to
    // the completion email AND a copy stored on the packet, so it stays
    // reachable from their account after the email is gone.
    let pkg: { url: string; bytes: Buffer; fileName: string } | null = null;
    try {
      const files = (packet.items as any[])
        .filter((i) => i.status === 'signed' && i.signedFileUrl)
        .map((i) => ({ title: i.title, url: i.signedFileUrl as string }));
      if (files.length) {
        pkg = await buildPackage({ caregiverName, role: packet.role, files });
        packet.packageUrl = pkg.url;
        packet.packageSentAt = new Date();
        await packet.save();
      }
    } catch (err: any) {
      console.error('[esign] could not build the signed package:', err?.message);
    }

    if (pkg) {
      await sendSignedPackageEmail({
        agencyId: String(packet.agency),
        caregiverName,
        role: packet.role,
        count,
        zip: { filename: pkg.fileName, content: pkg.bytes },
      });
    } else {
      await sendSigningCompleteEmail({
        agencyId: String(packet.agency),
        caregiverName,
        role: packet.role,
        count,
      });
    }
  }
  return packet;
};

// ---------------------------------------------------------------------------
// Reminder escalation (SCRUM-118) — system-driven, never via the agency
// ---------------------------------------------------------------------------

/**
 * Scan pending packets and fire the reminder tier that has come due. Each tier
 * fires once per packet (remindersSent records the tier hours). Runs hourly:
 * locally via setInterval, on Vercel via the cron in vercel.json.
 */
export const runSigningReminders = async (): Promise<void> => {
  const tiers = reminderTiersHours();
  const now = Date.now();
  const packets = await SignaturePacket.find({ status: 'pending' });
  console.log(`[esign] reminder scan: ${packets.length} pending packets, tiers ${tiers.join('/')}h`);

  for (const packet of packets) {
    const hoursSinceStep1 = (now - new Date(packet.step1CompletedAt).getTime()) / 3600000;
    const due = tiers.filter(
      (t) => hoursSinceStep1 >= t && !(packet.remindersSent as number[]).includes(t)
    );
    if (due.length === 0) continue;

    // If several tiers lapsed while the job was down, send ONE reminder and
    // mark them all — never burst multiple emails at once.
    const pendingCount = (packet.items as any[]).filter((i) => i.status === 'pending').length;
    if (pendingCount === 0) continue;
    const agencyName = await displayName(String(packet.agency));

    await Notification.create({
      user: packet.caregiver,
      message: `<strong>${agencyName}</strong> is waiting on your signature on ${pendingCount} ${
        pendingCount === 1 ? 'document' : 'documents'
      }. It only takes a minute to finish.`,
      type: 'esign_reminder',
      ctaLink: '/pro/offers',
      isRead: false,
    });
    await sendSignatureReminderEmail({
      caregiverId: String(packet.caregiver),
      agencyName,
      pendingCount,
      role: packet.role,
      // The template prints "reminder N", so count what has already gone out.
      reminderNumber: (packet.remindersSent as number[]).length + 1,
    });
    (packet.remindersSent as number[]).push(...due);
    await packet.save();
    console.log(
      `[esign] reminder (tier ${due.join('+')}h) sent to caregiver ${packet.caregiver} for packet ${packet._id}`
    );
  }
};
