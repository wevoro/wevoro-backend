import { Types } from 'mongoose';
import { Documents } from './documents.model';
import { DownloadAudit } from './download-audit.model';
import { PrivateAccess } from './private-access.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { Notification } from '../user/notification.model';
import { PersonalInfo } from '../user/personal-info.model';
import { CredentialingService } from '../credentialing/credentialing.service';
import { filterVisibleDocuments, isSensitiveCredential, isAgencyConfirmed } from './credential-visibility';
import { User } from '../user/user.model';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';
import {
  REQUIRED_CREDENTIAL_KEYS,
  credentialDisplayRank,
  isPrimaryCredentialRow,
} from '../../../constants/credentials';
import { SignaturePacket } from '../esign/esign.model';

/**
 * SCRUM-67: Download Service
 * Handles individual and bulk credential document downloads,
 * private access consent flow, and audit trail logging.
 */

/**
 * SCRUM-119/115: the paywall.
 *
 * Viewing a caregiver stays free; paying is required to DOWNLOAD their
 * credential packet. Entitlement is per (agency, caregiver) pair and permanent,
 * so a re-download never charges twice.
 *
 * SCRUM-141: the signature gate sits in front of this one — checkout refuses
 * until the caregiver has responded, so no new entitlement can exist without
 * it. A packet bought before that gate existed keeps downloading.
 *
 * Throws 402 Payment Required carrying the price, which is what tells the
 * client to open the payment gate rather than showing a generic error.
 */
const requirePacketEntitlement = async (
  agencyId: string,
  caregiverId: string
): Promise<void> => {
  // Imported lazily: the document module is loaded on routes that have nothing
  // to do with payments, and this keeps the Stripe SDK out of their cold start.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { hasEntitlement } = require('../payment/payment.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getCurrentPriceCents } = require('../pricing/pricing.service');

  if (await hasEntitlement(agencyId, caregiverId)) return;

  const priceCents = await getCurrentPriceCents();
  const error: any = new ApiError(
    402,
    'Payment required to download this credential packet'
  );
  error.priceCents = priceCents;
  error.caregiverId = caregiverId;
  throw error;
};

/**
 * SCRUM-67: a malformed caregiver id in a download link is "not found", said in
 * words. Left to Mongoose it throws a CastError, which the global handler sends
 * back as a 400 reading "Cast Error" — and the client shows that to the agency.
 */
