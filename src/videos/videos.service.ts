import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiModelType, ApiChannelStatus, ChatMessageRole, TaskStatus, UserStatus } from '../common/prisma-enums';
import { Prisma } from '@prisma/client';

import { AdapterFactory } from '../adapters/adapter.factory';
import { VideoGenerateParams } from '../adapters/base/base-video.adapter';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { normalizeUploadedFileName } from '../common/utils/upload-filename.util';
import { EncryptionService } from '../encryption/encryption.service';
import { LocalTaskRunnerService } from '../local-runner/local-task-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeVideoTask } from '../common/serializers/task.serializer';
import { StorageService, type VideoInputUploadKind } from '../storage/storage.service';
import { VideoGenerateDto } from './dto/video-generate.dto';
import { canCancelVideoTask, supportsVideoTaskCancel } from '../common/utils/video-task-cancel.util';
import { parseSqliteJson, toSqliteJson } from '../common/utils/sqlite-json.util';
import { extractAutoProjectAgentFromProviderData } from '../chat/auto-project-workflow.metadata';
import { randomUrlId } from '../common/utils/random-id.util';
import { isFixedMediaModelId } from '../models/fixed-media-models';

type SeedanceUploadRule = {
  maxFiles: number;
  maxFileSizeMb: number;
  allowedMimePrefixes?: string[];
  allowedMimeTypes?: string[];
  allowedExtensions: string[];
};

type VideoInputUploadProvider = 'seedance' | 'wanx';

type VideoTaskWithRelations = Prisma.VideoTaskGetPayload<{
  include: {
    model: { select: { provider: true; modelKey: true } };
  };
}>;

