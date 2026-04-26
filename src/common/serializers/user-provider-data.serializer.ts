import { TaskStatus } from '../prisma-enums';
import { asSqliteJsonRecord } from '../utils/sqlite-json.util';

type UserFacingTaskLike = {
  provider: string;
  status: string;
  providerData: unknown | null;
};

type MjButton = {
  customId: string;
  emoji?: string;
  label?: string;
  type?: number;
};

const USER_PROVIDER_DATA_ALLOWLIST = new Set([
  'midjourney',
  'mj',
]);

function toObject(value: unknown): Record<string, unknown> | null {
  return asSqliteJsonRecord(value);
}

function sanitizeMidjourneyProviderData(providerData: unknown): { buttons: MjButton[] } | undefined {
  const source = toObject(providerData);
  const rawButtons = source?.buttons;
  if (!Array.isArray(rawButtons)) return undefined;

  const buttons = rawButtons
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const raw = item as Record<string, unknown>;
      if (typeof raw.customId !== 'string' || !raw.customId.trim()) return null;

      const button: MjButton = {
        customId: raw.customId,
      };

      if (typeof raw.emoji === 'string' && raw.emoji.trim()) button.emoji = raw.emoji;
      if (typeof raw.label === 'string' && raw.label.trim()) button.label = raw.label;
      if (typeof raw.type === 'number') button.type = raw.type;

      return button;
    })
    .filter((item): item is MjButton => item !== null);

  if (buttons.length === 0) return undefined;
  return { buttons };
}

export function serializeUserFacingProviderData(task: UserFacingTaskLike): Record<string, unknown> | undefined {
  if (task.status === TaskStatus.failed) return undefined;
  if (!USER_PROVIDER_DATA_ALLOWLIST.has(task.provider)) return undefined;

  if (task.provider === 'midjourney' || task.provider === 'mj') {
    return sanitizeMidjourneyProviderData(task.providerData);
  }

  return undefined;
}
