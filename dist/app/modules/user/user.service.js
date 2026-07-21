"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const http_status_1 = __importDefault(require("http-status"));
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const fs_1 = __importDefault(require("fs"));
const user_model_1 = require("./user.model");
const cloudinary_1 = __importDefault(require("cloudinary"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../../../config"));
const user_1 = require("../../../enums/user");
const calculatePartnerPercentage_1 = require("../../../helpers/calculatePartnerPercentage");
const calculateProCompletion_1 = require("../../../helpers/calculateProCompletion");
const sendMail_1 = require("../auth/sendMail");
const documents_model_1 = require("../document/documents.model");
const notification_model_1 = require("./notification.model");
const personal_info_model_1 = require("./personal-info.model");
const pro_model_1 = require("./pro.model");
const professional_info_model_1 = require("./professional-info.model");
const waitlist_model_1 = require("./waitlist.model");
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const unpdf_1 = require("unpdf");
const sharp_1 = __importDefault(require("sharp"));
const offer_model_1 = require("../offer/offer.model");
const partner_verification_model_1 = require("../partner-verification/partner-verification.model");
const credentialing_service_1 = require("../credentialing/credentialing.service");
const user_constant_1 = require("./user.constant");
const crypto_1 = __importDefault(require("crypto"));
cloudinary_1.default.v2.config({
    cloud_name: config_1.default.cloudinary.cloud_name,
    api_key: config_1.default.cloudinary.api_key,
    api_secret: config_1.default.cloudinary.api_secret,
});
const joinWaitlist = (email) => __awaiter(void 0, void 0, void 0, function* () {
    const existingUser = yield waitlist_model_1.Waitlist.findOne({ email });
    if (existingUser) {
        throw new ApiError_1.default(500, 'You are already in the waitlist!');
    }
    const newUser = yield waitlist_model_1.Waitlist.create({ email });
    yield (0, sendMail_1.sendEmail)('alfonza@joinhorizzon.com', 'Waitlist Update', `
      <div>
        <p>New user has joined the waitlist: <strong>${email}</strong></p>
        <p>Thank you</p>
      </div>
    `);
    return newUser;
});
const createUser = (user) => __awaiter(void 0, void 0, void 0, function* () {
    // Prevent privilege escalation: public signup may only create pro/partner
    // accounts. Admin / super_admin are created only via the guarded super-admin
    // flows (never through this mass-assignment path).
    if (user.role !== user_1.ENUM_USER_ROLE.PRO &&
        user.role !== user_1.ENUM_USER_ROLE.PARTNER) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid role');
    }
    delete user.permissions;
    const existingUser = yield user_model_1.User.isUserExist(user.email);
    if (existingUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User already exists');
    }
    const existingGoogleUser = yield user_model_1.User.isGoogleUser(user.email);
    if (existingGoogleUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User already exists with google!');
    }
    if (user.role === user_1.ENUM_USER_ROLE.PARTNER) {
        delete user.professionalInformation;
        delete user.documents;
    }
    // Generate shareId for pro users
    if (user.role === user_1.ENUM_USER_ROLE.PRO) {
        user.shareId = crypto_1.default.randomUUID();
    }
    // SCRUM-87/88: capture share-link attribution durably at signup. The agency
    // arrived via a caregiver's share link (/p/[shareId]); resolve and persist the
    // source caregiver so the engagement can be recorded once onboarding completes.
    const sourceShareId = user.sourceShareId;
    delete user.sourceShareId;
    if (user.role === user_1.ENUM_USER_ROLE.PARTNER && sourceShareId) {
        let sourceCaregiver = yield user_model_1.User.findOne({
            shareId: sourceShareId,
        }).select('_id role');
        // Legacy caregivers (created before shareId existed) share links built from
        // their _id — mirror getUserByShareId's fallback so attribution still lands.
        if (!sourceCaregiver && mongoose_1.default.Types.ObjectId.isValid(sourceShareId)) {
            sourceCaregiver = (yield user_model_1.User.findById(sourceShareId).select('_id role'));
        }
        if (sourceCaregiver && sourceCaregiver.role === user_1.ENUM_USER_ROLE.PRO) {
            user.sourceCaregiverId = sourceCaregiver._id;
        }
    }
    const newUser = yield user_model_1.User.create(user);
    if (!newUser) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Failed to create user');
    }
    return newUser;
});
const updateAllUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.updateMany({ role: 'pro' }, { $set: { status: 'pending' } });
    return result;
});
const deleteAccount = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        const userId = user._id;
        const userRole = user.role;
        yield user_model_1.User.findByIdAndDelete(userId, { session });
        console.log('inside delete account');
        // Delete user from Documents, PersonalInformation, ProfessionalInformation collections
        if (userRole === user_1.ENUM_USER_ROLE.PRO) {
            yield Promise.all([
                documents_model_1.Documents.deleteMany({ user: userId }, { session }),
                personal_info_model_1.PersonalInfo.deleteMany({ user: userId }, { session }),
                professional_info_model_1.ProfessionalInfo.deleteMany({ user: userId }, { session }),
                pro_model_1.Pro.deleteMany({ pro: userId }, { session }),
                notification_model_1.Notification.deleteMany({ user: userId }),
            ]);
        }
        else if (userRole === user_1.ENUM_USER_ROLE.PARTNER) {
            yield Promise.all([
                personal_info_model_1.PersonalInfo.deleteMany({ user: userId }, { session }),
                pro_model_1.Pro.deleteMany({ partner: userId }, { session }),
                offer_model_1.Offer.deleteMany({ partner: userId }, { session }),
                notification_model_1.Notification.deleteMany({ user: userId }),
                partner_verification_model_1.PartnerVerification.deleteMany({ partner: userId }, { session }),
            ]);
        }
        yield session.commitTransaction();
        session.endSession();
        return 'Account deleted successfully';
    }
    catch (error) {
        yield session.abortTransaction();
        session.endSession();
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to delete account');
    }
});
const updateUser = (payload, id
// file: any
) => __awaiter(void 0, void 0, void 0, function* () {
    console.log({ payload });
    // Security: role & permissions can ONLY be changed through the dedicated
    // super-admin-guarded endpoints (updateUserRole / setAdminPermissions), never
    // through this generic admin update. Strip them so a plain admin cannot
    // escalate anyone (including themselves) via PATCH /user/update/:id.
    delete payload.role;
    delete payload.permissions;
    if (payload.status === 'removed') {
        const user = yield user_model_1.User.findById(id);
        if (!user) {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
        }
        yield deleteAccount(user);
    }
    // Blocking is reversible: remember where the user was so Unblock can put them
    // back, rather than guessing a status and either over- or under-promoting them.
    if (payload.status === 'blocked') {
        const current = yield user_model_1.User.findById(id).select('status');
        if ((current === null || current === void 0 ? void 0 : current.status) && current.status !== 'blocked') {
            payload.previousStatus = current.status;
        }
    }
    // 'unblocked' is a client-side intent, not a stored status — resolve it to the
    // status the user held before the block (falling back to pending re-review).
    if (payload.status === 'unblocked') {
        const current = yield user_model_1.User.findById(id).select('status previousStatus');
        if (!current) {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
        }
        payload.status = current.previousStatus || 'pending';
        payload.previousStatus = null;
    }
    const result = yield user_model_1.User.findByIdAndUpdate(id, payload, {
        new: true,
    });
    if (payload.alertType) {
        const { note, alertType } = payload;
        const messageMap = {
            block: note
                ? `<p style="font-size: 16px; color: red;">You have been <strong>blocked</strong> from the platform. <br/> <br/> <strong>Note:</strong> ${note}</p>`
                : `<p style="font-size: 16px; color: red;">You have been <strong>blocked</strong> from the platform.</p>`,
            unblock: note
                ? `<p style="font-size: 16px; color: green;">Your account has been <strong>unblocked</strong>. You can log in again. <br/> <br/> <strong>Note:</strong> ${note}</p>`
                : `<p style="font-size: 16px; color: green;">Your account has been <strong>unblocked</strong>. You can log in again.</p>`,
            remove: note
                ? `<p style="font-size: 16px; color: red;">You have been <strong>removed</strong> from the platform. <br/> <br/> <strong>Note:</strong> ${note}</p>`
                : `<p style="font-size: 16px; color: red;">You have been <strong>removed</strong> from the platform.</p>`,
            approve: note
                ? `<p style="font-size: 16px; color: green;">Your application has been <strong>approved</strong>. <br/> <br/> <strong>Note:</strong> ${note}</p>`
                : `<p style="font-size: 16px; color: green;">Your application has been <strong>approved</strong>.</p>`,
            reject: note
                ? `<p style="font-size: 16px; color: red;">Your application has been <strong>rejected</strong>. <br/> <br/> <strong>Note:</strong> ${note}</p>`
                : `<p style="font-size: 16px; color: red;">Your application has been <strong>rejected</strong>.</p>`,
        };
        const message = messageMap[alertType];
        if (message) {
            let email = payload.email;
            if (!email && result) {
                email = result.email;
            }
            // Notifying the user must never undo the admin's action. The status change
            // above has already been written, so a failing mail server (or a user with
            // no email on file) used to surface as "Something went wrong" in the admin
            // panel even though the block/removal had in fact succeeded — which read as
            // "I can't make changes in Admin". Notification is best-effort from here:
            // failures are logged for follow-up, not thrown.
            // NOTE for 'removed': deleteAccount() above already deleted the user and
            // their notifications, so skip the in-app record and only send the email.
            if (payload.status !== 'removed') {
                try {
                    yield notification_model_1.Notification.create({ user: id, message });
                }
                catch (err) {
                    console.error(`[updateUser] in-app notification failed for user ${id} (${alertType}):`, err);
                }
            }
            if (email) {
                try {
                    yield (0, sendMail_1.sendEmail)(email, 'Notification', `
        <div>
          ${message}
          <p>Thank you</p>
        </div>
        `);
                }
                catch (err) {
                    console.error(`[updateUser] notification email to ${email} failed for ${alertType}:`, err);
                }
            }
            else {
                console.error(`[updateUser] no email on file for user ${id}; skipped ${alertType} notification`);
            }
        }
    }
    return result;
});
const updateOrCreateUserPersonalInformation = (payload, id, file) => __awaiter(void 0, void 0, void 0, function* () {
    const isPersonalInformationExist = yield personal_info_model_1.PersonalInfo.findOne({
        user: id,
    });
    console.log({ file, payload });
    if (file === null || file === void 0 ? void 0 : file.path) {
        const cloudRes = yield cloudinary_1.default.v2.uploader.upload(file.path, {
            upload_preset: 'wevoro',
        });
        payload.image = cloudRes.secure_url;
    }
    let result;
    if (!isPersonalInformationExist) {
        result = yield personal_info_model_1.PersonalInfo.create(Object.assign({ user: id }, payload));
    }
    result = yield personal_info_model_1.PersonalInfo.findOneAndUpdate({ user: id }, { $set: payload }, { new: true });
    // SCRUM-87/88: when an agency completes onboarding via a caregiver's share
    // link, record the (caregiver, agency) engagement and fire the one-time
    // "Agency Onboarded" notification. Idempotent and best-effort — attribution
    // must never break the personal-information save.
    try {
        const account = yield user_model_1.User.findById(id).select('role sourceCaregiverId');
        if ((account === null || account === void 0 ? void 0 : account.role) === user_1.ENUM_USER_ROLE.PARTNER &&
            (account === null || account === void 0 ? void 0 : account.sourceCaregiverId)) {
            yield credentialing_service_1.CredentialingService.recordEngagement(account.sourceCaregiverId.toString(), id.toString());
        }
    }
    catch (err) {
        console.error('Failed to record credentialing engagement:', err);
    }
    return result;
});
const updateOrCreateUserProfessionalInformation = (payload, id, files) => __awaiter(void 0, void 0, void 0, function* () {
    const { certifications } = payload;
    // Upload files to Cloudinary and create a map indexed by certification position
    // Files are named as: certification_0, certification_1, etc.
    const fileMap = {};
    if (files && files.length > 0) {
        for (const file of files) {
            // Extract index from filename (e.g., "certification_0" -> 0)
            const match = file.originalname.match(/certification_(\d+)/);
            if (match) {
                const index = parseInt(match[1], 10);
                // const cloudRes = await cloudinary.v2.uploader.upload(file.path, {
                //   upload_preset: 'Wevoro',
                // });
                const bunnyRes = yield (0, bunny_upload_1.uploadFile)(file);
                console.log('🚀 ~ updateOrCreateUserProfessionalInformation ~ bunnyRes:', bunnyRes);
                fileMap[index] = bunnyRes;
            }
        }
    }
    // Update certifications with uploaded file URLs
    if (certifications && certifications.length > 0) {
        payload.certifications = certifications.map((cert, index) => {
            // If we have a newly uploaded file for this index, use it
            if (fileMap[index]) {
                return Object.assign(Object.assign({}, cert), { certificateFile: fileMap[index] });
            }
            // Otherwise, keep existing certificateFile (if any)
            return cert;
        });
    }
    const isProfessionalInformationExist = yield professional_info_model_1.ProfessionalInfo.findOne({
        user: id,
    });
    let result;
    if (!isProfessionalInformationExist) {
        result = yield professional_info_model_1.ProfessionalInfo.create(Object.assign({ user: id }, payload));
    }
    result = yield professional_info_model_1.ProfessionalInfo.findOneAndUpdate({ user: id }, { $set: payload }, { new: true });
    return result;
});
const handleCalculatePartnerPercentage = (_id) => __awaiter(void 0, void 0, void 0, function* () {
    const offersSent = yield offer_model_1.Offer.countDocuments({ partner: _id });
    const acceptedOffers = yield offer_model_1.Offer.countDocuments({
        partner: _id,
        status: 'accepted',
    });
    const jobConversion = (acceptedOffers / offersSent) * 100 || 0;
    const jobConversionPercentage = Number(jobConversion.toFixed(2));
    return { offersSent, jobConversionPercentage };
});
const getUserProfile = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const { _id, role } = user;
    const existingUser = yield user_model_1.User.findById(_id);
    if (!existingUser) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    const personalInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: _id });
    const sharableLink = `${config_1.default.frontend_url.prod}/pro/${_id}`;
    let completionPercentage = 0;
    let offersSentData = 0;
    let jobConversionPData = 0;
    if (role === user_1.ENUM_USER_ROLE.PRO) {
        const professionalInfo = yield professional_info_model_1.ProfessionalInfo.findOne({ user: _id });
        // SCRUM-93: score every required credential, not just driver_license/tb_tests.
        const documents = yield documents_model_1.Documents.find({ user: _id });
        completionPercentage = (0, calculateProCompletion_1.calculateProCompletion)(personalInfo, professionalInfo, documents);
    }
    if (role === user_1.ENUM_USER_ROLE.PARTNER) {
        const fields = [
            'image',
            'firstName',
            'lastName',
            'phone',
            'bio',
            'dateOfBirth',
            'companyName',
            'industry',
            'address',
        ];
        completionPercentage = (0, calculatePartnerPercentage_1.calculatePartnerPercentage)(fields, personalInfo);
        const { offersSent, jobConversionPercentage } = yield handleCalculatePartnerPercentage(_id);
        offersSentData = offersSent;
        jobConversionPData = jobConversionPercentage;
    }
    const result = yield user_model_1.User.aggregate([
        {
            $match: {
                email: user.email,
                _id: new mongoose_1.default.Types.ObjectId(user._id),
            },
        },
        {
            $lookup: {
                from: 'personalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'personalInfo',
            },
        },
        {
            $lookup: {
                from: 'professionalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'professionalInfo',
            },
        },
        {
            $lookup: {
                from: 'partnerverifications',
                localField: '_id',
                foreignField: 'partner',
                as: 'partnerVerification',
            },
        },
        {
            $project: {
                email: 1,
                role: 1,
                status: 1,
                // phone: 1,
                coverImage: 1,
                createdAt: 1,
                updatedAt: 1,
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                partnerVerification: { $arrayElemAt: ['$partnerVerification', 0] },
                isRecentlyActive: {
                    $cond: {
                        if: { $ifNull: ['$lastLoginAt', false] },
                        then: {
                            $lt: [
                                {
                                    $subtract: ['$$NOW', '$lastLoginAt'],
                                },
                                7 * 24 * 60 * 60 * 1000,
                            ],
                        },
                        else: false,
                    },
                },
                completionPercentage: {
                    $cond: {
                        if: {
                            $or: [
                                { $eq: [role, user_1.ENUM_USER_ROLE.PRO] },
                                { $eq: [role, user_1.ENUM_USER_ROLE.PARTNER] },
                            ],
                        },
                        then: completionPercentage,
                        else: 0,
                    },
                },
                sharableLink: sharableLink,
                shareId: '$shareId',
                offersSent: {
                    $cond: {
                        if: { $eq: [role, user_1.ENUM_USER_ROLE.PARTNER] },
                        then: offersSentData,
                        else: 0,
                    },
                },
                jobConversionPercentage: {
                    $cond: {
                        if: { $eq: [role, user_1.ENUM_USER_ROLE.PARTNER] },
                        then: jobConversionPData,
                        else: 0,
                    },
                },
            },
        },
    ]);
    return result.length > 0 ? result[0] : null;
});
const getUserById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    if (!id) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User id is required');
    }
    const sharableLink = `${config_1.default.frontend_url.prod}/pro/${id}`;
    const result = yield user_model_1.User.aggregate([
        {
            $match: {
                _id: new mongoose_1.default.Types.ObjectId(id),
            },
        },
        {
            $lookup: {
                from: 'personalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'personalInfo',
            },
        },
        {
            $lookup: {
                from: 'professionalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'professionalInfo',
            },
        },
        {
            $project: {
                email: 1,
                name: 1,
                role: 1,
                // phone: 1,
                coverImage: 1,
                createdAt: 1,
                updatedAt: 1,
                status: 1,
                lastLoginAt: 1,
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                isRecentlyActive: {
                    $cond: {
                        if: { $ifNull: ['$lastLoginAt', false] },
                        then: {
                            $lt: [
                                {
                                    $subtract: ['$$NOW', '$lastLoginAt'],
                                },
                                7 * 24 * 60 * 60 * 1000,
                            ],
                        },
                        else: false,
                    },
                },
                sharableLink: sharableLink,
                shareId: '$shareId',
                backgroundCheckStatus: 1,
                // offersSent: offersSentData,
                // jobConversionPercentage: jobConversionPData,
            },
        },
    ]);
    return result.length > 0 ? result[0] : null;
});
const getUserByShareId = (shareId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!shareId) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Share ID is required');
    }
    // Try shareId first, then fall back to _id for existing users without a shareId
    let user = yield user_model_1.User.findOne({ shareId });
    if (!user) {
        // Check if it's a valid MongoDB ObjectId and try _id lookup
        const mongoose = require('mongoose');
        if (mongoose.Types.ObjectId.isValid(shareId)) {
            user = yield user_model_1.User.findById(shareId);
        }
    }
    if (!user) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'Profile not found');
    }
    const personalInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
    const profInfo = yield professional_info_model_1.ProfessionalInfo.findOne({ user: user._id });
    const documents = yield documents_model_1.Documents.find({ user: user._id });
    const verifiedCount = documents.filter((d) => d.reviewStatus === 'approved').length;
    return {
        _id: user._id,
        role: user.role,
        status: user.status,
        shareId: user.shareId,
        personalInfo: personalInfo ? {
            firstName: personalInfo.firstName,
            lastName: personalInfo.lastName ? personalInfo.lastName.charAt(0) + '.' : '',
            image: personalInfo.image,
            address: personalInfo.address ? {
                city: personalInfo.address.city,
                state: personalInfo.address.state,
            } : null,
        } : null,
        professionalInfo: profInfo ? {
            role: profInfo.role,
        } : null,
        credentialsSummary: {
            verified: verifiedCount,
            total: 5,
        },
    };
});
const getUsers = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.aggregate([
        {
            $lookup: {
                from: 'personalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'personalInfo',
            },
        },
        {
            $lookup: {
                from: 'professionalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'professionalInfo',
            },
        },
        {
            $lookup: {
                from: 'partnerverifications',
                localField: '_id',
                foreignField: 'partner',
                as: 'partnerVerification',
            },
        },
        // {
        //   $sort: { createdAt: -1 },
        // },
        {
            $project: {
                email: 1,
                name: 1,
                role: 1,
                // phone: 1,
                coverImage: 1,
                createdAt: 1,
                updatedAt: 1,
                status: 1,
                lastLoginAt: 1,
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                isRecentlyActive: {
                    $cond: {
                        if: { $ifNull: ['$lastLoginAt', false] },
                        then: {
                            $lt: [
                                {
                                    $subtract: ['$$NOW', '$lastLoginAt'],
                                },
                                7 * 24 * 60 * 60 * 1000,
                            ],
                        },
                        else: false,
                    },
                },
                partnerVerification: { $arrayElemAt: ['$partnerVerification', 0] },
            },
        },
    ]);
    return result;
});
const updateCoverImage = (id, file) => __awaiter(void 0, void 0, void 0, function* () {
    if (!id) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'User id is required');
    }
    if (!(file === null || file === void 0 ? void 0 : file.path)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'File is required');
    }
    const cloudRes = yield cloudinary_1.default.v2.uploader.upload(file.path, {
        upload_preset: 'wevoro',
    });
    const result = yield user_model_1.User.findByIdAndUpdate(id, { coverImage: cloudRes.secure_url }, { new: true });
    return result;
});
const storePro = (payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    const { pro } = payload;
    const existingPro = yield pro_model_1.Pro.findOne({ partner: user._id, pro });
    if (existingPro) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Pro already exists');
    }
    const result = yield pro_model_1.Pro.create({ partner: user._id, pro });
    return result;
});
const getPros = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield pro_model_1.Pro.aggregate([
        {
            $match: {
                partner: new mongoose_1.default.Types.ObjectId(user._id),
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'pro',
                foreignField: '_id',
                as: 'pro',
                pipeline: [
                    {
                        $lookup: {
                            from: 'personalinformations',
                            localField: '_id',
                            foreignField: 'user',
                            as: 'personalInfo',
                        },
                    },
                    {
                        $lookup: {
                            from: 'professionalinformations',
                            localField: '_id',
                            foreignField: 'user',
                            as: 'professionalInfo',
                        },
                    },
                    {
                        $addFields: {
                            personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                            professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                        },
                    },
                    {
                        $match: user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {},
                    },
                    {
                        $project: {
                            password: 0,
                            isGoogleUser: 0,
                            canResetPassword: 0,
                            __v: 0,
                        },
                    },
                    {
                        $addFields: {
                            isRecentlyActive: {
                                $cond: {
                                    if: { $ifNull: ['$lastLoginAt', false] },
                                    then: {
                                        $lt: [
                                            {
                                                $subtract: ['$$NOW', '$lastLoginAt'],
                                            },
                                            7 * 24 * 60 * 60 * 1000,
                                        ],
                                    },
                                    else: false,
                                },
                            },
                        },
                    },
                ],
            },
        },
        {
            $project: {
                _id: 0,
                pro: 1,
            },
        },
        {
            $unwind: '$pro',
        },
    ]);
    return result.map(item => item.pro).reverse();
});
// Browse all available caregivers for partner (approved pros with full profile info)
const getAllAvailablePros = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield user_model_1.User.aggregate([
        {
            $match: {
                role: 'pro',
                status: 'approved',
            },
        },
        {
            $lookup: {
                from: 'personalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'personalInfo',
            },
        },
        {
            $lookup: {
                from: 'professionalinformations',
                localField: '_id',
                foreignField: 'user',
                as: 'professionalInfo',
            },
        },
        {
            $lookup: {
                from: 'documents',
                localField: '_id',
                foreignField: 'user',
                as: 'documents',
            },
        },
        {
            $addFields: {
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                isRecentlyActive: {
                    $cond: {
                        if: { $ifNull: ['$lastLoginAt', false] },
                        then: {
                            $lt: [{ $subtract: ['$$NOW', '$lastLoginAt'] }, 7 * 24 * 60 * 60 * 1000],
                        },
                        else: false,
                    },
                },
                credentialSummary: {
                    total: { $size: '$documents' },
                    verified: {
                        $size: {
                            $filter: {
                                input: '$documents',
                                as: 'doc',
                                cond: { $eq: ['$$doc.reviewStatus', 'approved'] },
                            },
                        },
                    },
                    pending: {
                        $size: {
                            $filter: {
                                input: '$documents',
                                as: 'doc',
                                cond: { $eq: ['$$doc.reviewStatus', 'pending'] },
                            },
                        },
                    },
                    rejected: {
                        $size: {
                            $filter: {
                                input: '$documents',
                                as: 'doc',
                                cond: { $eq: ['$$doc.reviewStatus', 'rejected'] },
                            },
                        },
                    },
                },
            },
        },
        {
            $project: {
                password: 0,
                isGoogleUser: 0,
                canResetPassword: 0,
                documents: 0,
                __v: 0,
            },
        },
        { $sort: { createdAt: -1 } },
    ]);
    return result;
});
const createNotification = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(payload.user);
    const email = (user === null || user === void 0 ? void 0 : user.email) || payload.email;
    // Save the in-app notification FIRST, then email best-effort. This used to
    // email before saving and let failures throw, so a mail-server outage meant
    // the admin's message was never recorded at all and the panel reported a
    // generic failure.
    const result = yield notification_model_1.Notification.create(payload);
    if (email) {
        try {
            yield (0, sendMail_1.sendEmail)(email, 'Notification', `
    <div>
    <p>New notification: <strong>${payload.message}</strong></p>

    <p>Thank you</p>
    </div>
    `);
        }
        catch (err) {
            console.error(`[createNotification] email to ${email} failed; in-app notification was still saved:`, err);
        }
    }
    else {
        console.error(`[createNotification] no email on file for user ${payload.user}; in-app notification saved only`);
    }
    return result;
});
const getNotifications = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield notification_model_1.Notification.find({ user: user._id }).sort({
        createdAt: -1,
    });
    return result;
});
const deleteNotification = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield notification_model_1.Notification.findByIdAndDelete(id);
    return result;
});
const markAllNotificationsAsRead = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield notification_model_1.Notification.updateMany({ user: user._id }, { $set: { isRead: true } });
    return result;
});
const autoFillAI = (user, file) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    if (!(file === null || file === void 0 ? void 0 : file.path)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Resume file is required');
    }
    // Use unpdf for serverless-compatible PDF text extraction
    const fileBuffer = fs_1.default.readFileSync(file.path);
    let profileImgUrl = null;
    let pdfDoc;
    try {
        // Create a copy of the array buffer since pdf.js web workers can detach buffers via structuredClone
        const uint8ArrayCopy = new Uint8Array(fileBuffer).slice();
        pdfDoc = yield (0, unpdf_1.getDocumentProxy)(uint8ArrayCopy);
        const imagesData = yield (0, unpdf_1.extractImages)(pdfDoc, 1);
        // Sort by largest area first
        const sortedImages = imagesData.sort((a, b) => b.width * b.height - a.width * a.height);
        if (sortedImages.length > 0) {
            const largestImg = sortedImages[0];
            // Only process if it's reasonably sized, to avoid grabbing a tiny icon
            if (largestImg.width >= 50 && largestImg.height >= 50) {
                const pngBuffer = yield (0, sharp_1.default)(Buffer.from(largestImg.data.buffer, largestImg.data.byteOffset, largestImg.data.byteLength), {
                    raw: {
                        width: largestImg.width,
                        height: largestImg.height,
                        channels: largestImg.channels,
                    },
                })
                    .png()
                    .toBuffer();
                const uploadRes = yield new Promise((resolve, reject) => {
                    const stream = cloudinary_1.default.v2.uploader.upload_stream({ upload_preset: 'wevoro' }, (error, result) => {
                        if (error)
                            reject(error);
                        else
                            resolve(result);
                    });
                    stream.end(pngBuffer);
                });
                profileImgUrl = uploadRes.secure_url;
            }
        }
    }
    catch (imgError) {
        console.error('Failed to extract/upload profile image from PDF:', imgError);
    }
    let resumeText = '';
    try {
        if (!pdfDoc) {
            const uint8ArrayCopy2 = new Uint8Array(fileBuffer).slice();
            pdfDoc = yield (0, unpdf_1.getDocumentProxy)(uint8ArrayCopy2);
        }
        const extractResult = yield (0, unpdf_1.extractText)(pdfDoc, {
            mergePages: true,
        });
        resumeText = extractResult.text;
    }
    catch (textError) {
        console.error('Failed to extract text from PDF:', textError);
    }
    console.log('🚀 ~ autoFillAI ~ resumeText:', resumeText);
    if (!resumeText || resumeText.trim().length === 0) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'The uploaded file appears to be empty. Please upload a valid CV.');
    }
    // Define the expected JSON schema for OpenAI
    const systemPrompt = `You are a resume parser AI. Extract information from the provided resume text and return a clean JSON object with the following structure:

{
  "isValidResume": true or false,
  "personalInformation": {
    "firstName": "string or null",
    "lastName": "string or null",
    "phone": "string or null",
    "bio": "string or null (short professional summary)",
    "dateOfBirth": "ISO date string or null",
    "gender": "Male, Female, Other, or null",
    "address": {
      "street": "string or null",
      "city": "string or null",
      "state": "string or null",
      "zipCode": "string or null",
      "country": "string or null"
    }
  },
  "professionalInformation": {
    "education": [
      {
        "degree": "string",
        "institution": "string",
        "yearOfGraduation": number or null,
        "fieldOfStudy": "string or null",
        "grade": "string or null (GPA or grade)"
      }
    ],
    "experience": [
      {
        "jobTitle": "string",
        "companyName": "string",
        "duration": "string (e.g., 'Jan 2020 - Dec 2022' or '3 years')",
        "responsibilities": "string (brief description of role)"
      }
    ],
    "certifications": [
      {
        "title": "string",
        "institution": "string or null",
        "issueDate": "ISO date string or null",
        "expireDate": "ISO date string or null",
        "credentialId": "string or null",
        "credentialUrl": "string or null"
      }
    ],
    "skills": ["string array of skills"]
  }
}

Rules:
1. Return ONLY the JSON object, no additional text, markdown, or explanation.
2. Use null for fields that cannot be determined from the resume.
3. For arrays (education, experience, certifications, skills), return an empty array [] if no items found.
4. Ensure dates are in ISO format (YYYY-MM-DD) where possible.
5. Extract a professional bio/summary if available, otherwise use null.
6. Parse the full name into firstName and lastName.
7. If the text does not appear to be a valid resume or CV (e.g. a random paragraph), set "isValidResume" to false. Otherwise, set it to true.`;
    // Call OpenAI API
    const response = yield fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config_1.default.openai_api_key}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `Parse this resume and extract the information:\n\n${resumeText}`,
                },
            ],
            temperature: 0.1,
            max_tokens: 2000,
        }),
    });
    if (!response.ok) {
        const errorData = yield response.json();
        console.error('OpenAI API error:', errorData);
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'Failed to process resume with AI');
    }
    const openaiResponse = yield response.json();
    const content = (_c = (_b = (_a = openaiResponse.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
    if (!content) {
        throw new ApiError_1.default(http_status_1.default.INTERNAL_SERVER_ERROR, 'No response from AI');
    }
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
    }
    else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
    }
    if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
    }
    cleanedContent = cleanedContent.trim();
    const parsedData = JSON.parse(cleanedContent);
    if (!parsedData.isValidResume) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, "We couldn't detect a valid CV format. Please upload a proper resume.");
    }
    if (profileImgUrl && parsedData.personalInformation) {
        parsedData.personalInformation.image = profileImgUrl;
    }
    return parsedData;
});
// SCRUM-66: Update GCHEXS background check self-report status
const updateGchexsStatus = (userId, gchexsStatus, gchexsDocumentUrl, gchexsDocumentFileId) => __awaiter(void 0, void 0, void 0, function* () {
    const updateData = {
        gchexsStatus,
        gchexsUpdatedAt: new Date(),
    };
    if (gchexsStatus === 'yes' && gchexsDocumentUrl) {
        updateData.gchexsDocumentUrl = gchexsDocumentUrl;
        updateData.gchexsDocumentFileId = gchexsDocumentFileId;
    }
    // If changing to 'no', don't delete the document (retained per SCRUM-66 spec)
    // Just update the status
    const result = yield professional_info_model_1.ProfessionalInfo.findOneAndUpdate({ user: userId }, { $set: updateData }, { new: true, upsert: true });
    return result;
});
// ============================================================================
// Super Admin panel — admin management (all callers are super_admin-guarded at
// the route layer). Role & permission mutations live here ONLY, never in the
// generic updateUser.
// ============================================================================
/** List every admin / super_admin with their permissions. */
const getAdmins = () => __awaiter(void 0, void 0, void 0, function* () {
    const admins = yield user_model_1.User.find({
        role: { $in: [user_1.ENUM_USER_ROLE.ADMIN, user_1.ENUM_USER_ROLE.SUPER_ADMIN] },
    })
        .select('email role permissions previousRole status createdAt lastLoginAt')
        .lean();
    const withNames = yield Promise.all(admins.map((a) => __awaiter(void 0, void 0, void 0, function* () {
        const info = yield personal_info_model_1.PersonalInfo.findOne({ user: a._id })
            .select('firstName lastName image companyName')
            .lean();
        const name = info
            ? `${info.firstName || ''} ${info.lastName || ''}`.trim()
            : '';
        return Object.assign(Object.assign({}, a), { name: name || (info === null || info === void 0 ? void 0 : info.companyName) || a.email, image: (info === null || info === void 0 ? void 0 : info.image) || null });
    })));
    return withNames;
});
/**
 * Promote a normal user to admin, or demote an admin back to a normal role.
 * Only role — nothing else — is touched. Super admins can never be created or
 * demoted here (that path is the guarded super-setup / seed only).
 */
