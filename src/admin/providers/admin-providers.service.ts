import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { parseSqliteJson } from '../../common/utils/sqlite-json.util';
import { DEFAULT_MODEL_PROVIDER_KEYS } from '../../providers/default-model-providers';

@Injectable()
export class AdminProvidersService {
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
    });
    return providers.map((provider) => this.serializeProvider(provider));
  }

  async detail(id: bigint) {
    const provider = await this.prisma.modelProvider.findUnique({ where: { id } });
    if (!provider || !provider.isActive || !DEFAULT_MODEL_PROVIDER_KEYS.has(provider.provider)) {
      throw new NotFoundException('Provider not found');
    }
    return this.serializeProvider(provider);
  }
}
