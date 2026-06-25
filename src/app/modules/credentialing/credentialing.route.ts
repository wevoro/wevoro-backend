import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import { CredentialingController } from './credentialing.controller';

const router = express.Router();

// SCRUM-87: caregiver's credentialing-mode Offers tab (Submitted/Received).
router.get(
  '/caregiver-engagements',
  auth(ENUM_USER_ROLE.PRO),
  CredentialingController.getCaregiverEngagements
);

// SCRUM-88: agency's credentialing-mode Offers tab (Submitted/Received).
router.get(
  '/agency-engagements',
  auth(ENUM_USER_ROLE.PARTNER),
  CredentialingController.getAgencyEngagements
);

export const CredentialingRoutes = router;
