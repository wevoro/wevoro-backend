import { Documents } from './documents.model';
import { uploadFile } from '../../../helpers/bunny-upload';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';
import { fireRejectionNotification } from '../notification/credential-notification.service';
import { REQUIRED_CREDENTIAL_KEYS } from '../../../constants/credentials';

type DocumentPayload = {
  category: string;
  documentType: string;
  title: string;
  isPublic: boolean;
  consent: boolean;
  user: string;
};

const uploadDocument = async (
  file: any,
  payload: DocumentPayload,
  documentId?: string,
  userId?: string
): Promise<any> => {
  // Check if this is an update or create operation
  const isUpdate = !!documentId;
  console.log('🚀 ~ uploadDocument ~ isUpdate:', isUpdate);
  const existingDocument = isUpdate
    ? await Documents.findById(documentId)
    : null;

  // File is only required for new documents, not for updates
  if (!isUpdate && !file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'File is required');
  }

  // Upload file to Bunny CDN only if a new file is provided
  let fileUrl: string | undefined;
  if (file) {
    fileUrl = await uploadFile(file);
  }

  // Build the document object
  const documentData: Record<string, any> = {
    category: payload.category,
    documentType: payload.documentType,
    title: payload.title,
    privacy: payload.isPublic ? 'public' : 'private',
    consent: payload.consent,
    user: userId,
  };

  // Only update URL if a new file was uploaded
  if (fileUrl) {
    documentData.url = fileUrl;
    documentData.fileSize = file?.size;
  }

  let result;

  if (!existingDocument) {
    // Create new document
    result = await Documents.create(documentData);
  } else {
    const updateQuery: Record<string, any> = {};

    // A replaced file has NOT been reviewed yet, so send the document back to
    // the pending queue and drop the previous verdict. Without this the row
    // kept whatever reviewStatus it already had: re-uploading after a rejection
    // showed "Document updated successfully!" while the credential stayed
    // `rejected`, so the Completing Profile modal kept demanding a re-upload
    // with no way out — and a replaced file on an approved credential silently
    // inherited the old approval. Metadata-only edits (title / privacy /
    // consent) deliberately do NOT reset the verdict; only a new file does.
    //
    // The extracted credential fields (ID number, dates, issuer,
    // wevoroCredentialId) are RETAINED, matching reviewDocument's rejection
    // path, so the admin still sees what was previously on file.
    if (fileUrl && existingDocument.reviewStatus !== 'pending') {
      documentData.reviewStatus = 'pending';
      documentData.replacementRequested = false;
      updateQuery.$unset = {
        reviewedAt: '',
        reviewedBy: '',
        rejectionReason: '',
        rejectionReasonCode: '',
        aiSuggestedReason: '',
        adminAgreedWithAi: '',
      };
    }

    // Update existing document (only provided fields)
    updateQuery.$set = documentData;
    result = await Documents.findByIdAndUpdate(documentId, updateQuery, {
      new: true,
    });
  }

  return result;
};

const getUserDocuments = async (
  userId: string,
  requesterId?: string
): Promise<any> => {
  const result = await Documents.find({ user: userId });
  // SCRUM-99: gate sensitive credentials for agencies (owner/admin see all).
  const { filterVisibleDocuments } = await import('./credential-visibility');
  return filterVisibleDocuments(result, requesterId, userId);
};

const deleteDocument = async (
  userId: string,
  documentId: string
): Promise<any> => {
  const result = await Documents.findByIdAndDelete(documentId);
  return result;
};

type ReviewPayload = {
  reviewStatus: 'approved' | 'rejected';
  credentialIdNumber?: string;
  credentialIssueDate?: string;
  credentialExpirationDate?: string;
  issuingOrganization?: string;
  rejectionReason?: string;
  // SCRUM-109
  rejectionReasonCode?: string;
  requestReplacement?: boolean;
  aiSuggestedReason?: string | null;
  adminAgreedWithAi?: boolean | null;
  reviewedBy?: string;
  /** SCRUM-109: confirm a credential that has no fixed renewal date. */
  hasNoExpiration?: boolean;
};

/**
 * SCRUM-109/110: WeVoro's own credential ID, generated at confirmation.
 * Sits alongside the provider's own ID (credentialIdNumber) so an agency can
 * see both — proof WeVoro checked it, and the number on the document itself.
 * Shape: WV-<CRED>-<YEAR>-<6 hex>, e.g. WV-CPR-2026-A3F91C
 */
