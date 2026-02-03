"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfferRoutes = void 0;
const multer_1 = __importDefault(require("multer"));
const user_1 = require("../../../enums/user");
const auth_1 = __importDefault(require("../../middlewares/auth"));
const express_1 = __importDefault(require("express"));
const offer_controller_1 = require("./offer.controller");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({});
const upload = (0, multer_1.default)({ storage });
router.post('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.createOrUpdateOffer);
router.post('/upload/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.array(`documents`), offer_controller_1.OfferController.uploadOfferDocuments);
router.get('/', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.getOffers);
router.delete('/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.deleteOffer);
router.patch('/update/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.updateOffer);
router.patch('/notes/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.PARTNER, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.updateOfferNotes);
router.patch('/document-status', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), offer_controller_1.OfferController.updateDocumentStatus);
// Pro responds to offer - unified endpoint for file uploads + status updates
router.post('/pro-respond/:id', (0, auth_1.default)(user_1.ENUM_USER_ROLE.PRO, user_1.ENUM_USER_ROLE.ADMIN), upload.array('documents'), offer_controller_1.OfferController.proRespondToOffer);
exports.OfferRoutes = router;