const assertCaregiverId = (caregiverId: string): void => {
  if (!Types.ObjectId.isValid(caregiverId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Caregiver not found');
  }
};

/**
 * Check if an agency has download access to a caregiver's documents.
 * Access requires: share-flow onboarding OR active engagement.
 */
// SCRUM-99: gate a single credential download. An agency can download a
// sensitive credential only once it is Confirmed (approved); general
// credentials are always downloadable. Owner/admin always allowed.
const hasDownloadAccess = async (
  agencyId: string,
  caregiverId: string,
  // SCRUM-177: the whole row, because a document's tier now depends on its
  // category as well as its type. Absent when the caller is asking about the
  // caregiver as a whole rather than one file.
  document?: { documentType?: string | null; category?: string | null }
): Promise<boolean> => {
  if (!agencyId || agencyId.toString() === caregiverId.toString()) return true;
  if (!document || !isSensitiveCredential(document)) return true;

  const agency = await User.findById(agencyId, { status: 1, role: 1 });
  if (agency && (agency.role === 'admin' || agency.role === 'super_admin')) {
    return true;
  }
  return isAgencyConfirmed(agency?.status);
};

/**
 * SCRUM-119 (A9): the real type of a stored file.
 *
 * The documents modal labels every row "PDF" in red because nothing recorded
 * what a file actually is, while caregivers may upload JPG and PNG credentials
 * and Faisal's A9 frame shows a green "JPG" on the Driver's License. The upload
 * keeps the original extension on the CDN name (helpers/bunny-upload.ts), so
 * that is read first; a name with no usable extension falls back to the
 * content-type the CDN reports.
 */
const FILE_TYPES: Record<string, { fileType: string; mimeType: string }> = {
  pdf: { fileType: 'PDF', mimeType: 'application/pdf' },
  jpg: { fileType: 'JPG', mimeType: 'image/jpeg' },
  jpeg: { fileType: 'JPG', mimeType: 'image/jpeg' },
  png: { fileType: 'PNG', mimeType: 'image/png' },
  gif: { fileType: 'GIF', mimeType: 'image/gif' },
  webp: { fileType: 'WEBP', mimeType: 'image/webp' },
  heic: { fileType: 'HEIC', mimeType: 'image/heic' },
  doc: { fileType: 'DOC', mimeType: 'application/msword' },
  docx: {
    fileType: 'DOCX',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
};

export const fileTypeFromUrl = (
  url?: string | null
): { fileType: string; mimeType: string } | null => {
  const name = String(url || '').split(/[?#]/)[0].split('/').pop() || '';
  if (!name.includes('.')) return null;
  return FILE_TYPES[name.split('.').pop()!.toLowerCase()] ?? null;
};

const fileTypeFromMime = (
  contentType?: string | null
): { fileType: string; mimeType: string } | null => {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!mime) return null;
  return Object.values(FILE_TYPES).find((t) => t.mimeType === mime) ?? null;
};

/**
 * Type and size of a stored file for a manifest row. Only asks the CDN (HEAD,
 * short timeout) for what the database cannot answer, so a normal row costs no
 * request at all; a slow or failed answer just leaves the value off.
 */
const describeFile = async (
  url: string | null | undefined,
  knownSize?: number | null
): Promise<{ fileType: string | null; mimeType: string | null; fileSize: number | null }> => {
  const fromName = fileTypeFromUrl(url);
  const size = Number(knownSize);
  const haveSize = Number.isFinite(size) && size > 0;
  if (!url || (fromName && haveSize)) {
    return {
      fileType: fromName?.fileType ?? null,
      mimeType: fromName?.mimeType ?? null,
      fileSize: haveSize ? size : null,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    const type = fromName ?? fileTypeFromMime(res.headers.get('content-type'));
    const len = Number(res.headers.get('content-length'));
    return {
      fileType: type?.fileType ?? null,
      mimeType: type?.mimeType ?? null,
      fileSize: haveSize ? size : Number.isFinite(len) && len > 0 ? len : null,
    };
  } catch {
    return {
      fileType: fromName?.fileType ?? null,
      mimeType: fromName?.mimeType ?? null,
      fileSize: haveSize ? size : null,
    };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Every credential WeVoro has confirmed for this caregiver, before the SCRUM-99
 * tier gate is applied. The packet, the ZIP, the one-file download and the
 * receipt all derive from this, so they cannot disagree about what is in it.
 */
const getConfirmedCredentials = async (caregiverId: string): Promise<any[]> => {
  // SCRUM-131: a packet may only contain credentials WeVoro has confirmed.
  // SCRUM-67 Scenario 3 forbids shipping a Pending credential — an agency must
  // never pay for a document nobody has verified.
  //
  // And credentials ONLY: the five required types, plus the GCHEXS background
  // check added below. Supporting documents (resume, letters and the like) are
  // not part of the packet. They used to be shipped — including ones the
  // caregiver had marked Private, whose upload modal promises "only after your
  // consent" — so the list and the ZIP both carried files the agency had no
  // business receiving.
  const confirmed: any[] = await Documents.find({
    user: caregiverId,
    url: { $exists: true, $nin: [null, ''] },
    documentType: { $in: REQUIRED_CREDENTIAL_KEYS as unknown as string[] },
    reviewStatus: 'approved',
  });
  // SCRUM-155: the package lists credentials in the display order every screen
  // uses. Unsorted, the ZIP and the package window followed upload order.
  //
  // SCRUM-165: an approved RN/LPN practical sign-off is a 'certifications' row,
  // so it ships here with no query change, but it ranked level with the
  // certificate and could land above it. It goes right after it instead.
  const signoffLast = (d: any): number => (isPrimaryCredentialRow(d) ? 0 : 1);
  confirmed.sort(
    (a, b) =>
      credentialDisplayRank(a.documentType) - credentialDisplayRank(b.documentType) ||
      signoffLast(a) - signoffLast(b)
  );

  // SCRUM-67 / SCRUM-131: the GCHEXS background check follows the same rule.
  // It used to be built straight from ProfessionalInfo.gchexsDocumentUrl with
  // no review check at all, so a Pending background check went out in paid
  // packets (Priya Nair and Lena Thompson on QA) while every other credential
  // was held back. SCRUM-151 keeps the caregiver's GCHEXS Documents row in step
  // with the admin's background-check decision, so that row's reviewStatus is
  // the verdict.
  //
  // The caregiver still has to be saying "yes": answering "no" later keeps the
  // file on record (SCRUM-66) but withdraws it from the packet, as before.
  const profInfo = await ProfessionalInfo.findOne({ user: caregiverId }).select(
    'gchexsStatus'
  );
  if (profInfo?.gchexsStatus === 'yes') {
    // The newest row is the live one. SCRUM-146 left older duplicates in
    // place, and one of those approved before a re-upload must not stand in
    // for the replacement that is still waiting for review.
    const gchexs: any = await Documents.findOne({
      user: caregiverId,
      documentType: 'gchexs',
      url: { $exists: true, $nin: [null, ''] },
    })
      .sort({ updatedAt: -1 })
      .lean();
    if (gchexs?.reviewStatus === 'approved') {
      // A real Documents row, so its id works wherever an id is expected. The
      // one-file download used to receive the literal 'gchexs' and answer the
      // agency with "Cast Error".
      confirmed.push({
        ...gchexs,
        title: gchexs.title || 'GCHEXS Confirmation',
        isGchexs: true,
      });
    }
  }

  return confirmed;
};

/**
 * Get all downloadable documents for a caregiver (from agency perspective)
 */
const getDownloadableDocuments = async (
  caregiverId: string,
  agencyId: string
): Promise<any[]> => {
  const confirmed = await getConfirmedCredentials(caregiverId);
  // SCRUM-99: gate sensitive credentials for un-confirmed agencies.
  const visible = await filterVisibleDocuments(confirmed, agencyId, caregiverId);

  /*
   * SCRUM-194: the packet stays live for the whole 30-day window.
   *
   * An earlier build froze the file list at the moment of payment. The 9/30
   * dev sync replaced that: inside the window the agency sees whatever the
   * caregiver has now, replacements included, at no extra charge. The window
   * itself is what limits access, and findEntitlement enforces it — once
   * accessEndsAt has passed there is no entitlement, so nothing is served.
   */
  return visible;
};

/**
 * SCRUM-141: the documents this caregiver signed for this agency. They ship in
 * the same package as the credentials, as one bundle, once the agency has paid.
 */
const getSignedDocuments = async (
  caregiverId: string,
  agencyId: string
): Promise<Array<{ _id: string; title: string; signedAt: Date | null; url: string }>> => {
  const packets = await SignaturePacket.find({
    agency: agencyId,
    caregiver: caregiverId,
  })
    .sort({ createdAt: 1 })
    .lean();
  return packets.flatMap((p: any) =>
    ((p.items as any[]) ?? [])
      .filter((i) => i.status === 'signed' && i.signedFileUrl)
      .map((i) => ({
        _id: String(i._id),
        title: i.title,
        signedAt: i.signedAt ?? null,
        url: i.signedFileUrl as string,
      }))
  );
};

/**
 * Log a download event to the audit trail
 */
const logDownload = async (params: {
  agencyId: string;
  caregiverId: string;
  documentId?: string;
  documentTitle?: string;
  downloadType: 'individual' | 'bulk';
  documentsIncluded?: Array<{ documentId: string; title: string }>;
}): Promise<void> => {
  // Lookup agency name and email for display in audit trail
  const agencyUser = await (await import('../user/user.model')).User.findById(params.agencyId).select('email');
  const agencyInfo = await PersonalInfo.findOne({ user: params.agencyId });
  // Prefer the company name (matches the "[Agency name] ..." notification copy
  // and the agency-onboarded notification); fall back to contact name, then email.
  const agencyName =
    (agencyInfo as any)?.companyName ||
    (agencyInfo
      ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim()
      : '') ||
    agencyUser?.email ||
    'Unknown Agency';
  const agencyEmail = agencyUser?.email || '';

  // SCRUM-87: detect the first download for this (caregiver, agency) pair BEFORE
  // writing the new audit record, so the notification fires exactly once.
  const priorDownloads = await DownloadAudit.countDocuments({
    agency: params.agencyId,
    caregiver: params.caregiverId,
  });

  await DownloadAudit.create({
    agency: params.agencyId,
    caregiver: params.caregiverId,
    documentId: params.documentId,
    documentTitle: params.documentTitle,
    downloadType: params.downloadType,
    documentsIncluded: params.documentsIncluded,
    agencyName,
    agencyEmail,
  });

  // SCRUM-87: on the first download (individual or bulk), notify the caregiver.
  // Subsequent downloads from the same agency do not re-fire (Scenario 4).
  // Best-effort — a notification failure must not fail the download.
  if (priorDownloads === 0) {
    try {
      await CredentialingService.notifyCredentialsDownloaded(
        params.caregiverId,
        agencyName
      );
    } catch (err) {
      console.error('Failed to fire credentials-downloaded notification:', err);
    }
  }

  // SCRUM-141: downloading no longer opens an offer. The agency's Onboard
  // button does that now, and a download is only possible after the caregiver
  // has responded to it.
};

/**
 * Download a single document (returns the document URL + logs audit)
 */
const downloadDocument = async (
  documentId: string,
  agencyId: string
): Promise<any> => {
  // A malformed id is a missing document, not a database error. Mongoose
  // throws a CastError for it, which reached the agency as a toast reading
  // "Cast Error" — the packet's GCHEXS row sent the literal id 'gchexs'.
  if (!Types.ObjectId.isValid(documentId)) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  }
  const doc = await Documents.findById(documentId);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  }

  // Check access (SCRUM-99: sensitive credentials require a Confirmed agency)
  const hasAccess = await hasDownloadAccess(agencyId, doc.user.toString(), doc);
  if (!hasAccess) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to download this document');
  }

  // SCRUM-119: the packet is paid per caregiver, so an individual file is
  // covered by the same entitlement as the bulk download.
  await requirePacketEntitlement(agencyId, doc.user.toString());

  // SCRUM-131 / SCRUM-67: one file releases exactly what the packet does. This
  // used to hand over any Documents row by id once the packet was paid for — a
  // Pending or Rejected credential, or a supporting document the packet
  // deliberately leaves out — so the rule the ZIP follows could be stepped
  // around one file at a time.
  const packet = await getDownloadableDocuments(doc.user.toString(), agencyId);
  const inPacket = packet.find((d: any) => String(d._id) === String(doc._id));
  if (!inPacket) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'This document is not part of the credential package. Only credentials WeVoro has confirmed can be downloaded.'
    );
  }

  // Log the download
  await logDownload({
    agencyId,
    caregiverId: doc.user.toString(),
    documentId: doc._id.toString(),
    documentTitle: inPacket.title || doc.title,
    downloadType: 'individual',
  });

  return {
    url: doc.url,
    title: inPacket.title || doc.title,
    documentType: doc.documentType,
  };
};

/**
 * SCRUM-119 (A10) — one document the caregiver signed for this agency.
 *
 * The unlocked packet gives every row its own download arrow, signed documents
 * included. Same rules as the ZIP: the agency must have access to the caregiver
 * and must have paid for the packet. Only this agency's own signed items can be
 * found, so another agency's signatures are never reachable by id.
 */
const downloadSignedDocument = async (
  caregiverId: string,
  itemId: string,
  agencyId: string
): Promise<{ url: string; title: string }> => {
  assertCaregiverId(caregiverId);
  const hasAccess = await hasDownloadAccess(agencyId, caregiverId);
  if (!hasAccess) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to this caregiver\'s documents'
    );
  }
  await requirePacketEntitlement(agencyId, caregiverId);

  const signed = await getSignedDocuments(caregiverId, agencyId);
  const item = signed.find((d) => d._id === String(itemId));
  if (!item) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Signed document not found');
  }

  await logDownload({
    agencyId,
    caregiverId,
    documentId: item._id,
    documentTitle: `Signed: ${item.title}`,
    downloadType: 'individual',
  });

  return { url: item.url, title: item.title };
};