const buildWevoroCredentialId = (documentType?: string): string => {
  const codes: Record<string, string> = {
    certifications: 'CRT',
    driver_license: 'DL',
    auto_insurance: 'INS',
    cpr_test: 'CPR',
    tb_tests: 'TB',
    gchexs: 'BGC',
  };
  const code = codes[documentType || ''] || 'DOC';
  const rand = Math.random().toString(16).slice(2, 8).toUpperCase();
  return `WV-${code}-${new Date().getFullYear()}-${rand}`;
};

const reviewDocument = async (
  documentId: string,
  payload: ReviewPayload
): Promise<any> => {
  const {
    reviewStatus,
    credentialIdNumber,
    credentialIssueDate,
    credentialExpirationDate,
    issuingOrganization,
    rejectionReason,
    rejectionReasonCode,
    requestReplacement,
    aiSuggestedReason,
    adminAgreedWithAi,
    reviewedBy,
    hasNoExpiration,
  } = payload;

  if (reviewStatus === 'approved') {
    // SCRUM-109: Credential ID may legitimately be absent (TB test, some CPR
    // Tier 2 providers), and expiration is optional when hasNoExpiration is set
    // ("Reviewed, no fixed renewal"). Issue date + issuer remain required.
    if (!credentialIssueDate || !issuingOrganization) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Issue Date and Issuing Organization are required to confirm a credential'
      );
    }
    if (!hasNoExpiration && !credentialExpirationDate) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Provide an Expiration Date, or mark the credential as having no expiration'
      );
    }
    if (!hasNoExpiration && credentialExpirationDate) {
      const issueDate = new Date(credentialIssueDate);
      const expirationDate = new Date(credentialExpirationDate);
      if (expirationDate <= issueDate) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Expiration Date must be later than Issue Date');
      }
    }
  }

  // SCRUM-109: a rejection must record WHY, so require the caregiver-facing
  // message. The admin UI always sends one (see mark-not-confirmed-modal).
  if (reviewStatus === 'rejected' && !rejectionReason?.trim()) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'A reason message for the caregiver is required when marking a document as not confirmed'
    );
  }

  const set: Record<string, any> = { reviewStatus };
  const unset: Record<string, any> = {};
  if (reviewedBy) set.reviewedBy = reviewedBy;

  if (reviewStatus === 'approved') {
    const existing = await Documents.findById(documentId).select(
      'documentType wevoroCredentialId'
    );

    set.reviewedAt = new Date();
    set.credentialIdNumber = credentialIdNumber;
    set.credentialIssueDate = new Date(credentialIssueDate!);
    set.issuingOrganization = issuingOrganization;
    set.replacementRequested = false;
    set.hasNoExpiration = hasNoExpiration === true;

    if (hasNoExpiration) {
      unset.credentialExpirationDate = '';
    } else {
      set.credentialExpirationDate = new Date(credentialExpirationDate!);
    }

    // Issue WeVoro's own credential ID once, on first confirmation, and keep it
    // stable across re-confirmations so the agency-facing trail doesn't change.
    if (!existing?.wevoroCredentialId) {
      set.wevoroCredentialId = buildWevoroCredentialId(existing?.documentType);
    }

    // Clear any prior rejection.
    unset.rejectionReason = '';
    unset.rejectionReasonCode = '';
  } else if (reviewStatus === 'rejected') {
    set.rejectionReason = rejectionReason!.trim();
    if (rejectionReasonCode) set.rejectionReasonCode = rejectionReasonCode;
    set.replacementRequested = requestReplacement === true;
    if (aiSuggestedReason) set.aiSuggestedReason = aiSuggestedReason;
    if (typeof adminAgreedWithAi === 'boolean') set.adminAgreedWithAi = adminAgreedWithAi;
    // Not confirmed is not a reviewed-and-valid state, so drop the confirmation
    // timestamp. The extracted credential fields are deliberately RETAINED —
    // the admin view still shows Certificate ID / dates / issuer on a
    // not-confirmed card so the caregiver and admin can see what was rejected.
    unset.reviewedAt = '';
  }

  // NOTE: this previously passed `undefined` values to findByIdAndUpdate to
  // "clear" fields. Mongoose drops undefined keys, so those clears were silently
  // no-ops and stale metadata survived. Use an explicit $unset.
  const updateQuery: Record<string, any> = { $set: set };
  if (Object.keys(unset).length > 0) updateQuery.$unset = unset;

  const result = await Documents.findByIdAndUpdate(
    documentId,
    updateQuery,
    { new: true }
  );

  // SCRUM-102 renewal reset: when a credential is (re-)approved with a new
  // expiration date, clear its prior expiration notifications so the next
  // lifecycle fires fresh. Without this, the dedup keyed on
  // (user, credentialDocumentId, type) permanently suppresses re-notification
  // after a renewal, since the same document _id is reused.
  if (reviewStatus === 'approved' && result) {
    const { Notification } = await import('../user/notification.model');
    await Notification.deleteMany({
      credentialDocumentId: documentId,
      type: { $in: ['credential_yellow', 'credential_red', 'credential_expired'] },
    });
  }

  // SCRUM-65: Fire rejection notification in real-time
  if (reviewStatus === 'rejected' && result) {
    // Resolve role-driven label for the certificate row
    let roleLabel = 'CNA Certificate';
    try {
      const { ProfessionalInfo } = await import('../user/professional-info.model');
      const profInfo: any = await ProfessionalInfo.findOne({ user: result.user }).lean();
      if (profInfo?.role === 'PCA') roleLabel = 'PCA Certificate';
    } catch {}
    const CREDENTIAL_LABELS: Record<string, string> = {
      certifications: roleLabel,
      driver_license: "Driver's License",
      auto_insurance: 'Auto Insurance',
      cpr_test: 'CPR Test',
      tb_tests: 'TB Test',
    };
    const credentialName = CREDENTIAL_LABELS[result.documentType] || result.title || 'Credential';
    try {
      await fireRejectionNotification({
        caregiverId: result.user.toString(),
        credentialDocumentId: result._id.toString(),
        credentialName,
        rejectionReason: rejectionReason || '',
      });
    } catch (err) {
      console.error('Failed to send rejection notification:', err);
    }
  }

  return result;
};

