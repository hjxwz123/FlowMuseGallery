import { TaskStatus } from '../prisma-enums';

import { normalizeProviderKey } from './provider.util';

function normalizeRemoteModel(modelKey?: string | null) {
  return String(modelKey ?? '').trim().toLowerCase();
}

function isWanxVideoProvider(provider: string) {
  return normalizeProviderKey(provider) === 'wanx';
}

function isSeedanceVideoProvider(provider: string) {
  const normalized = normalizeProviderKey(provider);
  return (
    normalized.includes('doubao') ||
    normalized.includes('ark') ||
    normalized.includes('bytedance')
  );
}

export function supportsVideoTaskCancel(provider: string, modelKey?: string | null) {
  if (isWanxVideoProvider(provider)) return true;
  if (!isSeedanceVideoProvider(provider)) return false;
  return normalizeRemoteModel(modelKey).includes('seedance');
}

export function canCancelVideoTask(
  status: TaskStatus | string,
  provider: string,
  modelKey?: string | null,
) {
  return status === TaskStatus.pending && supportsVideoTaskCancel(provider, modelKey);
}
