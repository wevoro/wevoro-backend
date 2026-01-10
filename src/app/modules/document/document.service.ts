import { Documents } from './documents.model';
import { uploadFile } from '../../../helpers/bunny-upload';
// import { Express } from 'express';
import ApiError from '../../../errors/ApiError';
import httpStatus from 'http-status';

type DocumentPayload = {
  category: string;
  documentType: string;
  title: string;
  isProtected: boolean;
  consent: boolean;
  user: string;
};

const uploadDocument = async (
  file: Express.Multer.File,
  payload: DocumentPayload,
  documentId?: string,
  userId?: string
): Promise<any> => {
  // Upload file to Bunny CDN

  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'File is required');
  }

  const fileUrl = await uploadFile(file);

  // Create the document object
  const newDocument = {
    category: payload.category,
    documentType: payload.documentType,
    title: payload.title,
    privacy: payload.isProtected ? 'protected' : 'private',
    url: fileUrl,
    consent: payload.consent,
    user: userId,
  };

  // Find existing document collection or create new one
  let result = await Documents.findById(documentId);

  if (!result) {
    // Create new document collection with the first document
    result = await Documents.create(newDocument);
  } else {
    // Push new document to existing collection
    result = await Documents.findByIdAndUpdate(documentId, newDocument);
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
