import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { DocumentController } from './document.controller';
import multer from 'multer';

const router = express.Router();
const storage = multer.diskStorage({});

const upload = multer({ storage });

// Upload a new document
router.post(
  '/upload',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  upload.single('file'),
  DocumentController.uploadDocument
);

// Get all documents for the authenticated user
router.get(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  DocumentController.getUserDocuments
);

// Delete a specific document
router.delete(
  '/:documentId',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO, ENUM_USER_ROLE.ADMIN),
  DocumentController.deleteDocument
);

// Admin: review (approve/reject) a document
router.patch(
  '/:documentId/review',
  auth(ENUM_USER_ROLE.ADMIN),
  DocumentController.reviewDocument
);

export const DocumentRoutes = router;
