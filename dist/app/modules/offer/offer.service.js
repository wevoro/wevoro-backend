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
exports.OfferService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const offer_model_1 = require("./offer.model");
const ApiError_1 = __importDefault(require("../../../errors/ApiError"));
const http_status_1 = __importDefault(require("http-status"));
const bunny_upload_1 = require("../../../helpers/bunny-upload");
const documents_model_1 = require("../document/documents.model");
const notification_model_1 = require("../user/notification.model");
const user_model_1 = require("../user/user.model");
const personal_info_model_1 = require("../user/personal-info.model");
const sendMail_1 = require("../auth/sendMail");
const createOrUpdateOffer = (payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    // Ensure the payload has the partner ID
    payload.partner = user._id;
    console.log('🚀 ~ createOrUpdateOffer ~ payload:', payload);
    const isUpdate = !!(payload === null || payload === void 0 ? void 0 : payload.offer);
    let result;
    // Check if `payload.offer` exists to differentiate between update and create
    if (isUpdate) {
        // Try updating the document
        result = yield offer_model_1.Offer.findByIdAndUpdate(payload.offer, payload, {
            new: true, // Return the updated document
            upsert: true, // Create a new document if it doesn't exist
            setDefaultsOnInsert: true, // Ensure default values are set
        });
    }
    else {
        // If no `offer` ID is provided, create a new document explicitly
        const newOffer = new offer_model_1.Offer(payload);
        result = yield newOffer.save();
    }
    // Send notification to the Pro user
    try {
        // Get partner's company name
        const partnerInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
        const companyName = (partnerInfo === null || partnerInfo === void 0 ? void 0 : partnerInfo.companyName) || 'A partner';
        // Get pro user's email
        const proUser = yield user_model_1.User.findById(payload.pro);
        const proEmail = proUser === null || proUser === void 0 ? void 0 : proUser.email;
        // Create notification message
        const message = isUpdate
            ? `<p><span style="font-weight: 600; color: #008000;">${companyName}</span> has made some updates to their offer requirements. Please review the changes at your earliest convenience.</p>`
            : `<p>Great news! You have received a new offer from <span style="font-weight: 600; color: #008000;">${companyName}</span>. Check it out and respond promptly.</p>`;
        // Create notification in database
        const notification = yield notification_model_1.Notification.create({
            user: payload.pro,
            message,
        });
        console.log('🚀 ~ createOrUpdateOffer ~ notification:', notification, proEmail);
        // Send email notification
        if (proEmail) {
            yield (0, sendMail_1.sendEmail)(proEmail, isUpdate ? 'Offer Updated' : 'New Offer Received', `<div>${message}<p>Thank you</p></div>`);
        }
    }
    catch (error) {
        // Log error but don't fail the request
        console.error('Failed to send notification:', error);
    }
    return result;
});
const getOffers = (user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.aggregate([
        {
            $match: Object.assign({ [user.role]: new mongoose_1.default.Types.ObjectId(user._id) }, (user.role === 'pro' ? { isRemovedByPro: { $ne: true } } : {})),
        },
        // Lookup pro user with their info
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
                        },
                    },
                ],
            },
        },
        // Lookup partner user with their info
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
        // Sort by newest first
        { $sort: { createdAt: -1 } },
        // Final projection
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
    // Post-process: Populate document references in documentsNeeded
    // OPTIMIZED: Single batch query for all documents across all offers
    // Step 1: Collect ALL document IDs from ALL offers
    const allDocumentIds = [];
    for (const offer of result) {
        if (offer.documentsNeeded && offer.documentsNeeded.length > 0) {
            for (const doc of offer.documentsNeeded) {
                if (doc.document) {
                    allDocumentIds.push(doc.document.toString());
                }
            }
        }
    }
    // Step 2: Fetch ALL documents in ONE query
    let documentMap = new Map();
    if (allDocumentIds.length > 0) {
        const uniqueIds = [...new Set(allDocumentIds)]; // Remove duplicates
        const documents = yield documents_model_1.Documents.find({
            _id: { $in: uniqueIds },
        }).lean();
        documentMap = new Map(documents.map((doc) => [doc._id.toString(), doc]));
    }
    // Step 3: Map populated documents back to each offer
    for (const offer of result) {
        if (offer.documentsNeeded && offer.documentsNeeded.length > 0) {
            offer.documentsNeeded = offer.documentsNeeded.map((docNeeded) => {
                const populatedDoc = docNeeded.document
                    ? documentMap.get(docNeeded.document.toString())
                    : null;
                return {
                    _id: docNeeded._id,
                    // Use populated data first (current), fallback to stored data (may be stale)
                    title: (populatedDoc === null || populatedDoc === void 0 ? void 0 : populatedDoc.title) || docNeeded.title,
                    category: (populatedDoc === null || populatedDoc === void 0 ? void 0 : populatedDoc.category) || docNeeded.category,
                    privacy: (populatedDoc === null || populatedDoc === void 0 ? void 0 : populatedDoc.privacy) || docNeeded.privacy,
                    documentType: (populatedDoc === null || populatedDoc === void 0 ? void 0 : populatedDoc.documentType) || docNeeded.documentType || null,
                    url: (populatedDoc === null || populatedDoc === void 0 ? void 0 : populatedDoc.url) || docNeeded.url || null,
                    // Status is specific to the offer request, not the document
                    status: docNeeded.status,
                    // Full populated document for reference
                    document: populatedDoc || null,
                };
            });
        }
    }
    return result;
});
const deleteOffer = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.findByIdAndDelete(id);
    return result;
});
const updateOffer = (id, payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield offer_model_1.Offer.findByIdAndUpdate(id, payload, { new: true });
    if (!result)
        return result;
    // Send notifications based on status change
    try {
        const userInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
        const userName = userInfo
            ? `${userInfo.firstName} ${userInfo.lastName}`
            : (userInfo === null || userInfo === void 0 ? void 0 : userInfo.companyName) || 'Someone';
        // Pro accepting/rejecting offer - notify Partner
        if (payload.status === 'accepted' || payload.status === 'rejected') {
            const partner = yield user_model_1.User.findById(result.partner);
            const partnerEmail = partner === null || partner === void 0 ? void 0 : partner.email;
            // Include notes if provided
            const notesText = ((_a = payload.notes) === null || _a === void 0 ? void 0 : _a.length) > 0
                ? `<p><strong>Pro's note:</strong> ${((_b = payload.notes[payload.notes.length - 1]) === null || _b === void 0 ? void 0 : _b.note) || ''}</p>`
                : '';
            const message = `<p>Your offer has been <strong>${payload.status}</strong> by <span style="font-weight: 600; color: ${payload.status === 'accepted' ? '#008000' : '#dc2626'};">${userName}</span>.</p>${notesText}`;
            yield notification_model_1.Notification.create({
                user: result.partner,
                message,
            });
            if (partnerEmail) {
                yield (0, sendMail_1.sendEmail)(partnerEmail, `Offer ${payload.status === 'accepted' ? 'Accepted' : 'Rejected'}`, `<div>${message}<p>Thank you</p></div>`);
            }
        }
        // Partner confirming onboarding - notify Pro
        if (payload.status === 'onboarded') {
            const companyName = (userInfo === null || userInfo === void 0 ? void 0 : userInfo.companyName) || 'The partner';
            const proUser = yield user_model_1.User.findById(result.pro);
            const proEmail = proUser === null || proUser === void 0 ? void 0 : proUser.email;
            const message = `<p>Your response has been onboarded by <span style="font-weight: 600; color: #008000;">${companyName}</span></p>`;
            yield notification_model_1.Notification.create({
                user: result.pro,
                message,
            });
            if (proEmail) {
                yield (0, sendMail_1.sendEmail)(proEmail, 'Offer Confirmed', `<div>${message}<p>Thank you</p></div>`);
            }
        }
    }
    catch (error) {
        console.error('Failed to send notification:', error);
    }
    return result;
});
const updateOfferNotes = (id, payload, user) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield offer_model_1.Offer.findByIdAndUpdate(id, { $push: { notes: payload } }, { new: true });
    if (!result)
        return result;
    // Send notification to the other party
    try {
        const userInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
        const isPartner = user.role === 'partner';
        // Determine recipient and message
        const recipientId = isPartner ? result.pro : result.partner;
        const senderName = isPartner
            ? (userInfo === null || userInfo === void 0 ? void 0 : userInfo.companyName) || 'A partner'
            : `${(userInfo === null || userInfo === void 0 ? void 0 : userInfo.firstName) || ''} ${(userInfo === null || userInfo === void 0 ? void 0 : userInfo.lastName) || ''}`.trim() ||
                'A pro';
        const message = `<p><span style="font-weight: 600; color: #008000;">${senderName}</span> has added a note to your offer.</p>`;
        // Get recipient email
        const recipient = yield user_model_1.User.findById(recipientId);
        const recipientEmail = recipient === null || recipient === void 0 ? void 0 : recipient.email;
        // Create notification
        yield notification_model_1.Notification.create({
            user: recipientId,
            message,
        });
        // Send email
        if (recipientEmail) {
            yield (0, sendMail_1.sendEmail)(recipientEmail, 'New Note on Your Offer', `<div>${message}<p>Thank you</p></div>`);
        }
    }
    catch (error) {
        console.error('Failed to send notification:', error);
    }
    return result;
});
const uploadOfferDocuments = (files, id) => __awaiter(void 0, void 0, void 0, function* () {
    const fileMap = {};
    if (files.length > 0) {
        for (const file of files) {
            const bunnyUrl = yield (0, bunny_upload_1.uploadFile)(file);
            fileMap[file.originalname] = bunnyUrl;
        }
    }
    const offer = yield offer_model_1.Offer.findById(id);
    if (!offer) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Offer not found');
    }
    const documentsNeeded = offer.documentsNeeded;
    const documents = documentsNeeded.map((document) => {
        if (fileMap[document._id]) {
            return Object.assign(Object.assign({}, document), { url: fileMap[document._id], status: 'granted' });
        }
        return document;
    });
    offer.documentsNeeded = documents;
    offer.status = 'responded';
    yield offer.save();
    return offer;
});
// Update status of a specific document in an offer (grant/deny access)
const updateDocumentStatus = (offerId, documentId, status, user) => __awaiter(void 0, void 0, void 0, function* () {
    const offer = yield offer_model_1.Offer.findById(offerId);
    if (!offer) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Offer not found');
    }
    // Find the document in documentsNeeded array and update its status
    const docIndex = offer.documentsNeeded.findIndex((doc) => doc._id.toString() === documentId);
    if (docIndex === -1) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Document not found in offer');
    }
    // Update the document status
    offer.documentsNeeded[docIndex].status = status;
    // Set status to 'responded' immediately when pro takes any action
    if (offer.status === 'pending') {
        offer.status = 'responded';
    }
    yield offer.save();
    // Send notification to partner
    try {
        const proInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
        const proName = proInfo
            ? `${proInfo.firstName} ${proInfo.lastName}`
            : 'The pro';
        const docTitle = offer.documentsNeeded[docIndex].title;
        const partner = yield user_model_1.User.findById(offer.partner);
        const message = status === 'granted'
            ? `<p><span style="font-weight: 600; color: #008000;">${proName}</span> has granted access to "${docTitle}".</p>`
            : `<p><span style="font-weight: 600; color: #dc2626;">${proName}</span> has denied access to "${docTitle}".</p>`;
        yield notification_model_1.Notification.create({
            user: offer.partner,
            message,
        });
        if (partner === null || partner === void 0 ? void 0 : partner.email) {
            yield (0, sendMail_1.sendEmail)(partner.email, status === 'granted'
                ? 'Document Access Granted'
                : 'Document Access Denied', `<div>${message}<p>Thank you</p></div>`);
        }
    }
    catch (error) {
        console.error('Failed to send notification:', error);
    }
    return offer;
});
// Pro responds to offer - handles both file uploads and access status updates atomically
const proRespondToOffer = (offerId, files, statusUpdates, user) => __awaiter(void 0, void 0, void 0, function* () {
    const offer = yield offer_model_1.Offer.findById(offerId);
    if (!offer) {
        throw new ApiError_1.default(http_status_1.default.BAD_REQUEST, 'Offer not found');
    }
    const uploadedDocs = [];
    const grantedDocs = [];
    const deniedDocs = [];
    // 1. Handle file uploads for missing documents
    if (files && files.length > 0) {
        const fileMap = {};
        for (const file of files) {
            const bunnyUrl = yield (0, bunny_upload_1.uploadFile)(file);
            fileMap[file.originalname] = bunnyUrl;
        }
        // Update documents with uploaded files
        offer.documentsNeeded = offer.documentsNeeded.map((doc) => {
            if (fileMap[doc._id.toString()]) {
                uploadedDocs.push(doc.title);
                return Object.assign(Object.assign({}, doc.toObject()), { url: fileMap[doc._id.toString()], status: 'granted' });
            }
            return doc;
        });
    }
    // 2. Handle access status updates for existing documents
    if (statusUpdates && statusUpdates.length > 0) {
        for (const { documentId, status } of statusUpdates) {
            const docIndex = offer.documentsNeeded.findIndex((doc) => doc._id.toString() === documentId);
            if (docIndex !== -1) {
                offer.documentsNeeded[docIndex].status = status;
                const docTitle = offer.documentsNeeded[docIndex].title;
                if (status === 'granted') {
                    grantedDocs.push(docTitle);
                }
                else {
                    deniedDocs.push(docTitle);
                }
            }
        }
    }
    // 3. Update offer status to 'responded'
    if (offer.status === 'pending') {
        offer.status = 'responded';
    }
    // 4. Save all changes atomically
    yield offer.save();
    // 5. Send consolidated notification to partner
    try {
        const proInfo = yield personal_info_model_1.PersonalInfo.findOne({ user: user._id });
        const proName = proInfo
            ? `${proInfo.firstName} ${proInfo.lastName}`
            : 'The pro';
        const partner = yield user_model_1.User.findById(offer.partner);
        // Build notification message
        const actions = [];
        if (uploadedDocs.length > 0) {
            actions.push(`uploaded ${uploadedDocs.length} document(s): ${uploadedDocs.join(', ')}`);
        }
        if (grantedDocs.length > 0) {
            actions.push(`granted access to: ${grantedDocs.join(', ')}`);
        }
        if (deniedDocs.length > 0) {
            actions.push(`denied access to: ${deniedDocs.join(', ')}`);
        }
        if (actions.length > 0) {
            const message = `<p><span style="font-weight: 600; color: #008000;">${proName}</span> has responded to your offer: ${actions.join('; ')}.</p>`;
            yield notification_model_1.Notification.create({
                user: offer.partner,
                message,
            });
            if (partner === null || partner === void 0 ? void 0 : partner.email) {
                yield (0, sendMail_1.sendEmail)(partner.email, 'Pro Responded to Your Offer', `<div>${message}<p>Thank you</p></div>`);
            }
        }
    }
    catch (error) {
        console.error('Failed to send notification:', error);
    }
    return offer;
});
exports.OfferService = {
    createOrUpdateOffer,
    getOffers,
    deleteOffer,
    updateOffer,
    updateOfferNotes,
    uploadOfferDocuments,
    updateDocumentStatus,
    proRespondToOffer,
};
