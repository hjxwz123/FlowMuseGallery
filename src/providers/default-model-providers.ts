import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { toSqliteJson } from '../common/utils/sqlite-json.util';
import { PrismaService } from '../prisma/prisma.service';
import defaultModelProvidersJson from '../../prisma/default-model-providers.json';

type ProviderSupportType = 'image' | 'video';

export type DefaultModelProvider = {
  id: number;
  provider: string;
  displayName: string;
  adapterClass: string;
  icon: string | null;
  supportTypes: ProviderSupportType[];
  defaultParams: Record<string, unknown> | null;
  paramSchema: Record<string, unknown> | null;
  webhookRequired: boolean;
  isActive: boolean;
  sortOrder: number;
};

export const DEFAULT_MODEL_PROVIDERS = defaultModelProvidersJson as DefaultModelProvider[];
export const DEFAULT_MODEL_PROVIDER_KEYS = new Set(DEFAULT_MODEL_PROVIDERS.map((item) => item.provider));

export async function upsertDefaultModelProviders(prisma: PrismaService) {
  for (const provider of DEFAULT_MODEL_PROVIDERS) {
    await prisma.modelProvider.upsert({
      where: { provider: provider.provider },
      create: {
        id: provider.id,
        provider: provider.provider,
        displayName: provider.displayName,
        adapterClass: provider.adapterClass,
        icon: provider.icon,
        supportTypes: toSqliteJson(provider.supportTypes) ?? '[]',
        defaultParams: toSqliteJson(provider.defaultParams),
        paramSchema: toSqliteJson(provider.paramSchema),
        webhookRequired: provider.webhookRequired,
        isActive: provider.isActive,
        sortOrder: provider.sortOrder,
      },
      update: {
        displayName: provider.displayName,
        adapterClass: provider.adapterClass,
        icon: provider.icon,
        supportTypes: toSqliteJson(provider.supportTypes) ?? '[]',
        defaultParams: toSqliteJson(provider.defaultParams),
        paramSchema: toSqliteJson(provider.paramSchema),
        webhookRequired: provider.webhookRequired,
        isActive: provider.isActive,
        sortOrder: provider.sortOrder,
      },
    });
  }
}

@Injectable()
export class DefaultModelProvidersService implements OnModuleInit {
  private readonly logger = new Logger(DefaultModelProvidersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await upsertDefaultModelProviders(this.prisma);
    this.logger.log(`Default model providers ready: ${DEFAULT_MODEL_PROVIDERS.map((item) => item.provider).join(', ')}`);
  }
}