const SEEDANCE_UPLOAD_RULES: Record<VideoInputUploadKind, SeedanceUploadRule> = {
  image: {
    maxFiles: 9,
    maxFileSizeMb: 30,
    allowedMimePrefixes: ['image/'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.gif', '.heic', '.heif'],
  },
  video: {
    maxFiles: 3,
    maxFileSizeMb: 50,
    allowedMimePrefixes: ['video/'],
    allowedExtensions: ['.mp4', '.mov'],
  },
  audio: {
    maxFiles: 3,
    maxFileSizeMb: 15,
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'],
    allowedExtensions: ['.mp3', '.wav'],
  },
};

const WANX_UPLOAD_RULES: Record<VideoInputUploadKind, SeedanceUploadRule> = {
  image: {
    maxFiles: 5,
    maxFileSizeMb: 20,
    allowedMimePrefixes: ['image/'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.bmp', '.webp'],
  },
  video: {
    maxFiles: 5,
    maxFileSizeMb: 100,
    allowedMimePrefixes: ['video/'],
    allowedExtensions: ['.mp4', '.mov'],
  },
  audio: {
    maxFiles: 5,
    maxFileSizeMb: 15,
    allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'],
    allowedExtensions: ['.mp3', '.wav'],
  },
};

@Injectable()
export class VideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly storage: StorageService,
    private readonly taskRunner: LocalTaskRunnerService,
  ) {}

  private getUploadRules(provider: VideoInputUploadProvider) {
    return provider === 'wanx' ? WANX_UPLOAD_RULES : SEEDANCE_UPLOAD_RULES;
  }

  private assertVideoInputUploadFile(
    provider: VideoInputUploadProvider,
    kind: VideoInputUploadKind,
    file: Express.Multer.File,
  ) {
    const rule = this.getUploadRules(provider)[kind];
    const fileName = normalizeUploadedFileName(file.originalname);
    const normalizedMimeType = String(file.mimetype || '').toLowerCase().trim();
    const normalizedExt = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : '';
    const maxBytes = rule.maxFileSizeMb * 1024 * 1024;

    if ((file.size ?? 0) <= 0) {
      throw new BadRequestException(`文件 ${fileName} 为空`);
    }

    if ((file.size ?? 0) > maxBytes) {
      throw new BadRequestException(`文件 ${fileName} 超过大小限制（${rule.maxFileSizeMb}MB）`);
    }

    const mimeAllowed = rule.allowedMimeTypes?.includes(normalizedMimeType)
      || rule.allowedMimePrefixes?.some((prefix) => normalizedMimeType.startsWith(prefix))
      || false;
    const extAllowed = rule.allowedExtensions.includes(normalizedExt);

    if (!mimeAllowed && !extAllowed) {
      throw new BadRequestException(`文件 ${fileName} 格式不支持`);
    }
  }

  async uploadSeedanceInputs(
    userId: bigint,
    kind: VideoInputUploadKind,
    files: Express.Multer.File[],
    provider: VideoInputUploadProvider = 'seedance',
  ) {
    const rule = this.getUploadRules(provider)[kind];

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

    if (!Array.isArray(files) || files.length === 0) {
      throw new BadRequestException('请至少上传一个文件');
    }

    if (files.length > rule.maxFiles) {
      throw new BadRequestException(`单次最多上传 ${rule.maxFiles} 个文件`);
    }

    const uploaded = [];
    for (const file of files) {
      this.assertVideoInputUploadFile(provider, kind, file);
      const stored = await this.storage.uploadVideoInput(
        file.buffer,
        normalizeUploadedFileName(file.originalname),
        kind,
        file.mimetype,
      );

      uploaded.push({
        kind,
        fileName: normalizeUploadedFileName(file.originalname),
        url: stored.url,
        storageKey: stored.storageKey,
        contentType: stored.contentType ?? file.mimetype,
        size: stored.size ?? file.size,
      });
    }

    return { files: uploaded };
  }

  private async resolveProjectId(tx: Prisma.TransactionClient, userId: bigint, projectId?: string) {
    if (!projectId) return undefined;

    let parsedProjectId: bigint;
    try {
      parsedProjectId = BigInt(projectId);
    } catch {
      throw new BadRequestException('Invalid projectId');
    }

    const project = await tx.project.findFirst({
      where: { id: parsedProjectId, userId },
      select: { id: true },
    });
    if (!project) throw new BadRequestException('Project not found');
    return project.id;
  }

  private async findOwnedTaskByIdOrTaskNo(userId: bigint, idOrTaskNo: string) {
    const normalized = String(idOrTaskNo || '').trim();
    if (!normalized) {
      throw new NotFoundException('Task not found');
    }

    try {
      const task = await this.prisma.videoTask.findUnique({
        where: { id: BigInt(normalized) },
        include: {
          model: { select: { provider: true, modelKey: true } },
        },
      });
      if (!task) throw new NotFoundException('Task not found');
      if (task.userId !== userId) throw new ForbiddenException('No access');
      return task;
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        if (error instanceof NotFoundException || error instanceof ForbiddenException) {
          throw error;
        }
      }
    }

    const task = await this.prisma.videoTask.findFirst({
      where: {
        userId,
        taskNo: normalized,
      },
      include: {
        model: { select: { provider: true, modelKey: true } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private serializeOwnedTask(task: VideoTaskWithRelations) {
    const cancelSupported = supportsVideoTaskCancel(task.model.provider, task.model.modelKey);
    return serializeVideoTask(task, {
      canCancel: canCancelVideoTask(task.status, task.model.provider, task.model.modelKey),
      cancelSupported,
    });
  }

  private async tryRemoveQueueJob(taskIdStr: string, retryCount: number) {
    await this.taskRunner.removeVideo(taskIdStr, retryCount);
  }

  private async getQueueJobState(taskIdStr: string, retryCount: number) {
    return this.taskRunner.getVideoState(taskIdStr, retryCount);
  }

  private async createVideoAdapter(provider: string, channelId: bigint) {
    const channel = await this.prisma.apiChannel.findUnique({ where: { id: channelId } });
    if (!channel) throw new NotFoundException('Channel not found');

    const decryptedChannel = {
      ...channel,
      apiKey: this.encryption.decryptString(channel.apiKey),
      apiSecret: this.encryption.decryptString(channel.apiSecret),
    };

    return AdapterFactory.createVideoAdapter(provider, decryptedChannel as any);
  }

  private async rollbackCanceledAutoProjectShot(task: {
    userId: bigint;
    projectId: bigint | null;
    modelId: bigint;
    autoProjectShotId?: string | null;
    autoProjectFinalStoryboard?: boolean | null;
  }) {
    const shotId = typeof task.autoProjectShotId === 'string' ? task.autoProjectShotId.trim() : '';
    if (!task.projectId || !shotId || task.autoProjectFinalStoryboard !== true) {
      return;
    }

    const rows = await this.prisma.chatMessage.findMany({
      where: {
        userId: task.userId,
        role: ChatMessageRole.assistant,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        providerData: true,
      },
    });

    const compatibleModelCache = new Map<string, boolean>();

    for (const row of rows) {
      const rowProviderData = parseSqliteJson<Record<string, unknown>>(row.providerData);
      if (!rowProviderData || typeof rowProviderData !== 'object' || Array.isArray(rowProviderData)) continue;

      const metadata = extractAutoProjectAgentFromProviderData(rowProviderData);
      if (!metadata?.workflow) continue;
      if (metadata.projectId !== task.projectId.toString()) continue;
      if (metadata.videoModelId !== task.modelId.toString()) {
        let isCompatibleModel = compatibleModelCache.get(metadata.videoModelId);
        if (isCompatibleModel === undefined) {
          isCompatibleModel = await this.isSameWanxVideoModelSeries(metadata.videoModelId, task.modelId);
          compatibleModelCache.set(metadata.videoModelId, isCompatibleModel);
        }
        if (!isCompatibleModel) continue;
      }
      if (!metadata.workflow.generatedShotIds.includes(shotId)) continue;

      const nextGeneratedShotIds = metadata.workflow.generatedShotIds.filter((id) => id !== shotId);
      const providerData = { ...rowProviderData };
      const autoProjectAgent =
        providerData.autoProjectAgent &&
        typeof providerData.autoProjectAgent === 'object' &&
        !Array.isArray(providerData.autoProjectAgent)
          ? { ...(providerData.autoProjectAgent as Record<string, unknown>) }
          : null;
      const workflow =
        autoProjectAgent?.workflow &&
        typeof autoProjectAgent.workflow === 'object' &&
        !Array.isArray(autoProjectAgent.workflow)
          ? { ...(autoProjectAgent.workflow as Record<string, unknown>) }
          : null;

      if (!autoProjectAgent || !workflow) continue;

      workflow.generatedShotIds = nextGeneratedShotIds;
      autoProjectAgent.workflow = workflow;
      providerData.autoProjectAgent = autoProjectAgent;

      await this.prisma.chatMessage.update({
        where: { id: row.id },
        data: {
          providerData: toSqliteJson(providerData),
        },
      });
    }
  }

  private async isSameWanxVideoModelSeries(leftModelIdRaw: string, rightModelId: bigint) {
    let leftModelId: bigint;
    try {
      leftModelId = BigInt(leftModelIdRaw);
    } catch {
      return false;
    }

    const models = await this.prisma.aiModel.findMany({
      where: {
        id: { in: [leftModelId, rightModelId] },
        type: AiModelType.video,
      },
      select: {
        id: true,
        provider: true,
        modelKey: true,
      },
    });
    const leftModel = models.find((model) => model.id === leftModelId);
    const rightModel = models.find((model) => model.id === rightModelId);
    if (!leftModel || !rightModel) return false;

    const leftSeries = this.resolveWanxVideoModelSeries(leftModel);
    const rightSeries = this.resolveWanxVideoModelSeries(rightModel);
    return Boolean(leftSeries && rightSeries && leftSeries === rightSeries);
  }

  private resolveWanxVideoModelSeries(model: { provider: string; modelKey: string | null }) {
    const provider = String(model.provider ?? '').trim().toLowerCase();
    if (!provider.includes('wanx') && !provider.includes('wanxiang')) return null;

    const remoteModel = String(model.modelKey ?? '').trim().toLowerCase();
    const match = remoteModel.match(/^(wan2\.7|happyhorse-1\.0)-(?:i2v|t2v|r2v)$/);
    return match?.[1] ?? null;
  }

  async generate(userId: bigint, dto: VideoGenerateDto) {
    const modelId = BigInt(dto.modelId);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const model = await tx.aiModel.findUnique({
        where: { id: modelId },
        include: { channel: true },
      });
      if (!model) throw new NotFoundException('Model not found');
      if (!model.isActive) throw new BadRequestException('Model disabled');
      if (model.type !== AiModelType.video) throw new BadRequestException('Model is not video type');
      if (!isFixedMediaModelId(model.id)) {
        throw new BadRequestException('个人版只支持内置固定视频模型');
      }
      if (
        model.channel.status !== ApiChannelStatus.active ||
        !model.channel.baseUrl.trim() ||
        !model.channel.apiKey
      ) {
        throw new BadRequestException(`请先配置 ${model.channel.name} 渠道的 Base URL 和 API Key`);
      }

      // Validate params early before creating the local task.
      // Merge model.defaultParams + user parameters, then inject modelKey as provider "model" if not specified.
      const mergedParams: VideoGenerateParams = {
        ...(parseSqliteJson<Record<string, unknown>>(model.defaultParams) ?? {}),
        ...(dto.parameters && typeof dto.parameters === 'object' ? dto.parameters : {}),
        prompt: dto.prompt,
      };
      if (model.modelKey && !(mergedParams as any).model) (mergedParams as any).model = model.modelKey;
      const normalizedParams = await this.storage.normalizeVideoGenerateParams(mergedParams);

      const adapter = AdapterFactory.createVideoAdapter(model.provider, model.channel as any);
      const validation = adapter.validateParams(normalizedParams);
      if (!validation.valid) {
        throw new BadRequestException(validation.errors?.join(', ') ?? 'Invalid params');
      }

      const projectId = await this.resolveProjectId(tx, userId, dto.projectId);

      const task = await tx.videoTask.create({
        data: {
          userId,
          modelId: model.id,
          channelId: model.channelId,
          ...(projectId ? { projectId } : {}),
          taskNo: `vid_${randomUrlId(24)}`,
          provider: model.provider,
          prompt: dto.prompt,
          parameters: toSqliteJson(normalizedParams),
          status: TaskStatus.pending,
        },
      });

      return {
        task,
        canCancel: canCancelVideoTask(task.status, model.provider, model.modelKey),
        cancelSupported: supportsVideoTaskCancel(model.provider, model.modelKey),
      };
    });

    await this.taskRunner.enqueueVideo(created.task.id, created.task.retryCount);
    return serializeVideoTask(created.task, {
      canCancel: created.canCancel,
      cancelSupported: created.cancelSupported,
    });
  }

  async listTasks(userId: bigint, pagination: PaginationDto, status?: string): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      ...(status ? { status: status as TaskStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.videoTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          model: { select: { provider: true, modelKey: true } },
        },
      }),
      this.prisma.videoTask.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map((item) => this.serializeOwnedTask(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async getTask(userId: bigint, idOrTaskNo: string) {
    const task = await this.findOwnedTaskByIdOrTaskNo(userId, idOrTaskNo);
    return this.serializeOwnedTask(task);
  }

  async cancel(userId: bigint, idOrTaskNo: string) {
    const task = await this.findOwnedTaskByIdOrTaskNo(userId, idOrTaskNo);

    if (!supportsVideoTaskCancel(task.model.provider, task.model.modelKey)) {
      throw new BadRequestException('当前任务不支持取消');
    }

    if (task.status !== TaskStatus.pending) {
      throw new BadRequestException('仅排队中的任务支持取消');
    }

    if (!task.providerTaskId) {
      const queueState = await this.getQueueJobState(task.id.toString(), task.retryCount);
      const canCancelLocalQueue = queueState === 'waiting';

      if (!canCancelLocalQueue) {
        throw new BadRequestException('任务已开始处理，无法取消');
      }
    } else {
      const adapter = await this.createVideoAdapter(task.provider, task.channelId);
      await adapter.cancelTask(task.providerTaskId);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.videoTask.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.failed,
          errorMessage: 'CANCELED',
          completedAt: new Date(),
        },
      });
      return tx.videoTask.findUnique({
        where: { id: task.id },
        include: {
          model: { select: { provider: true, modelKey: true } },
        },
      });
    });

    await this.tryRemoveQueueJob(task.id.toString(), task.retryCount);
    await this.rollbackCanceledAutoProjectShot(task);

    if (!updated) throw new NotFoundException('Task not found');
    return this.serializeOwnedTask(updated);
  }

  async deleteTask(userId: bigint, id: bigint) {
    const task = await this.prisma.videoTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.userId !== userId) throw new ForbiddenException('No access');

    await this.prisma.videoTask.delete({ where: { id: task.id } });
    return { ok: true };
  }

  async retry(userId: bigint, id: bigint) {
    const retried = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const task = await tx.videoTask.findUnique({ where: { id } });
      if (!task) throw new NotFoundException('Task not found');
      if (task.userId !== userId) throw new ForbiddenException('No access');
      if (task.status === TaskStatus.pending || task.status === TaskStatus.processing) {
        throw new BadRequestException('Task is still running');
      }

      const model = await tx.aiModel.findUnique({
        where: { id: task.modelId },
        select: { provider: true, modelKey: true },
      });

      const updated = await tx.videoTask.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.pending,
          retryCount: { increment: 1 },
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          providerTaskId: null,
          resultUrl: null,
          thumbnailUrl: null,
          storageKey: null,
        },
      });

      return {
        task: updated,
        canCancel: canCancelVideoTask(updated.status, model?.provider ?? task.provider, model?.modelKey ?? null),
        cancelSupported: supportsVideoTaskCancel(model?.provider ?? task.provider, model?.modelKey ?? null),
      };
    });

    await this.taskRunner.enqueueVideo(retried.task.id, retried.task.retryCount);
    return serializeVideoTask(retried.task, {
      canCancel: retried.canCancel,
      cancelSupported: retried.cancelSupported,
    });
  }
}
