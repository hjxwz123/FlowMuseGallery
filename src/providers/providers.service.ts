import { Injectable, NotFoundException } from '@nestjs/common';

import { parseSqliteJson } from '../common/utils/sqlite-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_MODEL_PROVIDER_KEYS } from './default-model-providers';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeProvider(provider: any) {
    const parsedSupportTypes = parseSqliteJson<string[]>(provider.supportTypes);
    return {
      ...provider,
      supportTypes: Array.isArray(parsedSupportTypes) ? parsedSupportTypes : [],
      defaultParams: parseSqliteJson(provider.defaultParams),
      paramSchema: parseSqliteJson(provider.paramSchema),
    };
  }

  async list() {
    const providers = await this.prisma.modelProvider.findMany({
      where: {
        isActive: true,
        provider: { in: Array.from(DEFAULT_MODEL_PROVIDER_KEYS) },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        provider: true,
        displayName: true,
        icon: true,
        supportTypes: true,
        defaultParams: true,
        paramSchema: true,
        webhookRequired: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return providers.map((provider) => this.serializeProvider(provider));
  }

  async detail(provider: string) {
    const item = await this.prisma.modelProvider.findUnique({
      where: { provider },
      select: {
        id: true,
        provider: true,
        displayName: true,
        icon: true,
        supportTypes: true,
        defaultParams: true,
        paramSchema: true,
        webhookRequired: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!item) throw new NotFoundException('Provider not found');
    if (!item.isActive) throw new NotFoundException('Provider not found');
    if (!DEFAULT_MODEL_PROVIDER_KEYS.has(item.provider)) throw new NotFoundException('Provider not found');
    return this.serializeProvider(item);
  }
}
