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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const pdfjsLib = __importStar(require("pdfjs-dist/legacy/build/pdf.mjs"));
const fs_1 = __importDefault(require("fs"));
const user_model_1 = require("./user.model");
const cloudinary_1 = __importDefault(require("cloudinary"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../../../config"));
const user_1 = require("../../../enums/user");
const calculatePartnerPercentage_1 = require("../../../helpers/calculatePartnerPercentage");
const sendMail_1 = require("../auth/sendMail");
const documents_model_1 = require("../document/documents.model");
const notification_model_1 = require("./notification.model");
const offer_model_1 = require("./offer.model");
const personal_info_model_1 = require("./personal-info.model");
const pro_model_1 = require("./pro.model");
const professional_info_model_1 = require("./professional-info.model");
const waitlist_model_1 = require("./waitlist.model");
const bunny_upload_1 = require("../../../helpers/bunny-upload");
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
            ]);
        }
        else if (userRole === user_1.ENUM_USER_ROLE.PARTNER) {
            yield Promise.all([
                personal_info_model_1.PersonalInfo.deleteMany({ user: userId }, { session }),
                pro_model_1.Pro.deleteMany({ partner: userId }, { session }),
                offer_model_1.Offer.deleteMany({ partner: userId }, { session }),
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
    if (payload.status === 'removed') {
        const user = yield user_model_1.User.findById(id);
        if (!user) {
            throw new ApiError_1.default(http_status_1.default.NOT_FOUND, 'User not found');
        }
        yield deleteAccount(user);
    }
    const result = yield user_model_1.User.findByIdAndUpdate(id, payload, {
        new: true,
    });
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
// const updateOrCreateUserDocuments = async (
//   id: string,
//   files: any,
//   payload: any
// ): Promise<any> => {
//   let fileMap: any = {};
//   if (files?.certificate?.[0]?.path) {
//     fileMap.certificate = files.certificate[0].path;
//   }
//   if (files?.resume?.[0]?.path) {
//     fileMap.resume = files.resume[0].path;
//   }
//   if (files?.governmentId?.[0]?.path) {
//     fileMap.governmentId = files.governmentId[0].path;
//   }
//   if (Object.keys(fileMap).length > 0) {
//     for (const file of Object.keys(fileMap)) {
//       const cloudRes = await cloudinary.v2.uploader.upload(fileMap[file], {
//         upload_preset: 'wevoro',
//       });
//       // console.log('cloudRes', cloudRes);
//       fileMap[file] = cloudRes.secure_url;
//     }
//   }
//   const isDocumentsExist = await Documents.findOne({ user: id });
//   let result: any;
//   if (!isDocumentsExist) {
//     result = await Documents.create({ user: id, ...fileMap });
//   }
//   if (Object.keys(payload).length > 0) {
//     fileMap = payload;
//   }
//   // console.log('query', fileMap);
//   result = await Documents.findOneAndUpdate(
//     { user: id },
//     { $set: fileMap },
//     { new: true }
//   );
//   return result;
// };
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
        const documents = yield documents_model_1.Documents.findOne({ user: _id });
        const totalSteps = 3;
        const completedSteps = [
            Object.keys(personalInfo || {}).length > 0,
            Object.keys(professionalInfo || {}).length > 0,
            Object.keys(documents || {}).length > 0,
        ].filter(Boolean).length;
        completionPercentage = Math.floor((completedSteps / totalSteps) * 100);
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
                from: 'documents',
                localField: '_id',
                foreignField: 'user',
                as: 'documents',
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
                documents: { $arrayElemAt: ['$documents', 0] },
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
            $lookup: {
                from: 'documents',
                localField: '_id',
                foreignField: 'user',
                as: 'documents',
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
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                documents: { $arrayElemAt: ['$documents', 0] },
                sharableLink: sharableLink,
                // offersSent: offersSentData,
                // jobConversionPercentage: jobConversionPData,
            },
        },
    ]);
    return result.length > 0 ? result[0] : null;
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
                from: 'documents',
                localField: '_id',
                foreignField: 'user',
                as: 'documents',
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
                personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                professionalInfo: { $arrayElemAt: ['$professionalInfo', 0] },
                documents: { $arrayElemAt: ['$documents', 0] },
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
const createOrUpdateOffer = (payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    // Ensure the payload has the partner ID
    payload.partner = user._id;
    // Check if `payload.offer` exists to differentiate between update and create
    if (payload === null || payload === void 0 ? void 0 : payload.offer) {
        // Try updating the document
        const result = yield offer_model_1.Offer.findByIdAndUpdate(payload.offer, payload, {
            new: true, // Return the updated document
            upsert: true, // Create a new document if it doesn't exist
            setDefaultsOnInsert: true, // Ensure default values are set
        });
        return result;
    }
    else {
        // If no `offer` ID is provided, create a new document explicitly
        const newOffer = new offer_model_1.Offer(payload);
        const savedOffer = yield newOffer.save();
        return savedOffer;
    }
});
const getOffers = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.aggregate([
        {
            $match: Object.assign({ [user.role]: new mongoose_1.default.Types.ObjectId(user._id) }, (user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {})),
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
                            documents: { $arrayElemAt: ['$documents', 0] },
                        },
                    },
                ],
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'partner',
                foreignField: '_id',
                as: 'partner',
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
                        $addFields: {
                            personalInfo: { $arrayElemAt: ['$personalInfo', 0] },
                        },
                    },
                ],
            },
        },
        {
            $sort: { createdAt: -1 }, // Sort by createdAt in descending order
        },
        {
            $project: {
                pro: { $arrayElemAt: ['$pro', 0] },
                partner: { $arrayElemAt: ['$partner', 0] },
                notes: 1,
                documentsNeeded: 1,
                status: 1,
                jobLink: 1,
                createdAt: 1,
                updatedAt: 1,
            },
        },
    ]);
    return result;
});
const deleteOffer = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.findByIdAndDelete(id);
    return result;
});
const updateOffer = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.findByIdAndUpdate(id, payload, { new: true });
    return result;
});
const updateOfferNotes = (id, payload) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.findByIdAndUpdate(id, { $push: { notes: payload } }, { new: true });
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
                            documents: { $arrayElemAt: ['$documents', 0] },
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
const uploadOfferDocuments = (files, id) => __awaiter(void 0, void 0, void 0, function* () {
    const fileMap = {};
    if (files.length > 0) {
        for (const file of files) {
            const cloudRes = yield cloudinary_1.default.v2.uploader.upload(file.path, {
                upload_preset: 'wevoro',
            });
            fileMap[file.originalname] = cloudRes.secure_url;
        }
    }
    const offer = yield offer_model_1.Offer.findById(id);
    if (!offer) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Offer not found');
    }
    const documentsNeeded = offer.documentsNeeded;
    const documents = documentsNeeded.map((document) => {
        if (fileMap[document._id]) {
            return Object.assign(Object.assign({}, document), { url: fileMap[document._id], status: 'uploaded' });
        }
        return document;
    });
    offer.documentsNeeded = documents;
    offer.status = 'responded';
    yield offer.save();
    return offer;
});
const createNotification = (payload) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_model_1.User.findById(payload.user);
    const email = (user === null || user === void 0 ? void 0 : user.email) || payload.email;
    console.log(email, user, payload);
    yield (0, sendMail_1.sendEmail)(email, 'Notification', `
    <div>
    <p>New notification: <strong>${payload.message}</strong></p>

    <p>Thank you</p>
    </div>
    `);
    const result = yield notification_model_1.Notification.create(payload);
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
    // Parse PDF to extract text using pdfjs-dist
    const fileBuffer = fs_1.default.readFileSync(file.path);
    const uint8Array = new Uint8Array(fileBuffer);
    const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        useSystemFonts: true,
        disableFontFace: true,
    });
    const pdfDocument = yield loadingTask.promise;
    let resumeText = '';
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = yield pdfDocument.getPage(pageNum);
        const textContent = yield page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        resumeText += pageText + '\n';
    }
    resumeText = resumeText.trim();
    console.log('🚀 ~ autoFillAI ~ resumeText:', resumeText);
    if (!resumeText || resumeText.trim().length === 0) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Could not extract text from the PDF');
    }
    // Define the expected JSON schema for OpenAI
    const systemPrompt = `You are a resume parser AI. Extract information from the provided resume text and return a clean JSON object with the following structure:

{
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
6. Parse the full name into firstName and lastName.`;
    // console.log('config.openai_api_key', config.openai_api_key);
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
    return parsedData;
});
exports.UserService = {
    createUser,
    updateUser,
    getUserProfile,
    updateOrCreateUserPersonalInformation,
    updateOrCreateUserProfessionalInformation,
    // updateOrCreateUserDocuments,
    getUserById,
    updateCoverImage,
    getPros,
    joinWaitlist,
    createOrUpdateOffer,
    getOffers,
    deleteOffer,
    storePro,
    uploadOfferDocuments,
    updateOffer,
    updateOfferNotes,
    createNotification,
    getNotifications,
    deleteNotification,
    markAllNotificationsAsRead,
    deleteAccount,
    getUsers,
    updateAllUsers,
    autoFillAI,
};
