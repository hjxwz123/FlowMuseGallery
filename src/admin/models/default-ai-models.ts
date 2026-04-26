import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AiModelType } from '../../common/prisma-enums';
import { toSqliteJson } from '../../common/utils/sqlite-json.util';
import {
  FIXED_MEDIA_MODEL_ID_VALUES,
  FIXED_MEDIA_MODEL_IDS,
  FIXED_MEDIA_MODELS,
  type FixedMediaModel,
  isFixedMediaModelId,
} from '../../models/fixed-media-models';
import { PrismaService } from '../../prisma/prisma.service';
import { upsertDefaultModelProviders } from '../../providers/default-model-providers';
import { upsertDefaultApiChannels } from '../channels/default-api-channels';

export type DefaultAiModel = FixedMediaModel;
export const DEFAULT_AI_MODELS = FIXED_MEDIA_MODELS;
export const DEFAULT_AI_MODEL_ID_VALUES = FIXED_MEDIA_MODEL_ID_VALUES;
export const DEFAULT_AI_MODEL_IDS = FIXED_MEDIA_MODEL_IDS;
export const isDefaultAiModelId = isFixedMediaModelId;

export async function upsertDefaultAiModels(prisma: PrismaService) {
  await upsertDefaultModelProviders(prisma);
  await upsertDefaultApiChannels(prisma);

  for (const model of DEFAULT_AI_MODELS) {
    const data = {
      name: model.name,
      modelKey: model.modelKey,
      icon: model.icon,
      type: model.type as AiModelType,
      provider: model.provider,
      channelId: BigInt(model.channelId),
      defaultParams: toSqliteJson(model.defaultParams),
      paramConstraints: toSqliteJson(model.paramConstraints),
      isActive: model.isActive,
      sortOrder: model.sortOrder,
      description: model.description,
      supportsImageInput: model.supportsImageInput,
      supportsResolutionSelect: model.supportsResolutionSelect,
      supportsSizeSelect: model.supportsSizeSelect,
      supportsQuickMode: model.supportsQuickMode,
      supportsAgentMode: model.supportsAgentMode,
      supportsAutoMode: model.supportsAutoMode,
      maxContextRounds: model.maxContextRounds,
      systemPrompt: model.systemPrompt,
    };

    await prisma.aiModel.upsert({
      where: { id: BigInt(model.id) },
      create: {
        id: BigInt(model.id),
        ...data,
      },
      update: data,
    });
  }

  await prisma.aiModel.updateMany({
    where: {
      type: { in: [AiModelType.image, AiModelType.video] },
      id: { notIn: DEFAULT_AI_MODEL_ID_VALUES },
    },
    data: { isActive: false },
  });
}

@Injectable()
export class DefaultAiModelsService implements OnModuleInit {
  private readonly logger = new Logger(DefaultAiModelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await upsertDefaultAiModels(this.prisma);
    this.logger.log(`Default AI models ready: ${DEFAULT_AI_MODELS.map((item) => item.modelKey).join(', ')}`);
  }
}
