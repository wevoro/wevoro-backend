import { Schema, model } from 'mongoose';
import { PersonalInfo } from '../user/personal-info.model';

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
const aiSettingsSchema = new Schema<any>(
  {
    assistEnabled: { type: Boolean, default: true },
    automationEnabled: { type: Boolean, default: false },
    lastChangedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lastChangedByName: { type: String },
    lastChangedAt: { type: Date },
    // There is exactly one row. Written as an upsert on this key so two cold
    // starts cannot race a second one into existence.
    singleton: { type: String, default: 'global', unique: true, immutable: true },
  },
  { timestamps: true }
);

export const CredentialAiSettings = model<any>(
  'CredentialAiSettings',
  aiSettingsSchema
);

export interface AiSettings {
  assistEnabled: boolean;
  automationEnabled: boolean;
  lastChangedByName?: string;
  lastChangedAt?: Date;
}

/** Read the single settings row, creating it with the defaults on first use. */
export const getAiSettings = async (): Promise<AiSettings> => {
  const existing = await CredentialAiSettings.findOne({ singleton: 'global' });
  if (existing) {
    return {
      assistEnabled: existing.assistEnabled !== false,
      automationEnabled: existing.automationEnabled === true,
      lastChangedByName: existing.lastChangedByName,
      lastChangedAt: existing.lastChangedAt,
    };
  }

  await CredentialAiSettings.updateOne(
    { singleton: 'global' },
    { $setOnInsert: { assistEnabled: true, automationEnabled: false } },
    { upsert: true }
  );
  return { assistEnabled: true, automationEnabled: false };
};

const displayName = async (userId?: string): Promise<string> => {
  if (!userId) return 'System';
  const info = await PersonalInfo.findOne({ user: userId }).select(
    'firstName lastName'
  );
  const person = `${info?.firstName || ''} ${info?.lastName || ''}`.trim();
  return person || 'Admin';
};

export const updateAiSettings = async (
  patch: { assistEnabled?: boolean; automationEnabled?: boolean },
  adminId?: string
): Promise<AiSettings> => {
  const current = await getAiSettings();

  const next = {
    assistEnabled:
      patch.assistEnabled === undefined ? current.assistEnabled : patch.assistEnabled === true,
    automationEnabled:
      patch.automationEnabled === undefined
        ? current.automationEnabled
        : patch.automationEnabled === true,
  };

  // Automation is the same reading plus a decision, so it cannot run with the
  // reading switched off. Turning automation on turns assist on; turning assist
  // off turns automation off. Enforced here rather than in the UI so the API
  // cannot be left in a state the screen can never show.
  if (next.automationEnabled) next.assistEnabled = true;
  if (!next.assistEnabled) next.automationEnabled = false;

  await CredentialAiSettings.updateOne(
    { singleton: 'global' },
    {
      $set: {
        ...next,
        lastChangedBy: adminId,
        lastChangedByName: await displayName(adminId),
        lastChangedAt: new Date(),
      },
    },
    { upsert: true }
  );

  return getAiSettings();
};
