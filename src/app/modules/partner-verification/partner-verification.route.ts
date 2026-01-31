import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { PartnerVerificationController } from './partner-verification.controller';
import multer from 'multer';

const router = express.Router();
const storage = multer.diskStorage({});

const upload = multer({ storage });

// Create or Update verification
router.post(
  '/verify',
  auth(ENUM_USER_ROLE.PARTNER),
  upload.single('file'),
  PartnerVerificationController.verifyPartner
);

// Get verification status
router.get(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  PartnerVerificationController.getPartnerVerification
);

export const PartnerVerificationRoutes = router;
