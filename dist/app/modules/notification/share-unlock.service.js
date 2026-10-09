"use strict";
/**
 * SCRUM-133: when a caregiver's share link is unlocked, and telling them the
 * moment it happens.
 *
 * ONE RULE. The caregiver's own share card (frontend share-profile-gate.tsx
 * #getShareGate), the public /p/<shareId> lookup (user.service
 * #getUserByShareId) and the "your link is ready" alert below all ask the same
 * question, so they read the same answer. When they disagreed, the card said
 * "Agencies can see your profile only after all 5 credentials are verified"
 * while the public link opened for a caregiver with 0 of 5.
 *
 * A required credential counts only while it is Confirmed: approved by an
 * admin and not past its expiration date. One marked "no expiration", or with
 * no date on file, never lapses. Expired or rejected keeps the link shut, the
 * same as the Expired / Rejected pills on the credential cards (SCRUM-136).
 *
 * THE ALERT. The In-review card promises "We'll email you the moment your link
 * is ready", and nothing did: approving the fifth credential sent no email and
 * no in-app notice, so the caregiver had to keep checking the page. It fires
 * from the admin's approval (document.service#reviewDocument) only on the
 * approval that takes the caregiver from locked to unlocked. Re-approving a
 * credential on an already-unlocked profile sends nothing, and it is sent at
 * most once per caregiver.
 */
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
exports.getShareGateSummary = exports.isCredentialConfirmed = void 0;
const credentialExpiry_1 = require("../../../helpers/credentialExpiry");
const documents_model_1 = require("../document/documents.model");
const credentials_1 = require("../../../constants/credentials");
/** Is this credential document Confirmed right now? */
const isCredentialConfirmed = (doc, now = Date.now()) => {
    if (!doc || doc.reviewStatus !== 'approved')
        return false;
    if (doc.hasNoExpiration || !doc.credentialExpirationDate)
        return true;
    // SCRUM-169: the same expiry instant as the cards and the emails.
    const expiresAt = (0, credentialExpiry_1.credentialExpiresAt)(doc.credentialExpirationDate);
    // An unreadable date is treated as "no date on file", as the card does.
    return Number.isNaN(expiresAt) || expiresAt > now;
};
exports.isCredentialConfirmed = isCredentialConfirmed;
const getShareGateSummary = (caregiverId) => __awaiter(void 0, void 0, void 0, function* () {
    // SCRUM-176: oldest first, stated rather than assumed. The map below keeps
    // the LAST row of each type, and this query carried no sort, so the row that
    // decided the share gate was whatever order the database returned. createdAt
    // ascending is exactly that effective order today — no gate verdict moves,
    // it is simply no longer left to chance.
    const documents = yield documents_model_1.Documents.find({ user: caregiverId })
        .sort({ createdAt: 1 })
        .lean();
    // The caregiver's card keys credentials by type and keeps the LAST row of
    // each (app/actions.ts#getCredentialStatus on the frontend), so do the same.
    // Taking the first row would disagree with the card whenever a caregiver has
    // an older duplicate of a credential.
    //
    // SCRUM-165: the RN/LPN practical sign-off is a second 'certifications' row
    // and is not one of the five. Left in, whichever of the two sorted last
    // decided "PCA Certificate": an approved sign-off opened the public link with
    // the written exam still pending, and a pending one kept a verified PCA shut.
    // Only the primary row is mapped, the same as the card, so the written exam
    // (or legacy certificate) alone decides it and the sign-off never unlocks or
    // locks anything.
    const byType = {};
    documents.forEach((d) => {
        if ((0, credentials_1.isPrimaryCredentialRow)(d))
            byType[d.documentType] = d;
    });
    const now = Date.now();
    const items = credentials_1.REQUIRED_CREDENTIAL_KEYS.map((key) => {
        const document = byType[key] || null;
        return { key, document, verified: (0, exports.isCredentialConfirmed)(document, now) };
    });
    const verified = items.filter((i) => i.verified).length;
    const total = credentials_1.REQUIRED_CREDENTIAL_KEYS.length;
    return { items, verified, total, unlocked: verified === total };
});
exports.getShareGateSummary = getShareGateSummary;
