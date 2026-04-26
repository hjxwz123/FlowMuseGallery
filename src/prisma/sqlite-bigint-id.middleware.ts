import { PrismaClient } from '@prisma/client';

const SQLITE_BIGINT_ID_MODELS = new Set([
  'User',
  'ApiChannel',
  'AiModel',
  'ModelProvider',
  'ImageTask',
  'VideoTask',
  'Project',
  'ProjectAsset',
  'ProjectInspiration',
  'ProjectPrompt',
  'SystemConfig',
  'ChatConversation',
  'ChatMessage',
  'ChatFile',
]);

let lastTimestamp = 0n;
let sequence = 0n;

export function createSqliteBigIntId() {
  const timestamp = BigInt(Date.now());

  if (timestamp === lastTimestamp) {
    sequence += 1n;
  } else {
    lastTimestamp = timestamp;
    sequence = 0n;
  }

  return timestamp * 4096n + sequence;
}

function hasIdField(value: unknown): value is { id?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fillMissingId(data: unknown) {
  if (!hasIdField(data)) return;
  if (data.id !== undefined && data.id !== null) return;
  data.id = createSqliteBigIntId();
}

export function installSqliteBigIntIdMiddleware(client: PrismaClient) {
  client.$use(async (params, next) => {
    if (!params.model || !SQLITE_BIGINT_ID_MODELS.has(params.model)) {
      return next(params);
    }

    if (params.action === 'create') {
      fillMissingId(params.args?.data);
    }

    if (params.action === 'upsert') {
      fillMissingId(params.args?.create);
    }

    return next(params);
  });
}