/**
 * Get download package info (list of all downloadable docs for bulk download)
 */
/**
 * SCRUM-67 Scenario 2 — the package as an actual package.
 *
 * The client used to loop over the documents and click one hidden <a download>
 * per file, pointed straight at the CDN. Two things went wrong with that: a
 * browser blocks repeated programmatic downloads, so only the first file ever
 * landed, and the `download` attribute is ignored cross-origin anyway, so the
 * rest opened instead of saving. An agency was told "Downloading 3 documents"
 * and got one.
 *
 * Zipping server-side fixes both, and keeps the CDN links off the client, which
 * is the same reason viewing goes through the server (SCRUM-130).
 */
const getDownloadPackageZip = async (
  caregiverId: string,
  agencyId: string
): Promise<{
  buffer: Buffer;
  fileName: string;
  count: number;
  credentialCount: number;
  signedCount: number;
}> => {
  assertCaregiverId(caregiverId);
  const hasAccess = await hasDownloadAccess(agencyId, caregiverId);
  if (!hasAccess) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You do not have access to this caregiver's documents"
    );
  }
  await requirePacketEntitlement(agencyId, caregiverId);

  const docs = await getDownloadableDocuments(caregiverId, agencyId);
  // SCRUM-141: one bundle, two folders — the same two groups the documents
  // modal shows before the agency pays.
  const signed = await getSignedDocuments(caregiverId, agencyId);

  // SCRUM-117 / SCRUM-67: the ZIP is built from whatever the agency is
  // entitled to. It used to refuse whenever no credential was confirmed yet,
  // before the signed documents were even looked at, so a paid agency whose
  // caregiver had signed everything (Marcus Bennett on QA: 9 signed, 0
  // confirmed) could never fetch the files the modal lists as "Included".
  // Only a package with truly nothing in it is refused.
  if (!docs.length && !signed.length) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'There is nothing to download yet. None of this caregiver’s credentials have been confirmed by WeVoro, and they have not signed any of your documents.'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require('jszip');
  const zip = new JSZip();

  const entries = [
    ...(docs as any[]).map((d) => ({
      folder: 'Credential documents',
      title: d.title || d.documentType || 'document',
      url: d.url,
    })),
    ...signed.map((d) => ({
      folder: 'Signed documents',
      title: d.title || 'signed document',
      url: d.url,
    })),
  ];

  const used = new Set<string>();
  let added = 0;
  let signedAdded = 0;
  for (const e of entries) {
    if (!e.url) continue;
    try {
      const res = await fetch(e.url);
      if (!res.ok) continue;
      // SCRUM-119: the same type the modal's badge shows, so a JPG credential
      // lands as .jpg and a name with no extension still gets a real one.
      const type =
        fileTypeFromUrl(e.url) ?? fileTypeFromMime(res.headers.get('content-type'));
      const rawExt = /\.([a-z0-9]{2,5})$/i
        .exec(String(e.url).split(/[?#]/)[0])?.[1]
        ?.toLowerCase();
      const ext = type?.fileType.toLowerCase() || rawExt || 'pdf';
      let name = `${e.folder}/${String(e.title).replace(/[^\w.-]+/g, '_')}.${ext}`;
      // Two documents can share a title; a zip silently overwrites a
      // duplicate entry, which would quietly shrink the package again.
      let n = 2;
      while (used.has(name)) {
        name = `${name.replace(/(_\d+)?\.[^.]+$/, '')}_${n++}.${ext}`;
      }
      used.add(name);
      zip.file(name, Buffer.from(await res.arrayBuffer()));
      added++;
      if (e.folder === 'Signed documents') signedAdded++;
    } catch {
      // One unreachable file must not fail the whole package.
    }
  }

  if (!added) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      'Could not fetch the credential files right now. Please try again.'
    );
  }

  // The GCHEXS entry is a real Documents row now, so every credential has an
  // id worth recording.
  await logDownload({
    agencyId,
    caregiverId,
    downloadType: 'bulk',
    documentsIncluded: [
      ...(docs as any[])
        .filter((d) => d._id)
        .map((d) => ({ documentId: d._id?.toString(), title: d.title })),
      ...signed.map((d) => ({ documentId: d._id, title: `Signed: ${d.title}` })),
    ],
  });

  const buffer: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
  // SCRUM-67: what is really inside the ZIP. The client's toast used to count
  // the credential list and forget the signed documents added beside it —
  // "Downloaded 5 documents" for a ZIP holding 7.
  return {
    buffer,
    fileName: 'credential-package.zip',
    count: added,
    credentialCount: added - signedAdded,
    signedCount: signedAdded,
  };
};

