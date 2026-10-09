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
exports.updateAiSettings = exports.getAiSettings = exports.CredentialAiSettings = void 0;
const mongoose_1 = require("mongoose");
const personal_info_model_1 = require("../user/personal-info.model");
/**
 * How much of the credential review the AI is allowed to do.
 *
 * Two switches, deliberately separate, because they carry very different risk:
 *
 *  - `assistEnabled`  — the AI reads the document and fills the admin's form in.
 *                       A human still presses Confirm. This is what shipped
 *                       first and it is on by default.
 *  - `automationEnabled` — the AI decides. Every credential is read the moment
 *                       it is uploaded and confirmed or marked not confirmed
 *                       without anybody looking at it. Off by default, and it
 *                       needs `assistEnabled` because it is the same reading.
 *
 * Automation never decides a reason flagged `aiSuggestOnly` (currently
 * "Document appears altered") — those always wait for a person. See
 * `AI_SUGGEST_ONLY` in credential-ai.service.ts.
 */
const aiSettingsSchema = new mongoose_1.Schema({
    assistEnabled: { type: Boolean, default: true },
    automationEnabled: { type: Boolean, default: false },
    lastChangedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    lastChangedByName: { type: String },
    lastChangedAt: { type: Date },
    // There is exactly one row. Written as an upsert on this key so two cold
    // starts cannot race a second one into existence.
    singleton: { type: String, default: 'global', unique: true, immutable: true },
}, { timestamps: true });
exports.CredentialAiSettings = (0, mongoose_1.model)('CredentialAiSettings', aiSettingsSchema);
/** Read the single settings row, creating it with the defaults on first use. */
const getAiSettings = () => __awaiter(void 0, void 0, void 0, function* () {
    const existing = yield exports.CredentialAiSettings.findOne({ singleton: 'global' });
    if (existing) {
        return {
            assistEnabled: existing.assistEnabled !== false,
            automationEnabled: existing.automationEnabled === true,
            lastChangedByName: existing.lastChangedByName,
            lastChangedAt: existing.lastChangedAt,
        };
    }
    yield exports.CredentialAiSettings.updateOne({ singleton: 'global' }, { $setOnInsert: { assistEnabled: true, automationEnabled: false } }, { upsert: true });
    return { assistEnabled: true, automationEnabled: false };
});
exports.getAiSettings = getAiSettings;
const displayName = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!userId)
        return 'System';
    const info = yield personal_info_model_1.PersonalInfo.findOne({ user: userId }).select('firstName lastName');
    const person = `${(info === null || info === void 0 ? void 0 : info.firstName) || ''} ${(info === null || info === void 0 ? void 0 : info.lastName) || ''}`.trim();
    return person || 'Admin';
});
const updateAiSettings = (patch, adminId) => __awaiter(void 0, void 0, void 0, function* () {
    const current = yield (0, exports.getAiSettings)();
    const next = {
        assistEnabled: patch.assistEnabled === undefined ? current.assistEnabled : patch.assistEnabled === true,
        automationEnabled: patch.automationEnabled === undefined
            ? current.automationEnabled
            : patch.automationEnabled === true,
    };
    // Automation is the same reading plus a decision, so it cannot run with the
    // reading switched off. Turning automation on turns assist on; turning assist
    // off turns automation off. Enforced here rather than in the UI so the API
    // cannot be left in a state the screen can never show.
    if (next.automationEnabled)
        next.assistEnabled = true;
    if (!next.assistEnabled)
        next.automationEnabled = false;
    yield exports.CredentialAiSettings.updateOne({ singleton: 'global' }, {
        $set: Object.assign(Object.assign({}, next), { lastChangedBy: adminId, lastChangedByName: yield displayName(adminId), lastChangedAt: new Date() }),
    }, { upsert: true });
    return (0, exports.getAiSettings)();
});
exports.updateAiSettings = updateAiSettings;
