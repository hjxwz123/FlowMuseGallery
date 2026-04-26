import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiChannel } from '@prisma/client';
import { ApiChannelStatus } from '../../common/prisma-enums';
import axios from 'axios';

import { EncryptionService } from '../../encryption/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseSqliteJson } from '../../common/utils/sqlite-json.util';
import { CreateChannelDto } from './dto/create-channel.dto';
import { DEFAULT_API_CHANNELS, DEFAULT_API_CHANNEL_IDS, upsertDefaultApiChannels } from './default-api-channels';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class AdminChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private serializeChannel(channel: ApiChannel) {
    return {
      ...channel,
      apiKey: channel.apiKey ? 'configured' : null,
      apiSecret: channel.apiSecret ? 'configured' : null,
    };
  }

  private sortDefaultChannels(channels: ApiChannel[]) {
    const orderMap = new Map(DEFAULT_API_CHANNELS.map((channel, index) => [BigInt(channel.id).toString(), index]));
    return [...channels].sort((a, b) => {
      const aIndex = orderMap.get(a.id.toString()) ?? Number.MAX_SAFE_INTEGER;
      const bIndex = orderMap.get(b.id.toString()) ?? Number.MAX_SAFE_INTEGER;
      return aIndex - bIndex;
    });
  }

  private async ensureDefaults() {
    await upsertDefaultApiChannels(this.prisma);
  }

  private async getFixedChannel(id: bigint) {
    if (!DEFAULT_API_CHANNEL_IDS.has(id)) {
      throw new NotFoundException('Channel not found');
    }
    await this.ensureDefaults();
    const channel = await this.prisma.apiChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }

  async list() {
    await this.ensureDefaults();
    const channels = await this.prisma.apiChannel.findMany({
      where: { id: { in: DEFAULT_API_CHANNELS.map((channel) => BigInt(channel.id)) } },
    });
    return this.sortDefaultChannels(channels).map((channel) => this.serializeChannel(channel));
  }

  create(_dto: CreateChannelDto) {
    throw new BadRequestException('个人版渠道为固定清单，不支持新增渠道');
  }

  async detail(id: bigint) {
    return this.serializeChannel(await this.getFixedChannel(id));
  }

  async update(id: bigint, dto: UpdateChannelDto) {
    const channel = await this.getFixedChannel(id);
    const baseUrl = dto.baseUrl === undefined ? undefined : dto.baseUrl.trim();
    const apiKey = dto.apiKey === undefined ? undefined : dto.apiKey.trim();
    const nextBaseUrl = baseUrl === undefined ? channel.baseUrl : baseUrl;
    const hasApiKey = apiKey === undefined ? Boolean(channel.apiKey) : Boolean(apiKey);
    const status = nextBaseUrl && hasApiKey ? ApiChannelStatus.active : ApiChannelStatus.disabled;

    const updated = await this.prisma.apiChannel.update({
      where: { id },
      data: {
        baseUrl,
        apiKey:
          apiKey === undefined
            ? undefined
            : apiKey
              ? this.encryption.encryptString(apiKey)
              : null,
        status,
      },
    });

    return this.serializeChannel(updated);
  }

  async remove(_id: bigint) {
    throw new BadRequestException('个人版渠道为固定清单，不支持删除渠道');
  }

  async test(id: bigint) {
    const channel = await this.getFixedChannel(id);
    if (!channel.baseUrl.trim()) {
      return { ok: false, baseUrl: '', provider: channel.provider, error: 'Base URL is not configured', ms: 0 };
    }
    const startedAt = Date.now();
    try {
      const res = await axios.request({
        method: 'HEAD',
        url: channel.baseUrl,
        timeout: Math.min(channel.timeout, 10_000),
        validateStatus: () => true,
      });

      return { ok: true, baseUrl: channel.baseUrl, provider: channel.provider, status: res.status, ms: Date.now() - startedAt };
    } catch (e: any) {
      return { ok: false, baseUrl: channel.baseUrl, provider: channel.provider, error: e?.message ?? 'Request failed', ms: Date.now() - startedAt };
    }
  }

  async statistics(id: bigint) {
    await this.getFixedChannel(id);

    const [imageTotal, imageFailed, imageCompleted, imageProcessing, imagePending] = await this.prisma.$transaction([
      this.prisma.imageTask.count({ where: { channelId: id } }),
      this.prisma.imageTask.count({ where: { channelId: id, status: 'failed' } }),
      this.prisma.imageTask.count({ where: { channelId: id, status: 'completed' } }),
      this.prisma.imageTask.count({ where: { channelId: id, status: 'processing' } }),
      this.prisma.imageTask.count({ where: { channelId: id, status: 'pending' } }),
    ]);

    const [videoTotal, videoFailed, videoCompleted, videoProcessing, videoPending] = await this.prisma.$transaction([
      this.prisma.videoTask.count({ where: { channelId: id } }),
      this.prisma.videoTask.count({ where: { channelId: id, status: 'failed' } }),
      this.prisma.videoTask.count({ where: { channelId: id, status: 'completed' } }),
      this.prisma.videoTask.count({ where: { channelId: id, status: 'processing' } }),
      this.prisma.videoTask.count({ where: { channelId: id, status: 'pending' } }),
    ]);

    const imageSamples = await this.prisma.imageTask.findMany({
      where: { channelId: id, status: 'completed', startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
      take: 200,
    });

    const videoSamples = await this.prisma.videoTask.findMany({
      where: { channelId: id, status: 'completed', startedAt: { not: null }, completedAt: { not: null } },
      select: { startedAt: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
      take: 200,
    });

    const avgImageMs =
      imageSamples.length === 0
        ? null
        : Math.round(
            imageSamples.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.startedAt!.getTime()), 0) /
              imageSamples.length,
          );

    const avgVideoMs =
      videoSamples.length === 0
        ? null
        : Math.round(
            videoSamples.reduce((sum, t) => sum + (t.completedAt!.getTime() - t.startedAt!.getTime()), 0) /
              videoSamples.length,
          );

    const health = await this.prisma.systemConfig.findUnique({ where: { key: `channel_health:${id.toString()}` } });
    const healthValue = parseSqliteJson(health?.value);

    return {
      images: { total: imageTotal, failed: imageFailed, completed: imageCompleted, processing: imageProcessing, pending: imagePending, avgMs: avgImageMs },
      videos: { total: videoTotal, failed: videoFailed, completed: videoCompleted, processing: videoProcessing, pending: videoPending, avgMs: avgVideoMs },
      health: healthValue,
    };
  }
}
