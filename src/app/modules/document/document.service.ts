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
  }

  let result;

  if (!existingDocument) {
    // Create new document
    result = await Documents.create(documentData);
  } else {
    // Update existing document (only provided fields)
    result = await Documents.findByIdAndUpdate(documentId, documentData, {
      new: true,
    });
  }

  return result;
};

const getUserDocuments = async (userId: string): Promise<any> => {
  const result = await Documents.find({ user: userId });
  console.log('🚀 ~ getUserDocuments ~ result:', result);
  return result;
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
};

const reviewDocument = async (
  documentId: string,
  payload: ReviewPayload
): Promise<any> => {
  const { reviewStatus, credentialIdNumber, credentialIssueDate, credentialExpirationDate, issuingOrganization, rejectionReason } = payload;

  if (reviewStatus === 'approved') {
    if (!credentialIdNumber || !credentialIssueDate || !credentialExpirationDate || !issuingOrganization) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Credential ID, Issue Date, Expiration Date, and Issuing Organization are required for approval');
    }
    const issueDate = new Date(credentialIssueDate);
    const expirationDate = new Date(credentialExpirationDate);
    if (expirationDate <= issueDate) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Expiration Date must be later than Issue Date');
    }
  }

  const updateData: Record<string, any> = { reviewStatus };

  if (reviewStatus === 'approved') {
    updateData.reviewedAt = new Date();
    updateData.credentialIdNumber = credentialIdNumber;
    updateData.credentialIssueDate = new Date(credentialIssueDate!);
    updateData.credentialExpirationDate = new Date(credentialExpirationDate!);
    updateData.issuingOrganization = issuingOrganization;
    // Clear rejection reason if previously rejected
    updateData.rejectionReason = undefined;
  } else if (reviewStatus === 'rejected') {
    updateData.rejectionReason = rejectionReason || '';
    // Clear approval metadata
    updateData.reviewedAt = undefined;
    updateData.credentialIdNumber = undefined;
    updateData.credentialIssueDate = undefined;
    updateData.credentialExpirationDate = undefined;
    updateData.issuingOrganization = undefined;
  }

  const result = await Documents.findByIdAndUpdate(
    documentId,
    updateData,
    { new: true }
  );

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
