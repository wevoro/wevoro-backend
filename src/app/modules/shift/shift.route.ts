import { ENUM_USER_ROLE } from '../../../enums/user';
import auth from '../../middlewares/auth';
import express from 'express';
import { ShiftController } from './shift.controller';

const router = express.Router();

router.post(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.createShift
);

router.get(
  '/',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.getShifts
);

router.get(
  '/:id',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.PRO),
  ShiftController.getShiftById
);

router.patch(
  '/:id',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.updateShift
);

router.patch(
  '/:id/status',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.updateShiftStatus
);

router.delete(
  '/:id',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.deleteShift
);

router.post(
  '/:id/assign',
  auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.ADMIN),
  ShiftController.assignCaregiver
);

export const ShiftRoutes = router;
