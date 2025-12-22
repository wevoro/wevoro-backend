import axios from "axios";
import fs from "fs";
import config from "../config";


const storageZone = config.bunny.storage_zone;
const apiKey = config.bunny.api_key;
const cdnUrl = config.bunny.cdn_url;

// Map common mimetypes to file extensions
const mimeToExtension: Record<string, string> = {
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

const getExtensionFromMimetype = (mimetype: string): string => {
  return mimeToExtension[mimetype] || mimetype.split('/').pop() || 'bin';
};

const generateUniqueFileName = (baseName: string, extension: string) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const sanitizedName = baseName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${sanitizedName}_${timestamp}_${randomString}.${extension}`;
};

export const uploadFile = async (file: any) => {
  // Read file from disk (Multer disk storage)
  const buffer = fs.readFileSync(file.path);
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

  await axios.put(uploadUrl, buffer, {
    headers: {
      AccessKey: apiKey,
      'Content-Type': contentType,
    },
  });

  // Delete the temp file after upload
  fs.unlinkSync(file.path);

  return `https://${cdnUrl}/${uniqueFileName}`;
};
