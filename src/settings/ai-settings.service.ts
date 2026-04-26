import { Injectable } from '@nestjs/common';
import { ApiChannelStatus } from '../common/prisma-enums';

import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { AiSettings, DEFAULT_AI_SETTINGS, SYSTEM_SETTING_KEYS } from './system-settings.constants';
import { SHARED_CHAT_CHANNEL_NAME, SHARED_CHAT_PROVIDER } from './ai-chat.constants';

const AI_SETTINGS_KEYS = [
  SYSTEM_SETTING_KEYS.aiApiBaseUrl,
  SYSTEM_SETTING_KEYS.aiApiKey,
  SYSTEM_SETTING_KEYS.aiModelName,
] as const;

type AdminAiSettings = Omit<AiSettings, 'systemPrompt'>;

@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getAiSettings(): Promise<AiSettings> {
    return this.mapAiSettingsFromRowMap(await this.loadAiSettingsRowMapFromDb());
  }

  async getAiSettingsForAdmin(): Promise<AdminAiSettings> {
    const settings = await this.getAiSettings();
    // mask apiKey for admin display
    if (settings.apiKey && settings.apiKey.length > 8) {
      settings.apiKey = settings.apiKey.slice(0, 4) + '****' + settings.apiKey.slice(-4);
    } else if (settings.apiKey) {
      settings.apiKey = '****';
    }

    const { systemPrompt: _systemPrompt, ...adminSettings } = settings;
    return adminSettings;
  }

  async setAiSettings(input: Partial<AiSettings>) {
    const ops: Array<Promise<any>> = [];

    if (typeof input.apiBaseUrl === 'string') {
      ops.push(
        this.prisma.systemConfig.upsert({
          where: { key: SYSTEM_SETTING_KEYS.aiApiBaseUrl },
          create: { key: SYSTEM_SETTING_KEYS.aiApiBaseUrl, value: input.apiBaseUrl, description: 'AI API base URL' },
          update: { value: input.apiBaseUrl },
        }),
      );
    }

    if (typeof input.apiKey === 'string' && input.apiKey && !input.apiKey.includes('****')) {
      const encrypted = this.encryption.encryptString(input.apiKey);
      ops.push(
        this.prisma.systemConfig.upsert({
          where: { key: SYSTEM_SETTING_KEYS.aiApiKey },
          create: { key: SYSTEM_SETTING_KEYS.aiApiKey, value: encrypted, description: 'AI API key (encrypted)' },
          update: { value: encrypted },
        }),
      );
    }

    if (typeof input.modelName === 'string') {
      ops.push(
        this.prisma.systemConfig.upsert({
          where: { key: SYSTEM_SETTING_KEYS.aiModelName },
          create: { key: SYSTEM_SETTING_KEYS.aiModelName, value: input.modelName, description: 'AI model name' },
          update: { value: input.modelName },
        }),
      );
    }

    await Promise.all(ops);
    if (ops.length > 0) {
      await this.bumpCacheVersion('setAiSettings');
    }
    await this.syncSharedChatChannel();
    return this.getAiSettingsForAdmin();
  }

  private async syncSharedChatChannel() {
    const settings = await this.getAiSettings();
    const baseUrl = settings.apiBaseUrl.trim();
    const apiKey = settings.apiKey.trim();

    // 对话模型依赖共享 channel；若 AI 配置尚未完成则跳过同步。
    if (!baseUrl || !apiKey) return;

    const encryptedApiKey = this.encryption.encryptString(apiKey);

    const existing = await this.prisma.apiChannel.findFirst({
      where: {
        provider: SHARED_CHAT_PROVIDER,
        name: SHARED_CHAT_CHANNEL_NAME,
      },
      orderBy: { id: 'asc' },
    });

    if (existing) {
      await this.prisma.apiChannel.update({
        where: { id: existing.id },
        data: {
          baseUrl,
          apiKey: encryptedApiKey,
          status: ApiChannelStatus.active,
          timeout: Math.max(existing.timeout, 60_000),
        },
      });
      return;
    }

    await this.prisma.apiChannel.create({
      data: {
        name: SHARED_CHAT_CHANNEL_NAME,
        provider: SHARED_CHAT_PROVIDER,
        baseUrl,
        apiKey: encryptedApiKey,
        timeout: 120_000,
        maxRetry: 2,
        status: ApiChannelStatus.active,
        priority: 0,
        description: 'Shared chat channel driven by system settings',
      },
    });
  }

  private async loadAiSettingsRowMapFromDb(): Promise<Record<string, string | null>> {
    const rows = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [...AI_SETTINGS_KEYS],
        },
      },
    });

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.key] = row.value ?? null;
    }

    return map;
  }

  private mapAiSettingsFromRowMap(map: Record<string, string | null>): AiSettings {
    const rawKey = map[SYSTEM_SETTING_KEYS.aiApiKey] ?? '';

    return {
      apiBaseUrl: map[SYSTEM_SETTING_KEYS.aiApiBaseUrl] || DEFAULT_AI_SETTINGS.apiBaseUrl,
      apiKey: rawKey ? (this.encryption.decryptString(rawKey) ?? '') : '',
      modelName: map[SYSTEM_SETTING_KEYS.aiModelName] || DEFAULT_AI_SETTINGS.modelName,
      systemPrompt: DEFAULT_AI_SETTINGS.systemPrompt,
    };
  }

  private async bumpCacheVersion(label: string) {
    void label;
  }
}
