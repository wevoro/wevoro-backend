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
exports.uploadFile = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const config_1 = __importDefault(require("../config"));
const storageZone = config_1.default.bunny.storage_zone;
const apiKey = config_1.default.bunny.api_key;
const cdnUrl = config_1.default.bunny.cdn_url;
// Map common mimetypes to file extensions
const mimeToExtension = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const getExtensionFromMimetype = (mimetype) => {
    return mimeToExtension[mimetype] || mimetype.split('/').pop() || 'bin';
};
const generateUniqueFileName = (baseName, extension) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const sanitizedName = baseName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    return `${sanitizedName}_${timestamp}_${randomString}.${extension}`;
};
const uploadFile = (file) => __awaiter(void 0, void 0, void 0, function* () {
    // Read file from disk (Multer disk storage)
    const buffer = fs_1.default.readFileSync(file.path);
    const contentType = file.mimetype;
    // Get extension from originalname if it has one, otherwise derive from mimetype
    const originalExtension = file.originalname.includes('.')
        ? file.originalname.split('.').pop()
        : null;
    const extension = originalExtension || getExtensionFromMimetype(file.mimetype);
    // Get base name without extension
    const baseName = file.originalname.includes('.')
        ? file.originalname.split('.').slice(0, -1).join('.')
        : file.originalname;
    const uniqueFileName = generateUniqueFileName(baseName, extension);
    const uploadUrl = `https://storage.bunnycdn.com/${storageZone}/${uniqueFileName}`;
    yield axios_1.default.put(uploadUrl, buffer, {
        headers: {
            AccessKey: apiKey,
            'Content-Type': contentType,
        },
    });
    // Delete the temp file after upload
    fs_1.default.unlinkSync(file.path);
    return `https://${cdnUrl}/${uniqueFileName}`;
});
exports.uploadFile = uploadFile;
