"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsignRoutes = void 0;
const express_1 = __importDefault(require("express"));
const http_status_1 = __importDefault(require("http-status"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = __importDefault(require("../../middlewares/auth"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const user_1 = require("../../../enums/user");
const EsignController = __importStar(require("./esign.controller"));
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.diskStorage({}) });
/**
 * SCRUM-204: say what is actually wrong when too many files arrive at once.
 *
 * `upload.array('files', 10)` makes multer abort on the ELEVENTH part with
 * LIMIT_UNEXPECTED_FILE, which reached the agency as a 500 "Unexpected field" —
 * a message about nothing they did, on a screen that was only trying to say
 * "that is more than ten". Worse, it fires before addDocuments runs, so the
 * service's own, friendly cap message could never be the one shown.
 *
 * The cap is now owned in one place: multer takes the batch (with a generous
 * hard stop so a runaway request is still refused), and addDocuments decides,
 * counting what the agency already has. Anything multer does refuse is turned
 * into a plain 400.
 */
const uploadDocuments = (req, res, next) => {
    upload.array('files', 50)(req, res, (err) => {
        if (!err)
            return next();
        const tooMany = (err === null || err === void 0 ? void 0 : err.code) === 'LIMIT_UNEXPECTED_FILE' || (err === null || err === void 0 ? void 0 : err.code) === 'LIMIT_FILE_COUNT';
        next(new ApiError_1.default(http_status_1.default.BAD_REQUEST, tooMany
            ? 'That is more documents than one upload can carry. Send them in smaller batches.'
            : 'That upload could not be read. Please try again.'));
    });
};
// --- SCRUM-117: agency signing library ---
router.get('/documents', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), EsignController.getLibrary);
router.post('/documents', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), uploadDocuments, EsignController.addDocuments);
router.get('/documents/:id/pending-copies', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), EsignController.pendingCopies);
router.patch('/documents/:id/replace', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), upload.single('file'), EsignController.replaceDocument);
router.delete('/documents/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), EsignController.removeDocument);
router.patch('/documents/:id/restore', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER), EsignController.restoreDocument);
// --- admin oversight of an agency's signing activity (read-only) ---
router.get('/admin/agency/:agencyId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.ADMIN, user_1.ENUM_USER_ROLE.SUPER_ADMIN), EsignController.adminAgencyOverview);
// --- SCRUM-118: caregiver signing flow ---
router.get('/my-packets', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), EsignController.myPackets);
router.get('/offer/:offerId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), EsignController.offerContext);
router.post('/offer/:offerId/start', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), EsignController.startPacket);
router.post('/packet/:packetId/sign/:itemId', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO), EsignController.signItem);
// --- reminder cron (Vercel Cron GET; CRON_SECRET-protected in the controller) ---
router.get('/run-signing-reminders', EsignController.runReminders);
exports.EsignRoutes = router;