const getDownloadPackage = async (
  caregiverId: string,
  agencyId: string
): Promise<any> => {
  assertCaregiverId(caregiverId);
  const hasAccess = await hasDownloadAccess(agencyId, caregiverId);
  if (!hasAccess) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this caregiver\'s documents');
  }

  // SCRUM-119: this is the paywall. It sits after the access check and before
  // any URL is produced, so an unpaid agency never receives a file link.
  await requirePacketEntitlement(agencyId, caregiverId);

  const docs = await getDownloadableDocuments(caregiverId, agencyId);

  // Log bulk download
  await logDownload({
    agencyId,
    caregiverId,
    downloadType: 'bulk',
    documentsIncluded: docs
      .filter((d: any) => d._id)
      .map((d: any) => ({
        documentId: d._id?.toString(),
        title: d.title,
      })),
  });

  return docs.map((d: any) => ({
    _id: d._id,
    title: d.title,
    url: d.url,
    documentType: d.documentType,
    // SCRUM-165: tells the certificate and the RN/LPN sign-off apart.
    part: d.part,
    reviewStatus: d.reviewStatus,
  }));
};

/**
 * Request private document access from a caregiver
 */
const requestPrivateAccess = async (
  agencyId: string,
  caregiverId: string
): Promise<any> => {
  // Check if request already exists
  const existing = await PrivateAccess.findOne({
    agency: agencyId,
    caregiver: caregiverId,
  });

  if (existing) {
    if (existing.status === 'granted') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Access already granted');
    }
    if (existing.status === 'pending') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Access request already pending');
    }
    // If revoked, allow re-request
    existing.status = 'pending';
    existing.revokedAt = undefined;
    await existing.save();

    // Notify caregiver
    const agencyInfo = await PersonalInfo.findOne({ user: agencyId });
    const agencyName = agencyInfo ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim() : 'An agency';

    await Notification.create({
      user: caregiverId,
      message: `<strong>${agencyName}</strong> has requested access to your private documents. Review and respond on your profile.`,
      type: 'private_access_request',
      ctaLink: '/caregiver/profile#documents',
      isRead: false,
    });

    return existing;
  }

  const access = await PrivateAccess.create({
    agency: agencyId,
    caregiver: caregiverId,
    status: 'pending',
  });

  // Notify caregiver
  const agencyInfo = await PersonalInfo.findOne({ user: agencyId });
  const agencyName = agencyInfo ? `${agencyInfo.firstName || ''} ${agencyInfo.lastName || ''}`.trim() : 'An agency';

  await Notification.create({
    user: caregiverId,
    message: `<strong>${agencyName}</strong> has requested access to your private documents. Review and respond on your profile.`,
    type: 'private_access_request',
    ctaLink: '/caregiver/profile#documents',
    isRead: false,
  });

  return access;
};

