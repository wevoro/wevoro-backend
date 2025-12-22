"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoutes = void 0;
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const user_controller_1 = require("./user.controller");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({});
const upload = (0, multer_1.default)({ storage });
router.post('/signup', user_controller_1.UserController.createUser);
router.post('/waitlist', user_controller_1.UserController.joinWaitlist);
router.patch('/personal-information', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.single('image'), user_controller_1.UserController.updateOrCreateUserPersonalInformation);
router.patch('/professional-information', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.array(`certifications`), user_controller_1.UserController.updateOrCreateUserProfessionalInformation);
router.patch('/documents', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.fields([
    { name: 'certificate', maxCount: 1 },
    { name: 'resume', maxCount: 1 },
    { name: 'governmentId', maxCount: 1 },
]), user_controller_1.UserController.updateOrCreateUserDocuments);
router.patch('/update/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.updateUser);
router.patch('/update-all', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.updateAllUsers);
router.get('/profile', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.getUserProfile);
router.get('/profile/:id', 
// auth(ENUM_USER_ROLE.PARTNER, ENUM_USER_ROLE.PRO),
user_controller_1.UserController.getUserById);
router.get('/pros', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.getPros);
router.get('/all', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.getUsers);
router.patch('/cover-image', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.single('coverImage'), user_controller_1.UserController.updateCoverImage);
router.post('/offer', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.createOrUpdateOffer);
router.post('/offer/upload/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.array(`documents`), user_controller_1.UserController.uploadOfferDocuments);
router.get('/offer', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.getOffers);
router.delete('/offer/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.deleteOffer);
router.patch('/offer/update/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.updateOffer);
router.patch('/offer/notes/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.updateOfferNotes);
router.post('/store-pro', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.storePro);
router.post('/notification', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.createNotification);
router.get('/notification', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.getNotifications);
router.delete('/notification/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.deleteNotification);
router.patch('/notification/mark-as-read', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.markAllNotificationsAsRead);
router.delete('/delete-account', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), user_controller_1.UserController.deleteAccount);
router.post('/auto-fill', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.single('file'), user_controller_1.UserController.autoFillAI);
exports.UserRoutes = router;