const updateUserRole = (id, role, actorId) => __awaiter(void 0, void 0, void 0, function* () {
    const allowedTargets = [
        user_1.ENUM_USER_ROLE.ADMIN,
        user_1.ENUM_USER_ROLE.PRO,
        user_1.ENUM_USER_ROLE.PARTNER,
    ];
    if (!allowedTargets.includes(role)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Invalid target role');
    }
    const target = yield user_model_1.User.findById(id).select('role previousRole email');
    if (!target) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    // Never let anyone change their own role. Only super admins reach this
    // function (the route is super-admin-guarded), so this self-check is also
    // what guarantees at least one super admin always remains: a super admin can
    // remove other super admins but never themselves.
    if (actorId && actorId.toString() === id.toString()) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'You cannot change your own role');
    }
    // A super admin removing another super admin is intentional (client request).
    // It falls through to the demote branch below, which clears permissions and
    // returns them to a normal account.
    const update = { role };
    if (role === user_1.ENUM_USER_ROLE.ADMIN) {
        // Promoting: remember where they came from so demote is lossless.
        if (target.role === user_1.ENUM_USER_ROLE.PRO ||
            target.role === user_1.ENUM_USER_ROLE.PARTNER) {
            update.previousRole = target.role;
        }
    }
    else {
        // Demoting an admin back to a normal user: restore their original role if we
        // remembered it, and clear any granted permissions.
        update.role =
            target.previousRole === user_1.ENUM_USER_ROLE.PARTNER ||
                target.previousRole === user_1.ENUM_USER_ROLE.PRO
                ? target.previousRole
                : role;
        update.permissions = [];
        update.previousRole = null;
    }
    const result = yield user_model_1.User.findByIdAndUpdate(id, update, { new: true });
    return result;
});
/** Set the granular permission keys on an admin. Validated against the grantable list. */
const setAdminPermissions = (id, permissions) => __awaiter(void 0, void 0, void 0, function* () {
    if (!Array.isArray(permissions)) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'permissions must be an array');
    }
    const invalid = permissions.filter((p) => !user_constant_1.GRANTABLE_PERMISSIONS.includes(p));
    if (invalid.length) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, `Invalid permission(s): ${invalid.join(', ')}`);
    }
    const target = yield user_model_1.User.findById(id).select('role');
    if (!target) {
        throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
    }
    if (target.role !== user_1.ENUM_USER_ROLE.ADMIN) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Permissions can only be set on an admin');
    }
    const result = yield user_model_1.User.findByIdAndUpdate(id, { permissions: Array.from(new Set(permissions)) }, { new: true });
    return result;
});
/**
 * Self-serve super-admin creation via the setup link. Gated by a shared secret
 * (config.super_admin.setup_key). Creates a new super_admin, or promotes an
 * existing account to super_admin (and resets its password if supplied).
 */
