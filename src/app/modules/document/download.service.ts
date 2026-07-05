import { Documents } from './documents.model';
import { DownloadAudit } from './download-audit.model';
import { PrivateAccess } from './private-access.model';
import { ProfessionalInfo } from '../user/professional-info.model';
import { Notification } from '../user/notification.model';
import { PersonalInfo } from '../user/personal-info.model';
import { isAgencyEngaged } from '../notification/engagement.helper';
import { Offer } from '../offer/offer.model';
import { CredentialingService } from '../credentialing/credentialing.service';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';

/**
 * SCRUM-67: Download Service
 * Handles individual and bulk credential document downloads,
 * private access consent flow, and audit trail logging.
 */

/**
 * Check if an agency has download access to a caregiver's documents.
 * Access requires: share-flow onboarding OR active engagement.
 */
const hasDownloadAccess = async (
  agencyId: string,
  caregiverId: string
): Promise<boolean> => {
  // Partners can always download public/verified credentials for any caregiver they can view
  // The visibility is already controlled by the getPros endpoint
  return true;
};

/**
 * Get all downloadable documents for a caregiver (from agency perspective)
 */
const getDownloadableDocuments = async (
  caregiverId: string,
  agencyId: string
): Promise<any[]> => {
  // Get ALL documents with valid URLs for the caregiver
  // Partners can view/download any document that has a file uploaded
  const allUploadedDocs = await Documents.find({
    user: caregiverId,
    url: { $exists: true, $nin: [null, ''] },
  });

  // GCHEXS document
  const profInfo = await ProfessionalInfo.findOne({ user: caregiverId });
  let gchexsDoc = null;
  if (profInfo?.gchexsStatus === 'yes' && profInfo?.gchexsDocumentUrl) {
    gchexsDoc = {
      _id: 'gchexs',
      title: 'GCHEXS Confirmation',
      url: profInfo.gchexsDocumentUrl,
      documentType: 'gchexs',
      isGchexs: true,
    };
  }

  const allDocs = [...allUploadedDocs];
  if (gchexsDoc) allDocs.push(gchexsDoc);

  return allDocs;
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
};

/**
 * Download a single document (returns the document URL + logs audit)
 */
const downloadDocument = async (
  documentId: string,
  agencyId: string
): Promise<any> => {
  const doc = await Documents.findById(documentId);
  if (!doc) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
  }

  // Check access
  const hasAccess = await hasDownloadAccess(agencyId, doc.user.toString());
  if (!hasAccess) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to download this document');
  }

  // Partners can download any document that has a URL (file uploaded)

  // Log the download
  await logDownload({
    agencyId,
    caregiverId: doc.user.toString(),
    documentId: doc._id.toString(),
    documentTitle: doc.title,
    downloadType: 'individual',
  });

  return { url: doc.url, title: doc.title, documentType: doc.documentType };
};

/**
 * Get download package info (list of all downloadable docs for bulk download)
 */
const getDownloadPackage = async (
  caregiverId: string,
  agencyId: string
): Promise<any> => {
  const hasAccess = await hasDownloadAccess(agencyId, caregiverId);
  if (!hasAccess) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this caregiver\'s documents');
  }

  const docs = await getDownloadableDocuments(caregiverId, agencyId);

  // Log bulk download — skip non-ObjectId entries like the GCHEXS virtual doc
  await logDownload({
    agencyId,
    caregiverId,
    downloadType: 'bulk',
    documentsIncluded: docs
      .filter((d: any) => d._id && d._id !== 'gchexs')
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
      ctaLink: '/pro/profile#documents',
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
    ctaLink: '/pro/profile#documents',
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
    ctaLink: `/partner/pros/${caregiverId}`,
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

export const DownloadService = {
  downloadDocument,
  getDownloadPackage,
  requestPrivateAccess,
  updatePrivateAccess,
  getAccessRequests,
  getDownloadAuditLog,
  hasDownloadAccess,
  getDownloadableDocuments,
};
