import { Injectable, Logger } from '@nestjs/common';
import { ApiChannel, ImageTask, VideoTask } from '@prisma/client';

import { AdapterFactory } from '../adapters/adapter.factory';
import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse } from '../adapters/base/base-image.adapter';
import { BaseVideoAdapter, VideoGenerateParams } from '../adapters/base/base-video.adapter';
import { mergeTaskProviderData } from '../common/utils/task-provider-data.util';
import { asSqliteJsonRecord, toSqliteJson } from '../common/utils/sqlite-json.util';
import { AiModelType, ApiChannelStatus, TaskStatus } from '../common/prisma-enums';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { isFixedMediaModelId } from '../models/fixed-media-models';

type LocalJobState = 'waiting' | 'processing' | 'completed' | 'failed' | 'cancelled';

type TaskStateSnapshot = {
  status: string;
  errorMessage: string | null;
  resultUrl: string | null;
  providerData: unknown;
  providerTaskId: string | null;
  startedAt: Date | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactTaskErrorMessage(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function isSeedanceVideoModel(model: { provider: string; modelKey?: string | null }) {
  const provider = String(model.provider ?? '').toLowerCase();
  const modelKey = String(model.modelKey ?? '').toLowerCase();
  return modelKey.includes('seedance') || provider.includes('seedance');
}

function extractTaskErrorMessage(error: any) {
  const response = asRecord(error?.response);
  const data = response.data;
  const status = typeof response.status === 'number' ? response.status : null;
  const statusText = asNonEmptyString(response.statusText);

  const dataRecord = asRecord(data);
  const errorRecord = asRecord(dataRecord.error);
  const outputRecord = asRecord(dataRecord.output);

  const upstreamMessage =
    asNonEmptyString(errorRecord.message) ??
    asNonEmptyString(dataRecord.message) ??
    asNonEmptyString(dataRecord.detail) ??
    asNonEmptyString(dataRecord.failReason) ??
    asNonEmptyString(outputRecord.message) ??
    asNonEmptyString(errorRecord.code) ??
    asNonEmptyString(outputRecord.code) ??
    (typeof data === 'string' ? asNonEmptyString(data) : null);

  if (upstreamMessage) {
    const suffix = status ? ` (HTTP ${status}${statusText ? ` ${statusText}` : ''})` : '';
    return compactTaskErrorMessage(`${upstreamMessage}${suffix}`);
  }

  const localMessage = asNonEmptyString(error?.message);
  if (localMessage) return compactTaskErrorMessage(localMessage);

  if (status) {
    return compactTaskErrorMessage(`Upstream request failed (HTTP ${status}${statusText ? ` ${statusText}` : ''})`);
  }

  return 'Task failed';
}

@Injectable()
export class LocalTaskRunnerService {
  private readonly logger = new Logger(LocalTaskRunnerService.name);
  private readonly imageJobs = new Map<string, LocalJobState>();
  private readonly videoJobs = new Map<string, LocalJobState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly storage: StorageService,
    private readonly projects: ProjectsService,
  ) {}

  async enqueueImage(taskId: bigint | string, retryCount?: number) {
    const key = this.buildJobKey(taskId, retryCount);
    if (this.imageJobs.get(key) === 'waiting' || this.imageJobs.get(key) === 'processing') return;
    this.imageJobs.set(key, 'waiting');
    void this.runImageTask(BigInt(taskId.toString()), key);
  }

  async enqueueVideo(taskId: bigint | string, retryCount?: number) {
    const key = this.buildJobKey(taskId, retryCount);
    if (this.videoJobs.get(key) === 'waiting' || this.videoJobs.get(key) === 'processing') return;
    this.videoJobs.set(key, 'waiting');
    void this.runVideoTask(BigInt(taskId.toString()), key);
  }

  async removeVideo(taskId: bigint | string, retryCount?: number) {
    const key = this.buildJobKey(taskId, retryCount);
    if (this.videoJobs.get(key) === 'waiting') {
      this.videoJobs.set(key, 'cancelled');
    }
  }

  async getVideoState(taskId: bigint | string, retryCount?: number) {
    const state = this.videoJobs.get(this.buildJobKey(taskId, retryCount));
    if (!state) return null;
    if (state === 'cancelled') return 'failed';
    return state;
  }

  private buildJobKey(taskId: bigint | string, retryCount?: number) {
    return `${taskId.toString()}-${retryCount ?? 0}`;
  }

  private asJsonRecord(value: unknown): Record<string, unknown> {
    return asSqliteJsonRecord(value) ?? {};
  }

  private decryptChannel(channel: ApiChannel) {
    return {
      ...channel,
      apiKey: this.encryption.decryptString(channel.apiKey),
      apiSecret: this.encryption.decryptString(channel.apiSecret),
      extraHeaders: this.asJsonRecord(channel.extraHeaders),
    };
  }

  private assertRunnableChannel(channel: ApiChannel) {
    if (channel.status !== ApiChannelStatus.active || !channel.baseUrl.trim() || !channel.apiKey) {
      throw new Error(`请先配置 ${channel.name} 渠道的 Base URL 和 API Key`);
    }
  }

  private assertRunnableMediaModel(
    model: { id: bigint; type: string; isActive: boolean },
    expectedType: typeof AiModelType.image | typeof AiModelType.video,
  ) {
    if (!isFixedMediaModelId(model.id)) {
      throw new Error('个人版只支持内置固定媒体模型');
    }
    if (!model.isActive) {
      throw new Error('Model disabled');
    }
    if (model.type !== expectedType) {
      throw new Error(`Model is not ${expectedType} type`);
    }
  }

  private async runImageTask(taskId: bigint, key: string) {
    if (this.imageJobs.get(key) === 'cancelled') return;
    this.imageJobs.set(key, 'processing');
    try {
      await this.processImageTask(taskId);
      this.imageJobs.set(key, 'completed');
    } catch (error: any) {
      this.imageJobs.set(key, 'failed');
      this.logger.error(`Local image task failed: ${taskId.toString()}`, error?.stack ?? error);
      await this.safeFailImageTask(taskId, extractTaskErrorMessage(error));
    }
  }

  private async runVideoTask(taskId: bigint, key: string) {
    if (this.videoJobs.get(key) === 'cancelled') return;
    this.videoJobs.set(key, 'processing');
    try {
      await this.processVideoTask(taskId);
      this.videoJobs.set(key, 'completed');
    } catch (error: any) {
      this.videoJobs.set(key, 'failed');
      this.logger.error(`Local video task failed: ${taskId.toString()}`, error?.stack ?? error);
      await this.safeFailVideoTask(taskId, extractTaskErrorMessage(error));
    }
  }

  private async processImageTask(taskId: bigint) {
    const task = await this.prisma.imageTask.findUnique({ where: { id: taskId } });
    if (!task || task.status === TaskStatus.completed || task.status === TaskStatus.failed) return;

    const model = await this.prisma.aiModel.findUnique({ where: { id: task.modelId } });
    if (!model) throw new Error('Model not found');
    const channel = await this.prisma.apiChannel.findUnique({ where: { id: task.channelId } });
    if (!channel) throw new Error('Channel not found');
    this.assertRunnableMediaModel(model, AiModelType.image);
    this.assertRunnableChannel(channel);

    const adapter = AdapterFactory.createImageAdapter(model.provider, this.decryptChannel(channel) as any);
    const params = await this.buildImageTaskParams(task, model);
    const validation = adapter.validateParams(params);
    if (!validation.valid) {
      await this.markImageFailed(taskId, validation.errors?.join(', ') ?? 'Invalid params');
      return;
    }

    const providerTaskId =
      task.providerTaskId && task.status === TaskStatus.processing
        ? task.providerTaskId
        : await adapter.submitTask(params);

    if (providerTaskId.startsWith('url:') || providerTaskId.startsWith('inline:')) {
      await this.markImageProcessing(taskId, task, null);
      const status = await adapter.queryTaskStatus(providerTaskId);
      const output = status.resultUrls?.[0] ?? providerTaskId.slice(providerTaskId.indexOf(':') + 1);
      if (!output) {
        await this.markImageFailed(taskId, 'Missing result', status.providerData);
        return;
      }
      const stored = await this.storage.saveImageResult(output, task.taskNo);
      await this.markImageCompleted(task, taskId, stored.original.url, stored.thumbnail.url, stored.original.storageKey, status.providerData);
      return;
    }

    await this.markImageProcessing(taskId, task, providerTaskId);
    await this.pollImageTask(task, taskId, adapter, providerTaskId);
  }

  private async buildImageTaskParams(task: ImageTask, model: { defaultParams: unknown; modelKey: string }) {
    const params: ImageGenerateParams = {
      ...this.asJsonRecord(model.defaultParams),
      ...this.asJsonRecord(task.parameters),
      prompt: task.prompt,
      negativePrompt: task.negativePrompt ?? undefined,
    };

    if (model.modelKey && !(params as Record<string, unknown>).model) {
      (params as Record<string, unknown>).model = model.modelKey;
    }

    (params as Record<string, unknown>).state = (params as Record<string, unknown>).state ?? `task:${task.id.toString()}`;
    return this.storage.normalizeImageGenerateParams(params);
  }

  private async pollImageTask(
    task: ImageTask,
    taskId: bigint,
    adapter: BaseImageAdapter,
    providerTaskId: string,
  ) {
    let delayMs = 5_000;
    const deadline = Date.now() + 10 * 60_000;

    while (Date.now() < deadline) {
      await sleep(delayMs);
      delayMs = Math.min(45_000, Math.ceil(delayMs * 1.8));

      const latestState = await this.getImageTaskState(taskId);
      if (!latestState) return;
      if (latestState.status === TaskStatus.completed && latestState.resultUrl) return;
      if (latestState.status === TaskStatus.failed) return;

      const status = await adapter.queryTaskStatus(providerTaskId);
      const providerData = mergeTaskProviderData(latestState.providerData, status.providerData);

      if (status.status === TaskStatus.completed) {
        const resultUrls = status.resultUrls?.length
          ? status.resultUrls
          : await adapter.getTaskResult(providerTaskId);
        const output = resultUrls?.[0];
        if (!output) {
          await this.markImageFailed(taskId, 'Missing result', providerData);
          return;
        }
        const stored = await this.storage.saveImageResult(output, task.taskNo);
        await this.markImageCompleted(task, taskId, stored.original.url, stored.thumbnail.url, stored.original.storageKey, providerData);
        return;
      }

      if (status.status === TaskStatus.failed) {
        await this.markImageFailed(taskId, status.errorMessage ?? 'Task failed', providerData);
        return;
      }

      await this.updateImageProviderData(taskId, providerData);
    }

    await this.markImageFailed(taskId, 'Task timeout');
  }

  private async processVideoTask(taskId: bigint) {
    const task = await this.prisma.videoTask.findUnique({ where: { id: taskId } });
    if (!task || task.status === TaskStatus.completed || task.status === TaskStatus.failed) return;

    const model = await this.prisma.aiModel.findUnique({ where: { id: task.modelId } });
    if (!model) throw new Error('Model not found');
    const channel = await this.prisma.apiChannel.findUnique({ where: { id: task.channelId } });
    if (!channel) throw new Error('Channel not found');
    this.assertRunnableMediaModel(model, AiModelType.video);
    this.assertRunnableChannel(channel);

    const adapter = AdapterFactory.createVideoAdapter(model.provider, this.decryptChannel(channel) as any);
    const params = await this.buildVideoTaskParams(task, model);
    const validation = adapter.validateParams(params);
    if (!validation.valid) {
      await this.markVideoFailed(taskId, validation.errors?.join(', ') ?? 'Invalid params');
      return;
    }

    const providerTaskId =
      task.providerTaskId && (task.status === TaskStatus.processing || task.status === TaskStatus.pending)
        ? task.providerTaskId
        : await adapter.submitTask(params);

    let initialStatus: TaskStatusResponse | null = null;
    try {
      initialStatus = await adapter.queryTaskStatus(providerTaskId);
    } catch {
      initialStatus = null;
    }

    await this.markVideoProcessing(taskId, task, providerTaskId, initialStatus);
    await this.pollVideoTask(task, taskId, adapter, providerTaskId, model);
  }

  private async buildVideoTaskParams(task: VideoTask, model: { defaultParams: unknown; modelKey: string }) {
    const params: VideoGenerateParams = {
      ...this.asJsonRecord(model.defaultParams),
      ...this.asJsonRecord(task.parameters),
      prompt: task.prompt,
    };

    if (model.modelKey && !(params as Record<string, unknown>).model) {
      (params as Record<string, unknown>).model = model.modelKey;
    }

    return this.storage.normalizeVideoGenerateParams(params);
  }

  private async pollVideoTask(
    task: VideoTask,
    taskId: bigint,
    adapter: BaseVideoAdapter,
    providerTaskId: string,
    model: { provider: string; modelKey?: string | null },
  ) {
    let delayMs = 5_000;
    const deadline = Date.now() + 20 * 60_000;

    while (Date.now() < deadline) {
      await sleep(delayMs);
      delayMs = Math.min(90_000, Math.ceil(delayMs * 1.8));

      const latestState = await this.getVideoTaskState(taskId);
      if (!latestState) return;
      if (latestState.status === TaskStatus.completed && latestState.resultUrl) return;
      if (latestState.status === TaskStatus.failed) return;

      const status = await adapter.queryTaskStatus(providerTaskId);
      const providerData = mergeTaskProviderData(latestState.providerData, status.providerData);

      if (status.status === TaskStatus.completed) {
        const output = status.resultUrls?.[0] ?? await adapter.getTaskResult(providerTaskId);
        if (!output) {
          await this.markVideoFailed(taskId, 'Missing result', providerData);
          return;
        }
        const saved = await this.storage.saveVideoResult(output, task.taskNo);
        const thumbnailUrl = await this.resolveVideoThumbnail({
          providerData: status.providerData,
          savedVideoUrl: saved.url,
          savedStorageKey: saved.storageKey,
          taskNo: task.taskNo,
          model,
        });
        await this.markVideoCompleted(task, taskId, saved.url, thumbnailUrl, saved.storageKey, providerData);
        return;
      }

      if (status.status === TaskStatus.failed) {
        await this.markVideoFailed(taskId, status.errorMessage ?? 'Task failed', providerData);
        return;
      }

      await this.updateVideoNonTerminalState(taskId, status.status, providerData);
    }

    await this.markVideoFailed(taskId, 'Task timeout');
  }

  private async resolveVideoThumbnail(input: {
    providerData: unknown;
    savedVideoUrl: string;
    savedStorageKey: string;
    taskNo: string;
    model: { provider: string; modelKey?: string | null };
  }) {
    if (!isSeedanceVideoModel(input.model)) {
      const thumbnail = await this.storage.saveVideoLastFrameFromVideoUrl({
        videoUrl: input.savedVideoUrl,
        objectKey: input.savedStorageKey,
        taskNo: input.taskNo,
      });
      return thumbnail.url;
    }

    const providerThumbnail = this.asJsonRecord(input.providerData).thumbnailUrl;
    if (typeof providerThumbnail === 'string' && providerThumbnail.trim()) {
      try {
        const savedThumbnail = await this.storage.saveImageResult(providerThumbnail, `${input.taskNo}-thumbnail`);
        return savedThumbnail.original.url;
      } catch {
        // Fall back to Tencent CI last-frame extraction below.
      }
    }

    try {
      const thumbnail = await this.storage.saveVideoLastFrameFromVideoUrl({
        videoUrl: input.savedVideoUrl,
        objectKey: input.savedStorageKey,
        taskNo: input.taskNo,
      });
      return thumbnail.url;
    } catch {
      return null;
    }
  }

  private async markImageProcessing(taskId: bigint, task: ImageTask, providerTaskId: string | null) {
    await this.prisma.imageTask.update({
      where: { id: taskId },
      data: {
        providerTaskId,
        status: TaskStatus.processing,
        startedAt: task.startedAt ?? new Date(),
        errorMessage: null,
      },
    });
  }

  private async markVideoProcessing(
    taskId: bigint,
    task: VideoTask,
    providerTaskId: string,
    initialStatus: TaskStatusResponse | null,
  ) {
    await this.prisma.videoTask.update({
      where: { id: taskId },
      data: {
        providerTaskId,
        status: initialStatus?.status === TaskStatus.pending ? TaskStatus.pending : TaskStatus.processing,
        startedAt: task.startedAt ?? new Date(),
        errorMessage: null,
        providerData: initialStatus?.providerData ? toSqliteJson(mergeTaskProviderData(task.providerData, initialStatus.providerData)) : undefined,
      },
    });
  }

  private async markImageCompleted(
    task: ImageTask,
    taskId: bigint,
    resultUrl: string,
    thumbnailUrl: string,
    storageKey: string | null,
    providerData?: unknown,
  ) {
    await this.prisma.imageTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.completed,
        resultUrl,
        thumbnailUrl,
        storageKey,
        providerData: toSqliteJson(providerData),
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    await this.projects.syncImageTaskAsset(taskId).catch((error) => {
      this.logger.warn(`Image asset sync failed for task ${task.taskNo}: ${error?.message ?? error}`);
    });
  }

  private async markVideoCompleted(
    task: VideoTask,
    taskId: bigint,
    resultUrl: string,
    thumbnailUrl: string | null,
    storageKey: string | null,
    providerData?: unknown,
  ) {
    await this.prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.completed,
        resultUrl,
        thumbnailUrl,
        storageKey,
        providerData: toSqliteJson(providerData),
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    await this.projects.syncVideoTaskAsset(taskId).catch((error) => {
      this.logger.warn(`Video asset sync failed for task ${task.taskNo}: ${error?.message ?? error}`);
    });
  }

  private async markImageFailed(taskId: bigint, errorMessage: string, providerData?: unknown) {
    await this.prisma.imageTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.failed,
        errorMessage,
        providerData: toSqliteJson(providerData),
        completedAt: new Date(),
      },
    });
  }

  private async markVideoFailed(taskId: bigint, errorMessage: string, providerData?: unknown) {
    await this.prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.failed,
        errorMessage,
        providerData: toSqliteJson(providerData),
        completedAt: new Date(),
      },
    });
  }

  private async updateImageProviderData(taskId: bigint, providerData: unknown) {
    if (providerData === undefined) return;
    await this.prisma.imageTask.update({
      where: { id: taskId },
      data: { providerData: toSqliteJson(providerData) },
    });
  }

  private async updateVideoNonTerminalState(
    taskId: bigint,
    upstreamStatus: 'pending' | 'processing',
    providerData: unknown,
  ) {
    await this.prisma.videoTask.update({
      where: { id: taskId },
      data: {
        status: upstreamStatus === TaskStatus.pending ? TaskStatus.pending : TaskStatus.processing,
        providerData: toSqliteJson(providerData),
      },
    });
  }

  private async safeFailImageTask(taskId: bigint, errorMessage: string) {
    const task = await this.prisma.imageTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!task || task.status === TaskStatus.completed || task.status === TaskStatus.failed) return;
    await this.markImageFailed(taskId, errorMessage);
  }

  private async safeFailVideoTask(taskId: bigint, errorMessage: string) {
    const task = await this.prisma.videoTask.findUnique({ where: { id: taskId }, select: { status: true } });
    if (!task || task.status === TaskStatus.completed || task.status === TaskStatus.failed) return;
    await this.markVideoFailed(taskId, errorMessage);
  }

  private async getImageTaskState(taskId: bigint): Promise<TaskStateSnapshot | null> {
    return this.prisma.imageTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        errorMessage: true,
        resultUrl: true,
        providerData: true,
        providerTaskId: true,
        startedAt: true,
      },
    });
  }

  private async getVideoTaskState(taskId: bigint): Promise<TaskStateSnapshot | null> {
    return this.prisma.videoTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        errorMessage: true,
        resultUrl: true,
        providerData: true,
        providerTaskId: true,
        startedAt: true,
      },
    });
  }
}