const superSetup = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, password, setupKey } = payload || {};
    if (!setupKey || setupKey !== config_1.default.super_admin.setup_key) {
        throw new ApiError_1.default(http_status_1.default.UNAUTHORIZED, 'Invalid setup key');
    }
    if (!email || !password) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Email and password are required');
    }
    if (String(password).length < 6) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Password must be at least 6 characters');
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = yield user_model_1.User.findOne({ email: normalizedEmail }).select('_id password');
    if (existing) {
        // Promote + reset password (pre-save hook re-hashes it).
        existing.role = user_1.ENUM_USER_ROLE.SUPER_ADMIN;
        existing.status = 'approved';
        existing.permissions = [];
        existing.password = password;
        existing.isGoogleUser = false;
        yield existing.save();
        return { email: normalizedEmail, created: false };
    }
    yield user_model_1.User.create({
        email: normalizedEmail,
        password,
        role: user_1.ENUM_USER_ROLE.SUPER_ADMIN,
        status: 'approved',
        permissions: [],
    });
    return { email: normalizedEmail, created: true };
});
/**
 * Idempotent boot seed: guarantee a super admin exists — but ONLY when both
 * SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars are set. With no env
 * config this is a no-op; super admins are then created via /super-setup.
 */
const ensureSuperAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!config_1.default.super_admin.email || !config_1.default.super_admin.password)
            return;
        const email = config_1.default.super_admin.email.trim().toLowerCase();
        const existing = yield user_model_1.User.findOne({ email }).select('_id role');
        if (!existing) {
            yield user_model_1.User.create({
                email,
                password: config_1.default.super_admin.password,
                role: user_1.ENUM_USER_ROLE.SUPER_ADMIN,
                status: 'approved',
                permissions: [],
            });
            // eslint-disable-next-line no-console
            console.log(`Seeded fixed super admin: ${email}`);
        }
        else if (existing.role !== user_1.ENUM_USER_ROLE.SUPER_ADMIN) {
            yield user_model_1.User.findByIdAndUpdate(existing._id, {
                role: user_1.ENUM_USER_ROLE.SUPER_ADMIN,
                status: 'approved',
            });
            // eslint-disable-next-line no-console
            console.log(`Promoted existing account to super admin: ${email}`);
        }
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('ensureSuperAdmin failed:', err);
    }
});
exports.UserService = {
    createUser,
    updateUser,
    getAdmins,
    updateUserRole,
    setAdminPermissions,
    superSetup,
    ensureSuperAdmin,
    getUserProfile,
    updateOrCreateUserPersonalInformation,
    updateOrCreateUserProfessionalInformation,
    // updateOrCreateUserDocuments,
    getUserById,
    updateCoverImage,
    getPros,
    joinWaitlist,
    storePro,
    createNotification,
    getNotifications,
    deleteNotification,
    markAllNotificationsAsRead,
    deleteAccount,
    getUsers,
    updateAllUsers,
    autoFillAI,
    getUserByShareId,
    updateGchexsStatus,
    getAllAvailablePros,
};