const getCredentialStatus = async (userId: string): Promise<any> => {
  // SCRUM-60: [Role] Certificate label is derived from professionalInfo.role at view time.
  const { ProfessionalInfo } = await import('../user/professional-info.model');
  const profInfo: any = await ProfessionalInfo.findOne({ user: userId }).lean();
  const role: 'CNA' | 'PCA' = profInfo?.role === 'PCA' ? 'PCA' : 'CNA';

  // SCRUM-93: keys come from the shared required list so this view and
  // calculateProCompletion can never disagree about what "required" means.
  const CREDENTIAL_META: Record<string, { label: string; category: string }> = {
    certifications: { label: `${role} Certificate`, category: 'non_medical' },
    driver_license: { label: "Driver's License", category: 'non_medical' },
    auto_insurance: { label: 'Auto Insurance', category: 'non_medical' },
    cpr_test: { label: 'CPR Test', category: 'medical' },
    tb_tests: { label: 'TB Test', category: 'medical' },
  };
  const REQUIRED_CREDENTIALS = REQUIRED_CREDENTIAL_KEYS.map(key => ({
    key,
    ...CREDENTIAL_META[key],
  }));

  const documents = await Documents.find({ user: userId });
  const docsByType: Record<string, any> = {};
  documents.forEach((doc: any) => {
    docsByType[doc.documentType] = doc;
  });

  return REQUIRED_CREDENTIALS.map(cred => {
    const doc = docsByType[cred.key];
    if (!doc) {
      return { ...cred, state: 'not_uploaded', document: null };
    }
    return {
      ...cred,
      state: doc.reviewStatus === 'approved' ? 'verified' : doc.reviewStatus,
      document: {
        _id: doc._id,
        title: doc.title,
        url: doc.url,
        reviewStatus: doc.reviewStatus,
        reviewedAt: doc.reviewedAt,
        credentialIdNumber: doc.credentialIdNumber,
        credentialIssueDate: doc.credentialIssueDate,
        credentialExpirationDate: doc.credentialExpirationDate,
        issuingOrganization: doc.issuingOrganization,
        rejectionReason: doc.rejectionReason,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        category: doc.category,
        documentType: doc.documentType,
      },
    };
  });
};

const removeCredential = async (documentId: string): Promise<any> => {
  const result = await Documents.findByIdAndDelete(documentId);
  return result;
};

export const DocumentService = {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
  reviewDocument,
  getCredentialStatus,
  removeCredential,
};
