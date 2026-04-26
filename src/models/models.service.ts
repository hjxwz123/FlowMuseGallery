import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiModelType } from '../common/prisma-enums';

import { upsertDefaultAiModels } from '../admin/models/default-ai-models';
import { PrismaService } from '../prisma/prisma.service';
import { buildModelCapabilities } from './model-capabilities';
import { FIXED_MEDIA_MODEL_ID_VALUES, isFixedMediaModelId } from './fixed-media-models';

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  private applyPersonalModelScope(where: Prisma.AiModelWhereInput, type?: 'image' | 'video' | 'chat') {
    if (type === AiModelType.image || type === AiModelType.video) {
      where.id = { in: FIXED_MEDIA_MODEL_ID_VALUES };
      return;
    }

    if (!type) {
      where.OR = [
        {
          type: { in: [AiModelType.image, AiModelType.video] },
          id: { in: FIXED_MEDIA_MODEL_ID_VALUES },
        },
        { type: AiModelType.chat },
      ];
    }
  }

  private personalDetailWhere(id: bigint): Prisma.AiModelWhereInput {
    return {
      id,
      OR: [
        { id: { in: FIXED_MEDIA_MODEL_ID_VALUES } },
        { type: AiModelType.chat },
      ],
    };
  }

  async list(options: { type?: 'image' | 'video' | 'chat'; provider?: string }) {
    if (options.type !== AiModelType.chat) {
      await upsertDefaultAiModels(this.prisma);
    }

    const where: Prisma.AiModelWhereInput = { isActive: true };
    if (options.type) where.type = options.type as AiModelType;
    if (options.provider) where.provider = options.provider;
    this.applyPersonalModelScope(where, options.type);

    const models = await this.prisma.aiModel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return models.map(({ systemPrompt: _systemPrompt, ...model }) => model);
  }

  async detail(id: bigint) {
    if (isFixedMediaModelId(id)) {
      await upsertDefaultAiModels(this.prisma);
    }

    const model = await this.prisma.aiModel.findFirst({
      where: this.personalDetailWhere(id),
      include: { channel: true },
    });
    if (!model) throw new NotFoundException('Model not found');
    const { systemPrompt: _systemPrompt, ...publicModel } = model;
    return publicModel;
  }

  async capabilities(id: bigint) {
    if (isFixedMediaModelId(id)) {
      await upsertDefaultAiModels(this.prisma);
    }

    const model = await this.prisma.aiModel.findFirst({ where: this.personalDetailWhere(id) });
    if (!model) throw new NotFoundException('Model not found');
    const providerConfig = await this.prisma.modelProvider.findUnique({ where: { provider: model.provider } });
    return buildModelCapabilities(model, providerConfig);
  }

  async listCapabilities(options: { type?: 'image' | 'video' | 'chat'; provider?: string }) {
    if (options.type !== AiModelType.chat) {
      await upsertDefaultAiModels(this.prisma);
    }

    const where: Prisma.AiModelWhereInput = { isActive: true };
    if (options.type) where.type = options.type as AiModelType;
    if (options.provider) where.provider = options.provider;
    this.applyPersonalModelScope(where, options.type);

    const models = await this.prisma.aiModel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    const providers = Array.from(new Set(models.map((m) => m.provider)));
    const providerConfigs = await this.prisma.modelProvider.findMany({ where: { provider: { in: providers } } });
    const map = new Map(providerConfigs.map((p) => [p.provider, p]));

    return models.map((m) => {
      const { systemPrompt: _systemPrompt, ...publicModel } = m;
      return {
        ...publicModel,
        capabilities: buildModelCapabilities(m, map.get(m.provider) ?? null),
      };
    });
  }
}
