import express from 'express';
import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import * as PricingController from './pricing.controller';

const router = express.Router();

// --- SCRUM-113: founder-only pricing administration ---
// auth(ADMIN) already admits super_admin — the middleware lets SUPER_ADMIN
// through before the role check runs — so this is the founder/admin gate.
router.get('/admin/overview', auth(ENUM_USER_ROLE.ADMIN), PricingController.getOverview);
router.patch('/admin/price', auth(ENUM_USER_ROLE.ADMIN), PricingController.updatePrice);

// --- Read-only price, for the agency paywall ---
// An agency needs to see what a packet costs before opening the payment gate.
router.get(
  '/current',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  PricingController.getCurrentPrice
);

export const PricingRoutes = router;
