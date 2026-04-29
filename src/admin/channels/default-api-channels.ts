import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ApiChannelStatus } from '../../common/prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';
import defaultApiChannelsJson from '../../../prisma/default-api-channels.json';

export type DefaultApiChannel = {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  timeout: number;
  maxRetry: number;
  priority: number;
};

export const DEFAULT_API_CHANNELS = defaultApiChannelsJson as DefaultApiChannel[];

export const DEFAULT_API_CHANNEL_IDS = new Set(DEFAULT_API_CHANNELS.map((item) => BigInt(item.id)));

export async function upsertDefaultApiChannels(prisma: PrismaService) {
  for (const channel of DEFAULT_API_CHANNELS) {
    await prisma.apiChannel.upsert({
      where: { id: BigInt(channel.id) },
      create: {
        id: BigInt(channel.id),
        name: channel.name,
        provider: channel.provider,
        baseUrl: channel.baseUrl,
        apiKey: null,
        apiSecret: null,
        extraHeaders: null,
        timeout: channel.timeout,
        maxRetry: channel.maxRetry,
        rateLimit: null,
        status: ApiChannelStatus.disabled,
        priority: channel.priority,
        description: null,
      },
      update: {
        name: channel.name,
        provider: channel.provider,
        timeout: channel.timeout,
        maxRetry: channel.maxRetry,
        rateLimit: null,
        priority: channel.priority,
        description: null,
      },
    });

    if (channel.baseUrl) {
      await prisma.apiChannel.updateMany({
        where: {
          id: BigInt(channel.id),
          baseUrl: '',
        },
        data: {
          baseUrl: channel.baseUrl,
        },
      });
    }
  }
}

@Injectable()
export class DefaultApiChannelsService implements OnModuleInit {
  private readonly logger = new Logger(DefaultApiChannelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await upsertDefaultApiChannels(this.prisma);
    this.logger.log(`Default API channels ready: ${DEFAULT_API_CHANNELS.map((item) => item.provider).join(', ')}`);
  }
}
