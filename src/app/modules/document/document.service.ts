import { Documents } from './documents.model';
import { uploadFile } from '../../../helpers/bunny-upload';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';

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

export const DocumentService = {
  uploadDocument,
  getUserDocuments,
  deleteDocument,
};
