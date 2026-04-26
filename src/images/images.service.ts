import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ImageTask } from '@prisma/client';
import { AiModelType, ApiChannelStatus, TaskStatus, UserStatus } from '../common/prisma-enums';
import { Prisma } from '@prisma/client';

import { AdapterFactory } from '../adapters/adapter.factory';
import { ImageGenerateParams } from '../adapters/base/base-image.adapter';
import { PaginationDto, PaginatedResult } from '../common/dto/pagination.dto';
import { LocalTaskRunnerService } from '../local-runner/local-task-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import { serializeImageTask, serializeImageTaskLite } from '../common/serializers/task.serializer';
import { ImageGenerateDto } from './dto/image-generate.dto';
import { MidjourneyActionDto } from './dto/midjourney-action.dto';
import { MidjourneyModalDto } from './dto/midjourney-modal.dto';
import { MidjourneyEditsDto } from './dto/midjourney-edits.dto';
import { parseSqliteJson, toSqliteJson } from '../common/utils/sqlite-json.util';
import { ProjectsService } from '../projects/projects.service';
import { randomUrlId } from '../common/utils/random-id.util';
import { isFixedMediaModelId } from '../models/fixed-media-models';

@Injectable()
export class ImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsService,
    private readonly taskRunner: LocalTaskRunnerService,
  ) {}

  private ensureActiveOwnedTask(task: ImageTask | null, userId: bigint): ImageTask {
    if (!task || task.deletedAt) throw new NotFoundException('Task not found');
    if (task.userId !== userId) throw new ForbiddenException('No access');
    return task;
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
      const task = await this.prisma.imageTask.findUnique({
        where: { id: BigInt(normalized) },
      });
      return this.ensureActiveOwnedTask(task, userId);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        if (error instanceof NotFoundException || error instanceof ForbiddenException) {
          throw error;
        }
      }
    }

    const task = await this.prisma.imageTask.findFirst({
      where: {
        userId,
        taskNo: normalized,
        deletedAt: null,
      },
    });
    return this.ensureActiveOwnedTask(task, userId);
  }

  async generate(userId: bigint, dto: ImageGenerateDto) {
    const modelId = BigInt(dto.modelId);
    let parsedProjectId: bigint | null = null;
    if (dto.projectId) {
      try {
        parsedProjectId = BigInt(dto.projectId);
      } catch {
        throw new BadRequestException('Invalid projectId');
      }
    }

    const projectScopedPrompt = parsedProjectId && dto.skipProjectPromptTransform !== true
      ? await this.projects.generateProjectImagePrompt(userId, parsedProjectId, dto.prompt)
      : null;
    const finalPrompt = projectScopedPrompt?.prompt ?? dto.prompt;

    const task = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const model = await tx.aiModel.findUnique({
        where: { id: modelId },
        include: { channel: true },
      });
      if (!model) throw new NotFoundException('Model not found');
      if (!model.isActive) throw new BadRequestException('Model disabled');
      if (model.type !== AiModelType.image) throw new BadRequestException('Model is not image type');
      if (!isFixedMediaModelId(model.id)) {
        throw new BadRequestException('个人版只支持内置固定图片模型');
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
      const mergedParams: ImageGenerateParams = {
        ...(parseSqliteJson<Record<string, unknown>>(model.defaultParams) ?? {}),
        ...(dto.parameters && typeof dto.parameters === 'object' ? dto.parameters : {}),
        prompt: finalPrompt,
        negativePrompt: dto.negativePrompt,
      };
      if (model.modelKey && !(mergedParams as any).model) (mergedParams as any).model = model.modelKey;

      const adapter = AdapterFactory.createImageAdapter(model.provider, model.channel as any);
      const validation = adapter.validateParams(mergedParams);
      if (!validation.valid) {
        throw new BadRequestException(validation.errors?.join(', ') ?? 'Invalid params');
      }

      const projectId = await this.resolveProjectId(tx, userId, dto.projectId);

      const task = await tx.imageTask.create({
        data: {
          userId,
          modelId: model.id,
          channelId: model.channelId,
          ...(projectId ? { projectId } : {}),
          taskNo: `img_${randomUrlId(24)}`,
          provider: model.provider,
          prompt: finalPrompt,
          negativePrompt: dto.negativePrompt,
          parameters: toSqliteJson(dto.parameters),
          status: TaskStatus.pending,
        },
      });

      return task;
    });

    await this.taskRunner.enqueueImage(task.id, task.retryCount);
    return serializeImageTask(task);
  }

  async listTasks(userId: bigint, pagination: PaginationDto, status?: string): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      deletedAt: null,
      ...(status ? { status: status as TaskStatus } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.imageTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.imageTask.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: items.map(serializeImageTaskLite),
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
    return serializeImageTask(task);
  }

  async deleteTask(userId: bigint, id: bigint) {
    const task = await this.prisma.imageTask.findUnique({ where: { id } });
    const ownedTask = this.ensureActiveOwnedTask(task, userId);

    await this.prisma.imageTask.update({
      where: { id: ownedTask.id },
      data: {
        deletedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async retry(userId: bigint, id: bigint) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const task = await tx.imageTask.findUnique({ where: { id } });
      const ownedTask = this.ensureActiveOwnedTask(task, userId);
      if (ownedTask.status === TaskStatus.pending || ownedTask.status === TaskStatus.processing) {
        throw new BadRequestException('Task is still running');
      }

      return tx.imageTask.update({
        where: { id: ownedTask.id },
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
    });

    await this.taskRunner.enqueueImage(updated.id, updated.retryCount);
    return serializeImageTask(updated);
  }

  async midjourneyAction(userId: bigint, id: bigint, dto: MidjourneyActionDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const parent = await tx.imageTask.findUnique({ where: { id } });
      const ownedParent = this.ensureActiveOwnedTask(parent, userId);
      if (ownedParent.provider !== 'midjourney' && ownedParent.provider !== 'mj') throw new BadRequestException('Not a midjourney task');
      if (!ownedParent.providerTaskId) throw new BadRequestException('Missing providerTaskId');
      if (ownedParent.status !== TaskStatus.completed) throw new BadRequestException('Task not completed');

      // Follow-up operations (zoom/pan/upscale/vary region...) are only allowed within 24 hours after the parent task completed.
      const baseTime = ownedParent.completedAt ?? ownedParent.createdAt;
      if (Date.now() - baseTime.getTime() > 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Task is too old to operate');
      }

      const model = await tx.aiModel.findUnique({ where: { id: ownedParent.modelId } });
      if (!model) throw new NotFoundException('Model not found');
      if (!model.isActive) throw new BadRequestException('Model disabled');
      if (model.type !== AiModelType.image) throw new BadRequestException('Model is not image type');

      const task = await tx.imageTask.create({
        data: {
          userId,
          modelId: ownedParent.modelId,
          channelId: ownedParent.channelId,
          ...(ownedParent.projectId ? { projectId: ownedParent.projectId } : {}),
          taskNo: `img_${randomUrlId(24)}`,
          provider: ownedParent.provider,
          prompt: ownedParent.prompt,
          negativePrompt: ownedParent.negativePrompt,
          parameters: toSqliteJson({
            mjOperation: 'action',
            taskId: ownedParent.providerTaskId,
            customId: dto.customId,
            parentTaskId: ownedParent.id.toString(),
            parentCompletedAt: (ownedParent.completedAt ?? ownedParent.createdAt).toISOString(),
          }),
          status: TaskStatus.pending,
        },
      });

      return task;
    });

    await this.taskRunner.enqueueImage(created.id, created.retryCount);

    return serializeImageTask(created);
  }

  async midjourneyModal(userId: bigint, id: bigint, dto: MidjourneyModalDto) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const task = await tx.imageTask.findUnique({ where: { id } });
      const ownedTask = this.ensureActiveOwnedTask(task, userId);
      if (ownedTask.provider !== 'midjourney' && ownedTask.provider !== 'mj') throw new BadRequestException('Not a midjourney task');
      if (!ownedTask.providerTaskId) throw new BadRequestException('Missing providerTaskId');
      if (ownedTask.status !== TaskStatus.processing || ownedTask.errorMessage !== 'MODAL') {
        throw new BadRequestException('Task is not waiting for modal');
      }

      // Continue modal submissions only within 24 hours after the parent task completed.
      const params = parseSqliteJson<Record<string, unknown>>(ownedTask.parameters) ?? {};
      const parentCompletedAt = typeof params.parentCompletedAt === 'string' ? params.parentCompletedAt.trim() : '';
      let baseTimeMs: number | null = null;
      if (parentCompletedAt) {
        const parsed = new Date(parentCompletedAt).getTime();
        if (Number.isFinite(parsed)) baseTimeMs = parsed;
      }

      if (baseTimeMs === null && typeof params.parentTaskId === 'string' && params.parentTaskId.trim()) {
        try {
          const parentId = BigInt(params.parentTaskId);
          const parent = await tx.imageTask.findUnique({
            where: { id: parentId },
            select: { userId: true, completedAt: true, createdAt: true, deletedAt: true },
          });
          if (parent && parent.userId === userId && !parent.deletedAt) {
            baseTimeMs = (parent.completedAt ?? parent.createdAt).getTime();
          }
        } catch {
          // ignore parse errors
        }
      }

      if (baseTimeMs === null) baseTimeMs = ownedTask.createdAt.getTime();

      if (Date.now() - baseTimeMs > 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Task is too old to operate');
      }

      const nextParams: Record<string, unknown> =
        { ...(parseSqliteJson<Record<string, unknown>>(ownedTask.parameters) ?? {}) };
      nextParams.mjOperation = 'modal';
      nextParams.taskId = ownedTask.providerTaskId;
      if (dto.maskBase64) nextParams.maskBase64 = dto.maskBase64;

      const nextPrompt = dto.prompt?.trim();

      return tx.imageTask.update({
        where: { id: ownedTask.id },
        data: {
          status: TaskStatus.pending,
          providerTaskId: null,
          parameters: toSqliteJson(nextParams),
          errorMessage: null,
          ...(nextPrompt ? { prompt: nextPrompt } : {}),
        },
      });
    });

    await this.taskRunner.enqueueImage(updated.id, Date.now());
    return serializeImageTask(updated);
  }

  /**
   * Midjourney 图片编辑 (新 API: /mj/submit/edits)
   * 一步到位，不再需要 action + modal 两步
   */
  async midjourneyEdits(userId: bigint, id: bigint, dto: MidjourneyEditsDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!user) throw new NotFoundException('User not found');
      if (user.status !== UserStatus.active) throw new ForbiddenException('User is banned');

      const parent = await tx.imageTask.findUnique({ where: { id } });
      const ownedParent = this.ensureActiveOwnedTask(parent, userId);
      if (ownedParent.provider !== 'midjourney' && ownedParent.provider !== 'mj') throw new BadRequestException('Not a midjourney task');
      if (!ownedParent.resultUrl) throw new BadRequestException('Parent task has no result');
      if (ownedParent.status !== TaskStatus.completed) throw new BadRequestException('Task not completed');

      // 图片编辑操作允许在 24 小时内
      const baseTime = ownedParent.completedAt ?? ownedParent.createdAt;
      if (Date.now() - baseTime.getTime() > 24 * 60 * 60 * 1000) {
        throw new BadRequestException('Task is too old to operate');
      }

      const model = await tx.aiModel.findUnique({ where: { id: ownedParent.modelId } });
      if (!model) throw new NotFoundException('Model not found');
      if (!model.isActive) throw new BadRequestException('Model disabled');
      if (model.type !== AiModelType.image) throw new BadRequestException('Model is not image type');

      const task = await tx.imageTask.create({
        data: {
          userId,
          modelId: ownedParent.modelId,
          channelId: ownedParent.channelId,
          ...(ownedParent.projectId ? { projectId: ownedParent.projectId } : {}),
          taskNo: `img_${randomUrlId(24)}`,
          provider: ownedParent.provider,
          prompt: dto.prompt,
          negativePrompt: ownedParent.negativePrompt,
          parameters: toSqliteJson({
            mjOperation: 'edits',
            image: dto.image, // 原图 URL
            maskBase64: dto.maskBase64, // 蒙版（原图+透明区域）
            parentTaskId: ownedParent.id.toString(),
            parentCompletedAt: (ownedParent.completedAt ?? ownedParent.createdAt).toISOString(),
          }),
          status: TaskStatus.pending,
        },
      });

      return task;
    });

    await this.taskRunner.enqueueImage(created.id, created.retryCount);

    return serializeImageTask(created);
  }
}