/**
 * Grant or revoke private document access (caregiver action)
 */
const updatePrivateAccess = async (
  accessId: string,
  caregiverId: string,
  action: 'grant' | 'revoke'
): Promise<any> => {
  const access = await PrivateAccess.findById(accessId);
  if (!access) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Access request not found');
  }
  if (access.caregiver.toString() !== caregiverId) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Not authorized');
  }

  if (action === 'grant') {
    access.status = 'granted';
    access.grantedAt = new Date();
  } else {
    access.status = 'revoked';
    access.revokedAt = new Date();
  }

  await access.save();

  // Notify agency
  const notificationType = action === 'grant' ? 'private_access_granted' : 'private_access_revoked';
  const caregiverInfo = await PersonalInfo.findOne({ user: caregiverId });
  const caregiverName = caregiverInfo ? `${caregiverInfo.firstName || ''} ${caregiverInfo.lastName || ''}`.trim() : 'A caregiver';

  await Notification.create({
    user: access.agency,
    message: action === 'grant'
      ? `<strong>${caregiverName}</strong> has granted you access to their private documents.`
      : `<strong>${caregiverName}</strong> has revoked your access to their private documents.`,
    type: notificationType,
    ctaLink: `/agency/caregivers/${caregiverId}`,
    isRead: false,
  });

  return access;
};

