"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShiftRoutes = void 0;
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const express_1 = __importDefault(require("express"));
const shift_controller_1 = require("./shift.controller");
const router = express_1.default.Router();
router.post('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.createShift);
router.get('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.getShifts);
router.get('/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN, user_1.ENUM_USER_ROLE.PRO), shift_controller_1.ShiftController.getShiftById);
router.patch('/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.updateShift);
router.patch('/:id/status', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.updateShiftStatus);
router.delete('/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.deleteShift);
router.post('/:id/assign', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), shift_controller_1.ShiftController.assignCaregiver);
exports.ShiftRoutes = router;
