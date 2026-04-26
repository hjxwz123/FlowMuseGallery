import { ImageTask, VideoTask } from '@prisma/client';
import { asSqliteJsonRecord } from '../utils/sqlite-json.util';

import { serializeUserFacingProviderData } from './user-provider-data.serializer';

export type ApiTaskType = 'image' | 'video';

export type ApiTask = {
  type: ApiTaskType;
  id: string;
  userId: string;
  modelId: string;
  channelId: string;
  projectId: string | null;
  taskNo: string;
  provider: string;
  providerTaskId: string | null;
  prompt: string;
  negativePrompt: string | null;
  parameters: Record<string, unknown> | null;
  providerData?: unknown | null;
  status: ImageTask['status'];
  resultUrl: string | null;
  thumbnailUrl: string | null;
  storageKey: string | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  canCancel?: boolean;
  cancelSupported?: boolean;
};

// 精简版任务类型（用于列表接口，不包含 parameters 大字段；仅对少数需要前台继续操作的模型保留 providerData）
export type ApiTaskLite = Omit<ApiTask, 'parameters'>;

function toJsonObject(value: unknown): Record<string, unknown> | null {
  return asSqliteJsonRecord(value);
}

export function serializeImageTask(task: ImageTask): ApiTask {
  const providerData = serializeUserFacingProviderData(task);
  return {
    type: 'image',
    id: task.id.toString(),
    userId: task.userId.toString(),
    modelId: task.modelId.toString(),
    channelId: task.channelId.toString(),
    projectId: (task as any).projectId?.toString() ?? null,
    taskNo: task.taskNo,
    provider: task.provider,
    providerTaskId: task.providerTaskId ?? null,
    prompt: task.prompt,
    negativePrompt: task.negativePrompt ?? null,
    parameters: toJsonObject(task.parameters),
    ...(providerData !== undefined ? { providerData } : {}),
    status: task.status,
    resultUrl: task.resultUrl ?? null,
    thumbnailUrl: task.thumbnailUrl ?? null,
    storageKey: task.storageKey ?? null,
    errorMessage: task.errorMessage ?? null,
    retryCount: task.retryCount,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    deletedAt: (task as any).deletedAt ?? null,
    createdAt: task.createdAt,
  };
}

export function serializeVideoTask(
  task: VideoTask,
  options?: { canCancel?: boolean; cancelSupported?: boolean },
): ApiTask {
  const providerData = serializeUserFacingProviderData(task);
  return {
    type: 'video',
    id: task.id.toString(),
    userId: task.userId.toString(),
    modelId: task.modelId.toString(),
    channelId: task.channelId.toString(),
    projectId: (task as any).projectId?.toString() ?? null,
    taskNo: task.taskNo,
    provider: task.provider,
    providerTaskId: task.providerTaskId ?? null,
    prompt: task.prompt,
    negativePrompt: null,
    parameters: toJsonObject(task.parameters),
    ...(providerData !== undefined ? { providerData } : {}),
    status: task.status,
    resultUrl: task.resultUrl ?? null,
    thumbnailUrl: task.thumbnailUrl ?? null,
    storageKey: task.storageKey ?? null,
    errorMessage: task.errorMessage ?? null,
    retryCount: task.retryCount,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    deletedAt: null,
    createdAt: task.createdAt,
    ...(options?.canCancel !== undefined ? { canCancel: options.canCancel } : {}),
    ...(options?.cancelSupported !== undefined ? { cancelSupported: options.cancelSupported } : {}),
  };
}

// 精简版序列化器（用于列表接口）
export function serializeImageTaskLite(task: ImageTask): ApiTaskLite {
  const providerData = serializeUserFacingProviderData(task);
  return {
    type: 'image',
    id: task.id.toString(),
    userId: task.userId.toString(),
    modelId: task.modelId.toString(),
    channelId: task.channelId.toString(),
    projectId: (task as any).projectId?.toString() ?? null,
    taskNo: task.taskNo,
    provider: task.provider,
    providerTaskId: task.providerTaskId ?? null,
    prompt: task.prompt,
    negativePrompt: task.negativePrompt ?? null,
    ...(providerData !== undefined ? { providerData } : {}),
    status: task.status,
    resultUrl: task.resultUrl ?? null,
    thumbnailUrl: task.thumbnailUrl ?? null,
    storageKey: task.storageKey ?? null,
    errorMessage: task.errorMessage ?? null,
    retryCount: task.retryCount,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    deletedAt: (task as any).deletedAt ?? null,
    createdAt: task.createdAt,
  };
}

export function serializeVideoTaskLite(task: VideoTask): ApiTaskLite {
  const providerData = serializeUserFacingProviderData(task);
  return {
    type: 'video',
    id: task.id.toString(),
    userId: task.userId.toString(),
    modelId: task.modelId.toString(),
    channelId: task.channelId.toString(),
    projectId: (task as any).projectId?.toString() ?? null,
    taskNo: task.taskNo,
    provider: task.provider,
    providerTaskId: task.providerTaskId ?? null,
    prompt: task.prompt,
    negativePrompt: null,
    ...(providerData !== undefined ? { providerData } : {}),
    status: task.status,
    resultUrl: task.resultUrl ?? null,
    thumbnailUrl: task.thumbnailUrl ?? null,
    storageKey: task.storageKey ?? null,
    errorMessage: task.errorMessage ?? null,
    retryCount: task.retryCount,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    deletedAt: null,
    createdAt: task.createdAt,
  };
}