/**
 * Get pending access requests for a caregiver
 */
const getAccessRequests = async (caregiverId: string): Promise<any[]> => {
  const requests = await PrivateAccess.find({ caregiver: caregiverId })
    .populate('agency', 'email')
    .sort({ createdAt: -1 });
  return requests;
};

/**
 * Get download audit log for a caregiver (admin view)
 */
const getDownloadAuditLog = async (caregiverId: string): Promise<any[]> => {
  const logs = await DownloadAudit.find({ caregiver: caregiverId })
    .sort({ createdAt: -1 })
    .limit(100);
  return logs;
};

/**
 * SCRUM-119: what the agency sees in the documents modal BEFORE paying.
 *
 * Lists every file the caregiver submitted — title, type and size — but returns
 * a url only once the packet is paid for. That is what makes the locked state
 * honest: the agency can see exactly what they are buying, and cannot reach the
 * bytes until they have.
 *
 * Viewing is free, so this deliberately does not write a download audit row and
 * does not fire the connection side effect.
 */
const getPacketManifest = async (
  caregiverId: string,
  agencyId: string
): Promise<any> => {
  assertCaregiverId(caregiverId);
  const hasAccess = await hasDownloadAccess(agencyId, caregiverId);
  if (!hasAccess) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have access to this caregiver\'s documents'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getPacketStatus } = require('../payment/payment.service');
  const status = await getPacketStatus({ agencyId, caregiverId });

  // Same set getDownloadableDocuments returns, kept in two steps so the
  // credentials the tier gate holds back can be named below.
  const confirmedAll = await getConfirmedCredentials(caregiverId);
  const docs = await filterVisibleDocuments(confirmedAll, agencyId, caregiverId);

  // SCRUM-131 follow-on: "nothing to download" and "nothing submitted" are not
  // the same thing. The packet ships confirmed credentials only, so a caregiver
  // who has uploaded everything and is waiting on review was being reported to
  // the agency as having submitted nothing at all — the same mistake SCRUM-129
  // fixed on the credential card, surfacing again in the documents modal.
  const pendingCount = await Documents.countDocuments({
    user: caregiverId,
    url: { $exists: true, $nin: [null, ''] },
    documentType: { $in: REQUIRED_CREDENTIAL_KEYS as unknown as string[] },
    reviewStatus: { $ne: 'approved' },
  });

  // SCRUM-135: confirmed credentials the packet is withholding from THIS agency.
  // Today that is the SCRUM-99 tier gate — TB Test (and GCHEXS) are sensitive
  // and stay hidden until WeVoro confirms the agency — but the list is derived
  // by difference rather than by re-applying that rule, so any gate that drops a
  // confirmed credential is reported the same way. Without it the modal showed
  // four files and nothing else, and a confirmed TB Test looked like it had
  // simply vanished from a paid packet.
  const shown = new Set(docs.map((d: any) => String(d._id)));
  const hiddenCredentials = confirmedAll
    .filter((d: any) => !shown.has(String(d._id)))
    .map((d: any) => d.title || d.documentType);

  // SCRUM-141: what the caregiver signed for this agency — listed before
  // payment so the agency knows the bundle holds both groups, links withheld.
  const signed = await getSignedDocuments(caregiverId, agencyId);
  // Faisal's A9/A10 rows read "PDF · 1.4 MB", and a photo credential reads
  // "JPEG · 2.1 MB" on a green badge. The type comes from the file name; the
  // CDN is asked (HEAD, short timeout) only for what is not stored — the
  // stamped signed file's size, or a credential uploaded before fileSize was
  // recorded. The urls stay on the server either way.
  const [docFiles, signedFiles] = await Promise.all([
    Promise.all(docs.map((d: any) => describeFile(d.url, d.fileSize))),
    Promise.all(signed.map((d) => describeFile(d.url))),
  ]);

  return {
    ...status,
    // Checkout sells a packet only when it holds at least one confirmed
    // credential (status.fileCount). The list below can still show a GCHEXS
    // confirmation on its own, and the modal used to offer "Unlock" for that
    // list, which checkout then refused. Say which it is.
    purchasable: status.fileCount > 0,
    fileCount: docs.length,
    pendingCount,
    hiddenCredentials,
    signedDocuments: signed.map((d, i) => ({
      _id: d._id,
      title: d.title,
      signedAt: d.signedAt,
      fileSize: signedFiles[i].fileSize,
      fileType: signedFiles[i].fileType,
      mimeType: signedFiles[i].mimeType,
      locked: !status.paid,
    })),
    documents: docs.map((d: any, i: number) => ({
      _id: d._id,
      title: d.title,
      documentType: d.documentType,
      // SCRUM-165: both halves of the PCA certificate are 'certifications'
      // rows; `part` is what lets the package window label the sign-off.
      part: d.part,
      reviewStatus: d.reviewStatus,
      fileSize: docFiles[i].fileSize,
      // SCRUM-119 (A9): 'PDF', 'JPG', 'PNG'… — what the badge prints.
      fileType: docFiles[i].fileType,
      mimeType: docFiles[i].mimeType,
      // The one field the paywall actually withholds.
      url: status.paid ? d.url : null,
      locked: !status.paid,
    })),
  };
};

export const DownloadService = {
  downloadDocument,
  getConfirmedCredentials,
  downloadSignedDocument,
  getDownloadPackage,
  getDownloadPackageZip,
  getPacketManifest,
  requestPrivateAccess,
  updatePrivateAccess,
  getAccessRequests,
  getDownloadAuditLog,
  hasDownloadAccess,
  getDownloadableDocuments,
  getSignedDocuments,
};
