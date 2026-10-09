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
exports.autoDecideOnUpload = exports.decideAllForUser = exports.decideCredential = void 0;
const credentials_1 = require("../../../constants/credentials");
const documents_model_1 = require("./documents.model");
const document_service_1 = require("./document.service");
const credential_ai_service_1 = require("./credential-ai.service");
const credential_ai_settings_1 = require("./credential-ai.settings");
const isCredentialSlot = (documentType) => credentials_1.REQUIRED_CREDENTIAL_KEYS.includes(String(documentType));
/**
 * Read one credential and act on what was read.
 *
 * `reviewDocument` refuses to confirm without an issue date and an issuing
 * organisation, and without either an expiry or the no-expiration flag. Rather
 * than let that throw, the cases it would reject are turned into `needs_human`
 * here, so the admin sees "waiting for you" instead of an error.
 */
const decideCredential = (documentId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const doc = yield documents_model_1.Documents.findById(documentId).select('documentType part reviewStatus url');
    const base = {
        documentId,
        documentType: String((doc === null || doc === void 0 ? void 0 : doc.documentType) || ''),
        part: (_a = doc === null || doc === void 0 ? void 0 : doc.part) !== null && _a !== void 0 ? _a : null,
    };
    if (!doc)
        return Object.assign(Object.assign({}, base), { decision: 'skipped', detail: 'Document not found' });
    if (!doc.url)
        return Object.assign(Object.assign({}, base), { decision: 'skipped', detail: 'No file on this document' });
    if (!isCredentialSlot(doc.documentType)) {
        return Object.assign(Object.assign({}, base), { decision: 'skipped', detail: 'Not one of the required credentials' });
    }
    // Never overrule a human, and never re-decide something already decided.
    if (doc.reviewStatus && doc.reviewStatus !== 'pending') {
        return Object.assign(Object.assign({}, base), { decision: 'skipped', detail: 'Already reviewed' });
    }
    let ai;
    try {
        ai = yield (0, credential_ai_service_1.extractCredential)(documentId);
    }
    catch (err) {
        return Object.assign(Object.assign({}, base), { decision: 'failed', detail: (err === null || err === void 0 ? void 0 : err.message) || 'The document could not be read' });
    }
    const confidence = typeof ai.confidence === 'number' ? ai.confidence : null;
    if (ai.needsHuman) {
        return Object.assign(Object.assign({}, base), { decision: 'needs_human', reasonCode: (_b = ai.suggestedReasonCode) !== null && _b !== void 0 ? _b : null, confidence, detail: ai.suggestedReasonCode
                ? 'This reason has to be decided by a person.'
                : 'Nothing looked wrong, but the issue date or the issuing organisation is not on the document.' });
    }
    if (ai.suggestion === 'reject') {
        yield document_service_1.DocumentService.reviewDocument(documentId, {
            reviewStatus: 'rejected',
            rejectionReasonCode: ai.suggestedReasonCode,
            rejectionReason: ai.caregiverMessage,
            requestReplacement: true,
            aiSuggestedReason: ai.suggestedReasonCode,
        });
        return Object.assign(Object.assign({}, base), { decision: 'not_confirmed', reasonCode: ai.suggestedReasonCode, message: ai.caregiverMessage, confidence });
    }
    const f = ai.fields || {};
    if (!f.hasNoExpiration && !f.credentialExpirationDate) {
        return Object.assign(Object.assign({}, base), { decision: 'needs_human', confidence, detail: 'No expiry is printed on the document, so it cannot be confirmed automatically.' });
    }
    yield document_service_1.DocumentService.reviewDocument(documentId, {
        reviewStatus: 'approved',
        credentialIdNumber: f.credentialIdNumber || undefined,
        credentialIssueDate: f.credentialIssueDate,
        credentialExpirationDate: f.hasNoExpiration ? undefined : f.credentialExpirationDate,
        issuingOrganization: f.issuingOrganization,
        hasNoExpiration: f.hasNoExpiration === true,
        aiSuggestedReason: null,
    });
    // Recorded on the document so an audit can tell a confirmation nobody looked
    // at from one an admin pressed.
    yield documents_model_1.Documents.findByIdAndUpdate(documentId, {
        $set: { 'aiExtraction.autoDecided': true, 'aiExtraction.autoDecidedAt': new Date() },
    });
    return Object.assign(Object.assign({}, base), { decision: 'confirmed', confidence });
});
exports.decideCredential = decideCredential;
/**
 * Sweep every required credential of one caregiver. Used by the admin's
 * "Run AI check" button, which is why it reports on skipped documents too —
 * the admin needs to see that nothing was silently passed over.
 */
const decideAllForUser = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(0, credential_ai_service_1.isCredentialAiConfigured)()) {
        return {
            ran: false,
            reason: 'Automatic reading is not configured on this environment',
            results: [],
        };
    }
    const docs = yield documents_model_1.Documents.find({
        user: userId,
        documentType: { $in: credentials_1.REQUIRED_CREDENTIAL_KEYS },
    })
        .select('_id documentType part reviewStatus createdAt')
        .sort({ createdAt: 1 });
    const results = [];
    // Deliberately sequential. Each read is an upload to the model, and a
    // caregiver has at most six credentials — firing them together buys a second
    // or two and risks rate limiting the account for every other admin.
    for (const d of docs) {
        results.push(yield (0, exports.decideCredential)(String(d._id)));
    }
    const count = (decision) => results.filter((r) => r.decision === decision).length;
    return {
        ran: true,
        results,
        summary: {
            confirmed: count('confirmed'),
            notConfirmed: count('not_confirmed'),
            needsHuman: count('needs_human'),
            skipped: count('skipped'),
            failed: count('failed'),
        },
    };
});
exports.decideAllForUser = decideAllForUser;
/**
 * Called after a caregiver uploads a credential. Does nothing unless an admin
 * has switched AI automation on, and never throws — a failure here must not
 * fail the upload the caregiver just made.
 */
const autoDecideOnUpload = (documentId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!documentId)
        return;
    try {
        if (!(0, credential_ai_service_1.isCredentialAiConfigured)())
            return;
        const settings = yield (0, credential_ai_settings_1.getAiSettings)();
        if (!settings.automationEnabled)
            return;
        yield (0, exports.decideCredential)(documentId);
    }
    catch (err) {
        console.error('[credential-ai] auto decision failed:', err === null || err === void 0 ? void 0 : err.message);
    }
});
exports.autoDecideOnUpload = autoDecideOnUpload;
