import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Injectable()
export class AdminConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
    return rows.filter((row) => !row.key.startsWith('site.'));
  }

  update(key: string, dto: UpdateConfigDto) {
    if (key.startsWith('site.')) {
      throw new BadRequestException('Personal version does not support editable site settings');
    }

    return this.prisma.systemConfig.upsert({
      where: { key },
      create: {
        key,
        value: dto.value ?? null,
        description: dto.description,
      },
      update: {
        value: dto.value,
        description: dto.description,
      },
    });
  }
}
