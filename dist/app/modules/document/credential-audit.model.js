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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logCredentialAction = exports.CredentialAudit = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
/**
 * SCRUM-178: Credential Audit Trail
 *
 * Update Verification (a re-upload over a confirmed credential) and Remove both
 * destroy the state an agency relied on, so both have to leave a record.
 *
 * SCRUM-67's DownloadAudit is the precedent for how this codebase logs an
 * auditable action: a row of its own, written from the service that performs
 * the action, best-effort so a logging failure never fails the action. These
 * two cannot go INTO DownloadAudit — every row there requires an `agency` and a
 * `downloadType`, and credentialing.service aggregates that whole collection as
 * "latest download per agency", so a caregiver's re-upload written there would
 * read back as an agency download. Same shape and same pattern, separate
 * collection.
 *
 * Deliberately no read route and no admin screen: SCRUM-178 asks for the two
 * actions to be logged, nothing more.
 */
const CredentialAuditSchema = new mongoose_1.Schema({
    caregiver: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    /** Who performed it — the caregiver themselves, or an admin acting for them. */
    actor: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    action: {
        type: String,
        enum: ['update_verification', 'remove'],
        required: true,
    },
    documentId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Documents',
    },
    documentTitle: { type: String },
    documentType: { type: String },
    /** SCRUM-165: which half of the PCA certificate, when the row is one. */
    part: { type: String },
    /** The review state the document was in before the action. */
    previousReviewStatus: { type: String },
}, {
    timestamps: true,
});
exports.CredentialAudit = (0, mongoose_1.model)('CredentialAudit', CredentialAuditSchema);
/**
 * Write one audit row. Best-effort, exactly as SCRUM-87's notification hook in
 * download.service is: losing the log must never fail the caregiver's action.
 */
const logCredentialAction = (params) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        yield exports.CredentialAudit.create({
            caregiver: params.caregiverId,
            actor: params.actorId,
            action: params.action,
            documentId: (_a = params.document) === null || _a === void 0 ? void 0 : _a._id,
            documentTitle: (_b = params.document) === null || _b === void 0 ? void 0 : _b.title,
            documentType: (_c = params.document) === null || _c === void 0 ? void 0 : _c.documentType,
            part: (_d = params.document) === null || _d === void 0 ? void 0 : _d.part,
            previousReviewStatus: (_e = params.document) === null || _e === void 0 ? void 0 : _e.reviewStatus,
        });
    }
    catch (err) {
        console.error('Failed to write credential audit row:', err);
    }
});
exports.logCredentialAction = logCredentialAction;
