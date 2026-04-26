import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AiModelType, TaskStatus } from '../../common/prisma-enums';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateModelDto } from './dto/create-model.dto';
import { DEFAULT_AI_MODEL_ID_VALUES, isDefaultAiModelId, upsertDefaultAiModels } from './default-ai-models';
import { ReorderModelsDto } from './dto/reorder-models.dto';
import { UpdateModelDto } from './dto/update-model.dto';

type RemoveModelOptions = {
  allowChatModel?: boolean;
};

@Injectable()
export class AdminModelsService {
  private static readonly ARCHIVED_MODEL_NAME_PREFIX = '[DELETED#';

  constructor(private readonly prisma: PrismaService) {}

  async list() {
    await upsertDefaultAiModels(this.prisma);

    return this.prisma.aiModel.findMany({
      where: {
        id: { in: DEFAULT_AI_MODEL_ID_VALUES },
        name: { not: { startsWith: AdminModelsService.ARCHIVED_MODEL_NAME_PREFIX } },
      },
      include: { channel: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  create(_dto: CreateModelDto) {
    throw new BadRequestException('个人版媒体模型为固定清单，不支持新增模型');
  }

  reorder(_dto: ReorderModelsDto) {
    throw new BadRequestException('个人版媒体模型为固定清单，不支持调整排序');
  }

  async detail(id: bigint) {
    if (!isDefaultAiModelId(id)) throw new NotFoundException('Model not found');
    await upsertDefaultAiModels(this.prisma);

    const model = await this.prisma.aiModel.findUnique({ where: { id }, include: { channel: true } });
    if (!model) throw new NotFoundException('Model not found');
    return model;
  }

  update(_id: bigint, _dto: UpdateModelDto) {
    throw new BadRequestException('个人版媒体模型为固定清单，不支持修改模型');
  }

  async remove(id: bigint, options: RemoveModelOptions = {}) {
    const model = await this.prisma.aiModel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        modelKey: true,
        icon: true,
        type: true,
        provider: true,
        channelId: true,
        defaultParams: true,
        paramConstraints: true,
        supportsImageInput: true,
        supportsResolutionSelect: true,
        supportsSizeSelect: true,
        supportsQuickMode: true,
        supportsAgentMode: true,
        supportsAutoMode: true,
        maxContextRounds: true,
      },
    });
    if (!model) throw new NotFoundException('Model not found');
    if (!options.allowChatModel || model.type !== AiModelType.chat) {
      throw new BadRequestException('个人版媒体模型为固定清单，不支持删除模型');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // 个人版无计费系统；删除模型前仅把进行中的任务标记失败。
        const [runningImageTasks, runningVideoTasks] = await Promise.all([
          tx.imageTask.findMany({
            where: { modelId: id, status: { in: [TaskStatus.pending, TaskStatus.processing] } },
            select: { id: true, userId: true, taskNo: true },
          }),
          tx.videoTask.findMany({
            where: { modelId: id, status: { in: [TaskStatus.pending, TaskStatus.processing] } },
            select: { id: true, userId: true, taskNo: true },
          }),
        ]);

        if (runningImageTasks.length > 0) {
          await tx.imageTask.updateMany({
            where: { id: { in: runningImageTasks.map((t) => t.id) } },
            data: { status: TaskStatus.failed, errorMessage: 'MODEL_REMOVED', completedAt: new Date() },
          });
        }
        if (runningVideoTasks.length > 0) {
          await tx.videoTask.updateMany({
            where: { id: { in: runningVideoTasks.map((t) => t.id) } },
            data: { status: TaskStatus.failed, errorMessage: 'MODEL_REMOVED', completedAt: new Date() },
          });
        }

        // 创建归档模型承接历史关联数据，这样关联任务不会被删除。
        const archiveNameBase = `${AdminModelsService.ARCHIVED_MODEL_NAME_PREFIX}${model.id.toString()}] ${model.name}`;
        const archiveName = archiveNameBase.length > 100 ? archiveNameBase.slice(0, 100) : archiveNameBase;
        const archiveModel = await tx.aiModel.create({
          data: {
            name: archiveName,
            modelKey: `${model.modelKey}_deleted_${Date.now()}`.slice(0, 100),
            icon: model.icon,
            type: model.type,
            provider: model.provider,
            channelId: model.channelId,
            defaultParams: model.defaultParams,
            paramConstraints: model.paramConstraints,
            isActive: false,
            description: `Archived placeholder for deleted model ${model.id.toString()}`,
            supportsImageInput: model.supportsImageInput,
            supportsResolutionSelect: model.supportsResolutionSelect,
            supportsSizeSelect: model.supportsSizeSelect,
            supportsQuickMode: model.supportsQuickMode,
            supportsAgentMode: model.supportsAgentMode,
            supportsAutoMode: model.supportsAutoMode,
            maxContextRounds: model.maxContextRounds,
          },
        });

        // 保留关联记录，只迁移 modelId。
        await tx.imageTask.updateMany({ where: { modelId: id }, data: { modelId: archiveModel.id } });
        await tx.videoTask.updateMany({ where: { modelId: id }, data: { modelId: archiveModel.id } });
        await tx.chatConversation.updateMany({
          where: { modelId: id },
          data: { modelId: archiveModel.id },
        });

        await tx.aiModel.delete({ where: { id } });
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new BadRequestException('模型删除失败：仍存在外键引用，请检查其他业务表是否引用该模型。');
      }
      throw error;
    }

    return { ok: true };
  }
}
