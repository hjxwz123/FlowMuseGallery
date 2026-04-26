import { Injectable } from '@nestjs/common';

import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_STORAGE_SETTINGS,
  StorageSettings,
  SYSTEM_SETTING_KEYS,
} from './system-settings.constants';

const STORAGE_SETTINGS_KEYS = [
  SYSTEM_SETTING_KEYS.storageCosSecretId,
  SYSTEM_SETTING_KEYS.storageCosSecretKey,
  SYSTEM_SETTING_KEYS.storageCosBucket,
  SYSTEM_SETTING_KEYS.storageCosRegion,
  SYSTEM_SETTING_KEYS.storageCosPublicBaseUrl,
  SYSTEM_SETTING_KEYS.storageCosPrefix,
] as const;

type StorageSettingsInput = Partial<Omit<StorageSettings, 'cosConfigured'>>;

@Injectable()
export class StorageSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getStorageSettings(): Promise<StorageSettings> {
    return this.mapStorageSettingsFromRowMap(await this.loadStorageSettingsRowMapFromDb(), false);
  }

  async getStorageSettingsForAdmin(): Promise<StorageSettings> {
    return this.mapStorageSettingsFromRowMap(await this.loadStorageSettingsRowMapFromDb(), true);
  }

  async setStorageSettings(input: StorageSettingsInput): Promise<StorageSettings> {
    const ops: Array<Promise<unknown>> = [];

    this.pushPlainSettingUpdate(ops, SYSTEM_SETTING_KEYS.storageCosSecretId, input.cosSecretId, 'Tencent COS SecretId');
    this.pushPlainSettingUpdate(ops, SYSTEM_SETTING_KEYS.storageCosBucket, input.cosBucket, 'Tencent COS bucket');
    this.pushPlainSettingUpdate(ops, SYSTEM_SETTING_KEYS.storageCosRegion, input.cosRegion, 'Tencent COS region');
    this.pushPlainSettingUpdate(ops, SYSTEM_SETTING_KEYS.storageCosPublicBaseUrl, input.cosPublicBaseUrl, 'Tencent COS public base URL');
    this.pushPlainSettingUpdate(ops, SYSTEM_SETTING_KEYS.storageCosPrefix, input.cosPrefix, 'Tencent COS object prefix');

    if (typeof input.cosSecretKey === 'string' && !input.cosSecretKey.includes('****')) {
      const value = input.cosSecretKey.trim() ? this.encryption.encryptString(input.cosSecretKey.trim()) : '';
      ops.push(
        this.prisma.systemConfig.upsert({
          where: { key: SYSTEM_SETTING_KEYS.storageCosSecretKey },
          create: { key: SYSTEM_SETTING_KEYS.storageCosSecretKey, value, description: 'Tencent COS SecretKey (encrypted)' },
          update: { value },
        }),
      );
    }

    await Promise.all(ops);
    return this.getStorageSettingsForAdmin();
  }

  private pushPlainSettingUpdate(
    ops: Array<Promise<unknown>>,
    key: string,
    value: string | undefined,
    description: string,
  ) {
    if (typeof value !== 'string') return;
    ops.push(
      this.prisma.systemConfig.upsert({
        where: { key },
        create: { key, value: value.trim(), description },
        update: { value: value.trim() },
      }),
    );
  }

  private async loadStorageSettingsRowMapFromDb(): Promise<Record<string, string | null>> {
    const rows = await this.prisma.systemConfig.findMany({
      where: {
        key: {
          in: [...STORAGE_SETTINGS_KEYS],
        },
      },
    });

    const map: Record<string, string | null> = {};
    for (const row of rows) {
      map[row.key] = row.value ?? null;
    }

    return map;
  }

  private mapStorageSettingsFromRowMap(map: Record<string, string | null>, maskSecretKey: boolean): StorageSettings {
    const encryptedSecretKey = map[SYSTEM_SETTING_KEYS.storageCosSecretKey] ?? '';
    const cosSecretKey = encryptedSecretKey ? (this.encryption.decryptString(encryptedSecretKey) ?? '') : '';
    const settings = {
      cosSecretId: map[SYSTEM_SETTING_KEYS.storageCosSecretId] || DEFAULT_STORAGE_SETTINGS.cosSecretId,
      cosSecretKey: maskSecretKey ? this.maskSecret(cosSecretKey) : cosSecretKey,
      cosBucket: map[SYSTEM_SETTING_KEYS.storageCosBucket] || DEFAULT_STORAGE_SETTINGS.cosBucket,
      cosRegion: map[SYSTEM_SETTING_KEYS.storageCosRegion] || DEFAULT_STORAGE_SETTINGS.cosRegion,
      cosPublicBaseUrl: map[SYSTEM_SETTING_KEYS.storageCosPublicBaseUrl] || DEFAULT_STORAGE_SETTINGS.cosPublicBaseUrl,
      cosPrefix: map[SYSTEM_SETTING_KEYS.storageCosPrefix] || DEFAULT_STORAGE_SETTINGS.cosPrefix,
      cosConfigured: false,
    };

    settings.cosConfigured = Boolean(
      settings.cosSecretId.trim() &&
      cosSecretKey.trim() &&
      settings.cosBucket.trim() &&
      settings.cosRegion.trim(),
    );

    return settings;
  }

  private maskSecret(value: string) {
    if (!value) return '';
    if (value.length <= 8) return '****';
    return `${value.slice(0, 4)}****${value.slice(-4)}`;
  }
}
