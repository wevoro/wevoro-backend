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
exports.DocumentService = void 0;
const documents_model_1 = require("./documents.model");
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const uploadDocument = (file, payload, documentId, userId) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if this is an update or create operation
    const isUpdate = !!documentId;
    console.log('🚀 ~ uploadDocument ~ isUpdate:', isUpdate);
    const existingDocument = isUpdate
        ? yield documents_model_1.Documents.findById(documentId)
        : null;
    // File is only required for new documents, not for updates
    if (!isUpdate && !file) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'File is required');
    }
    // Upload file to Bunny CDN only if a new file is provided
    let fileUrl;
    if (file) {
        fileUrl = yield (0, bunny_upload_1.uploadFile)(file);
    }
    // Build the document object
    const documentData = {
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
        result = yield documents_model_1.Documents.create(documentData);
    }
    else {
        // Update existing document (only provided fields)
        result = yield documents_model_1.Documents.findByIdAndUpdate(documentId, documentData, {
            new: true,
        });
    }
    return result;
});
const getUserDocuments = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.find({ user: userId });
    console.log('🚀 ~ getUserDocuments ~ result:', result);
    return result;
});
const deleteDocument = (userId, documentId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield documents_model_1.Documents.findByIdAndDelete(documentId);
    return result;
});
exports.DocumentService = {
    uploadDocument,
    getUserDocuments,
    deleteDocument,
};
