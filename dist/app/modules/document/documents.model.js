"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Documents = void 0;
/* eslint-disable @typescript-eslint/no-this-alias */
const mongoose_1 = require("mongoose");
const DocumentsSchema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    category: {
        type: String,
    },
    documentType: {
        type: String,
    },
    title: {
        type: String,
    },
    // SCRUM-177: the caregiver no longer chooses public/private on upload, so
    // every document is stored visible. The field itself stays — the offer flow
    // and the document cards still read it — but 'private' is no longer written
    // by any path, and the default flips so a row created without one is
    // visible rather than hidden. Existing 'private' rows are moved over by
    // scripts/migrate-document-privacy.ts.
    privacy: {
        type: String,
        enum: ['public', 'private'],
        default: 'public',
    },
    url: {
        type: String,
    },
    // Byte size of the uploaded file, so the document card can show "( 2.1 MB )".
    fileSize: {
        type: Number,
    },
    consent: {
        type: Boolean,
    },
    // SCRUM-177 (Scenario 3): the consent record for a medical document. Kept
    // on the row itself, the same way this codebase keeps its other per-document
    // audit data (reviewedAt / reviewedBy / wevoroCredentialId) — the caregiver
    // is the row's `user`, the document is the row, and these three say when
    // consent was given, by whom, and against which wording. `consentVersion`
    // is the wording version the caregiver actually agreed to, so a later
    // rewording cannot be read back onto an old consent.
    consentAt: { type: Date },
    consentBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    consentVersion: { type: String },
    reviewStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    reviewedAt: {
        type: Date,
    },
    credentialIdNumber: { type: String },
    credentialIssueDate: { type: Date },
    credentialExpirationDate: { type: Date },
    issuingOrganization: { type: String },
    rejectionReason: { type: String },
    // SCRUM-109 platform gap: some credentials legitimately have no expiry
    // (PCA written exam / practical sign-off, GCHEXS). Previously an expiration
    // date was hard-required to confirm anything, so admins invented dates.
    // This flag is the explicit "Reviewed, no fixed renewal" state.
    hasNoExpiration: { type: Boolean, default: false },
    // SCRUM-109 / SCRUM-110: the caregiver's own credential ID from the
    // provider is `credentialIdNumber`. This is WeVoro's own generated ID,
    // issued at confirmation, so agencies get a verifiable trail.
    wevoroCredentialId: { type: String, index: true },
    // SCRUM-110: PCA is one credential made of two documents. `parentDocument`
    // links the RN/LPN practical sign-off to the written exam; `part` says
    // which half this document is.
    parentDocument: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Documents' },
    part: {
        type: String,
        enum: ['written_exam', 'practical_signoff'],
    },
    // SCRUM-109: TB test is an anchor record with linked ANNUAL SCREENINGS.
    // A screening is its own document row pointing at the initial test via
    // `parentDocument`, flagged here and carrying who signed it.
    isAnnualScreening: { type: Boolean, default: false },
    screeningDate: { type: Date },
    screeningSignedBy: { type: String },
    // SCRUM-109: structured rejection reason.
    // rejectionReason (above) stays the caregiver-facing message; this is the
    // category behind it, so reasons can be reported on and measured.
    rejectionReasonCode: {
        type: String,
        enum: [
            'unreadable',
            'expired',
            'information_missing',
            'name_mismatch',
            'wrong_document_type',
            'issuer_not_confirmed',
            'does_not_meet_requirement',
            'appears_altered',
            'other',
        ],
    },
    /** Admin asked the caregiver to upload a replacement. */
    replacementRequested: { type: Boolean, default: false },
    // SCRUM-109 accuracy logging: what the AI suggested vs what the admin
    // decided, so each reason category can be measured before it is trusted
    // with any more automation.
    aiSuggestedReason: { type: String },
    adminAgreedWithAi: { type: Boolean },
    // What the AI read off the file: the four fields it pre-fills for the
    // admin, plus the problems it noticed and the suggestion it made. Stored
    // (not just returned) so the admin sees the same reading when the modal is
    // reopened, and so a decision can be compared with what was suggested.
    // Schema-less on purpose — it is a record of one model answer, not data any
    // query filters on.
    aiExtraction: { type: mongoose_1.Schema.Types.Mixed },
    reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
}, {
    timestamps: true,
});
exports.Documents = (0, mongoose_1.model)('Documents', DocumentsSchema);
