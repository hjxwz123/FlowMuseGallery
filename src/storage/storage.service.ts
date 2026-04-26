import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { lookup as mimeLookup, extension as mimeExtension } from 'mime-types';
import { createHash, createHmac } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';

import { StorageSettingsService } from '../settings/storage-settings.service';
import type { StorageSettings } from '../settings/system-settings.constants';

export type VideoInputUploadKind = 'image' | 'video' | 'audio';
export type ProjectAssetUploadKind = 'image' | 'video';

export type StoredObject = {
  storageKey: string;
  url: string;
  contentType?: string;
  size?: number;
};

export type StoredImageResult = {
  original: StoredObject;
  thumbnail: StoredObject;
};

export type StoredProjectAssetResult = {
  original: StoredObject;
  thumbnail: StoredObject | null;
};

type CosProcessQueryValue = string | number;

type CosAvinfoResponse = {
  format?: {
    duration?: string | number | null;
  } | null;
  video?: {
    duration?: string | number | null;
  } | null;
  streams?: Array<{
    codec_type?: string | null;
    duration?: string | number | null;
  }> | null;
};

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDataUrl(value: string) {
  return /^data:[^;]+;base64,/i.test(value.trim());
}

function parseDataUrl(value: string): { contentType: string; base64: string } | null {
  const m = value.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  return { contentType: m[1], base64: m[2] };
}

function normalizeBase64(value: string) {
  return value.replace(/\s+/g, '');
}

function sha1Hex(input: Buffer) {
  return createHash('sha1').update(input).digest('hex');
}

function sha1Text(input: string) {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

function hmacSha1Hex(key: string | Buffer, input: string) {
  return createHmac('sha1', key).update(input, 'utf8').digest('hex');
}

function encodeObjectKeyPath(key: string) {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeObjectPrefix(prefix: string) {
  return prefix.trim().replace(/^\/+|\/+$/g, '');
}

function encodeCosQueryValue(value: string) {
  return encodeURIComponent(value);
}

function buildCosQueryString(query: Record<string, CosProcessQueryValue>) {
  const entries = Object.entries(query)
    .map(([key, value]) => [key.toLowerCase(), String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    queryString: entries
      .map(([key, value]) => `${encodeCosQueryValue(key)}=${encodeCosQueryValue(value)}`)
      .join('&'),
    paramList: entries.map(([key]) => key).join(';'),
  };
}

function isPrivateOrLocalHost(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map((item) => Number.parseInt(item, 10));
    if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (ipVersion === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  }

  return false;
}

function getVideoInputFolder(kind: VideoInputUploadKind) {
  if (kind === 'image') return 'video-inputs/images';
  if (kind === 'video') return 'video-inputs/videos';
  return 'video-inputs/audios';
}

@Injectable()
export class StorageService {
  constructor(
    private readonly config: ConfigService,
    private readonly storageSettings: StorageSettingsService,
  ) {}

  private localUploadRoot() {
    return join(process.cwd(), 'uploads');
  }

  private localPublicBaseUrl() {
    const base = (this.config.get<string>('APP_PUBLIC_URL') ?? '').trim();
    return base ? stripTrailingSlash(base) : '';
  }

  private async getCosConfig(): Promise<StorageSettings | null> {
    const settings = await this.storageSettings.getStorageSettings();
    if (
      !settings.cosSecretId.trim() ||
      !settings.cosSecretKey.trim() ||
      !settings.cosBucket.trim() ||
      !settings.cosRegion.trim()
    ) {
      return null;
    }
    return settings;
  }

  private toObjectUrl(key: string) {
    const base = this.localPublicBaseUrl();
    const path = `/uploads/${key}`;
    return base ? `${base}${path}` : path;
  }

  private toCosObjectKey(settings: StorageSettings, key: string) {
    const prefix = normalizeObjectPrefix(settings.cosPrefix);
    return prefix ? `${prefix}/${key}` : key;
  }

  private toCosObjectUrl(settings: StorageSettings, objectKey: string) {
    const publicBaseUrl = stripTrailingSlash(settings.cosPublicBaseUrl.trim());
    const encodedKey = encodeObjectKeyPath(objectKey);
    if (publicBaseUrl) return `${publicBaseUrl}/${encodedKey}`;
    return `https://${settings.cosBucket}.cos.${settings.cosRegion}.myqcloud.com/${encodedKey}`;
  }

  private buildCosAuthorization(input: {
    method: 'get' | 'put';
    objectPath: string;
    host: string;
    secretId: string;
    secretKey: string;
    query?: Record<string, CosProcessQueryValue>;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const signTime = `${now};${now + 3600}`;
    const keyTime = signTime;
    const headerList = 'host';
    const canonicalQuery = input.query ? buildCosQueryString(input.query) : { queryString: '', paramList: '' };
    const httpString = [
      input.method,
      input.objectPath,
      canonicalQuery.queryString,
      `host=${input.host}`,
    ].join('\n') + '\n';
    const stringToSign = [
      'sha1',
      signTime,
      sha1Text(httpString),
    ].join('\n') + '\n';
    const signKey = hmacSha1Hex(input.secretKey, keyTime);
    const signature = hmacSha1Hex(signKey, stringToSign);

    return [
      'q-sign-algorithm=sha1',
      `q-ak=${input.secretId}`,
      `q-sign-time=${signTime}`,
      `q-key-time=${keyTime}`,
      `q-header-list=${headerList}`,
      `q-url-param-list=${canonicalQuery.paramList}`,
      `q-signature=${signature}`,
    ].join('&');
  }

  private async putCosObject(settings: StorageSettings, objectKey: string, body: Buffer, contentType?: string) {
    const encodedKey = encodeObjectKeyPath(objectKey);
    const objectPath = `/${encodedKey}`;
    const host = `${settings.cosBucket}.cos.${settings.cosRegion}.myqcloud.com`;
    const authorization = this.buildCosAuthorization({
      method: 'put',
      objectPath,
      host,
      secretId: settings.cosSecretId.trim(),
      secretKey: settings.cosSecretKey.trim(),
    });

    await axios.put(`https://${host}${objectPath}`, body, {
      timeout: 300_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      headers: {
        Authorization: authorization,
        Host: host,
        'Content-Length': body.length,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
    });
  }

  private buildCosObjectRequest(settings: StorageSettings, objectKey: string, query?: Record<string, CosProcessQueryValue>) {
    const encodedKey = encodeObjectKeyPath(objectKey);
    const objectPath = `/${encodedKey}`;
    const host = `${settings.cosBucket}.cos.${settings.cosRegion}.myqcloud.com`;
    const queryString = query ? buildCosQueryString(query).queryString : '';
    const authorization = this.buildCosAuthorization({
      method: 'get',
      objectPath,
      host,
      secretId: settings.cosSecretId.trim(),
      secretKey: settings.cosSecretKey.trim(),
      query,
    });

    return {
      url: `https://${host}${objectPath}${queryString ? `?${queryString}` : ''}`,
      headers: {
        Authorization: authorization,
        Host: host,
      },
    };
  }

  private async localWriteFile(key: string, body: Buffer) {
    const destPath = join(this.localUploadRoot(), key);
    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, body);
    return destPath;
  }

  private async localWriteStream(key: string, stream: NodeJS.ReadableStream) {
    const destPath = join(this.localUploadRoot(), key);
    await mkdir(dirname(destPath), { recursive: true });
    await pipeline(stream, createWriteStream(destPath));
    return destPath;
  }

  private inferExtFromContentType(contentType: string | undefined) {
    if (!contentType) return '';
    const clean = contentType.split(';')[0]?.trim();
    if (!clean) return '';
    const ext = mimeExtension(clean);
    return ext ? `.${ext}` : '';
  }

  private inferExtFromUrl(url: string) {
    try {
      const u = new URL(url);
      const e = extname(u.pathname);
      if (e && e.length <= 10) return e;
      return '';
    } catch {
      return '';
    }
  }

  private async fetchUrlToBuffer(url: string, timeoutMs = 300_000) {
    const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer', timeout: timeoutMs });
    const contentType = (res.headers['content-type'] as string | undefined) ?? undefined;
    const buffer = Buffer.from(res.data);
    return { buffer, contentType };
  }

  private async fetchUrlToJson<T>(url: string, timeoutMs = 300_000, headers?: Record<string, string>) {
    const res = await axios.get<T>(url, { responseType: 'json', timeout: timeoutMs, headers });
    return res.data;
  }

  private async fetchUrlToBufferWithHeaders(url: string, timeoutMs: number, headers: Record<string, string>) {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      headers,
    });
    const contentType = (res.headers['content-type'] as string | undefined) ?? undefined;
    const buffer = Buffer.from(res.data);
    return { buffer, contentType };
  }

  private async fetchUrlToStream(url: string, timeoutMs = 300_000) {
    const res = await axios.get(url, { responseType: 'stream', timeout: timeoutMs });
    const contentType = (res.headers['content-type'] as string | undefined) ?? undefined;
    const contentLengthHeader = (res.headers['content-length'] as string | undefined) ?? undefined;
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    return { stream: res.data as NodeJS.ReadableStream, contentType, contentLength };
  }

  private decodeBase64ToBuffer(value: string) {
    const parsed = parseDataUrl(value);
    if (parsed) {
      const buffer = Buffer.from(normalizeBase64(parsed.base64), 'base64');
      return { buffer, contentType: parsed.contentType };
    }

    const buffer = Buffer.from(normalizeBase64(value), 'base64');
    return { buffer, contentType: undefined };
  }

  private async putObject(folder: string, baseName: string, body: Buffer, contentType?: string, extOverride?: string): Promise<StoredObject> {
    const ext = extOverride || this.inferExtFromContentType(contentType) || '';
    const key = `${folder}/${baseName}${ext}`;

    const cosConfig = await this.getCosConfig();
    if (cosConfig) {
      const objectKey = this.toCosObjectKey(cosConfig, key);
      await this.putCosObject(cosConfig, objectKey, body, contentType);
      return { storageKey: objectKey, url: this.toCosObjectUrl(cosConfig, objectKey), contentType, size: body.length };
    }

    await this.localWriteFile(key, body);
    return { storageKey: key, url: this.toObjectUrl(key), contentType, size: body.length };
  }

  private async loadToBuffer(urlOrBase64: string) {
    if (isHttpUrl(urlOrBase64)) return this.fetchUrlToBuffer(urlOrBase64);
    return this.decodeBase64ToBuffer(urlOrBase64);
  }

  isLocalObjectUrl(value: string) {
    const raw = String(value || '').trim();
    if (!raw || isDataUrl(raw)) return false;
    if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) return true;

    if (!isHttpUrl(raw)) return false;

    try {
      const parsed = new URL(raw);
      if (!parsed.pathname.startsWith('/uploads/')) return false;
      if (isPrivateOrLocalHost(parsed.hostname)) return true;

      const localBase = this.localPublicBaseUrl();
      if (!localBase) return false;
      const localParsed = new URL(localBase);
      return parsed.origin === localParsed.origin;
    } catch {
      return false;
    }
  }

  isPublicRemoteUrl(value: string) {
    const raw = String(value || '').trim();
    if (!isHttpUrl(raw)) return false;
    try {
      const parsed = new URL(raw);
      if (isPrivateOrLocalHost(parsed.hostname)) return false;
      return !this.isLocalObjectUrl(raw);
    } catch {
      return false;
    }
  }

  private localObjectUrlToKey(value: string) {
    const raw = String(value || '').trim();
    if (raw.startsWith('/uploads/')) return decodeURIComponent(raw.slice('/uploads/'.length).split(/[?#]/)[0] ?? '');
    if (raw.startsWith('uploads/')) return decodeURIComponent(raw.slice('uploads/'.length).split(/[?#]/)[0] ?? '');

    const parsed = new URL(raw);
    return decodeURIComponent(parsed.pathname.slice('/uploads/'.length));
  }

  private localObjectPathFromUrl(value: string) {
    const key = this.localObjectUrlToKey(value);
    const root = resolve(this.localUploadRoot());
    const filePath = resolve(root, key);
    if (filePath !== root && !filePath.startsWith(`${root}/`)) {
      throw new BadRequestException('Invalid local media path');
    }
    return filePath;
  }

  async localImageUrlToDataUrl(value: string) {
    const filePath = this.localObjectPathFromUrl(value);
    const buffer = await readFile(filePath);
    const contentType = (mimeLookup(filePath) || 'image/png') as string;
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  async normalizeImageReferenceUrl(value: string) {
    const raw = String(value || '').trim();
    if (!raw || isDataUrl(raw)) return raw;
    if (this.isLocalObjectUrl(raw)) return this.localImageUrlToDataUrl(raw);
    return raw;
  }

  normalizePublicVideoReferenceUrl(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return raw;
    if (this.isLocalObjectUrl(raw)) {
      throw new BadRequestException('请配置 OSS 后再使用本地媒体作为参考素材');
    }
    if (isHttpUrl(raw) && !this.isPublicRemoteUrl(raw)) {
      throw new BadRequestException('请配置 OSS 后再使用本地媒体作为参考素材');
    }
    return raw;
  }

  async normalizeImageGenerateParams<T extends Record<string, unknown>>(params: T): Promise<T> {
    const next = { ...params } as Record<string, unknown>;
    await this.normalizeImageFields(next, ['image', 'imageUrl', 'imageBase64']);
    await this.normalizeStringArrayField(next, 'images', (value) => this.normalizeImageReferenceUrl(value));
    await this.normalizeStringArrayField(next, 'imageArray', (value) => this.normalizeImageReferenceUrl(value));
    return next as T;
  }

  async normalizeVideoGenerateParams<T extends Record<string, unknown>>(params: T): Promise<T> {
    const next = { ...params } as Record<string, unknown>;

    await this.normalizeImageFields(next, [
      'firstFrame',
      'first_frame',
      'firstFrameImage',
      'first_frame_image',
      'lastFrame',
      'last_frame',
      'referenceImage',
    ]);
    await this.normalizeStringArrayField(next, 'referenceImages', (value) => this.normalizeImageReferenceUrl(value));
    await this.normalizeStringArrayField(next, 'reference_images', (value) => this.normalizeImageReferenceUrl(value));

    this.normalizeVideoFields(next, [
      'referenceVideo',
      'reference_video',
      'firstClip',
      'first_clip',
      'audioUrl',
      'audio_url',
      'drivingAudio',
      'driving_audio',
    ]);
    this.normalizeVideoArrayField(next, 'referenceVideos');
    this.normalizeVideoArrayField(next, 'reference_videos');
    this.normalizeVideoArrayField(next, 'referenceAudios');
    this.normalizeVideoArrayField(next, 'reference_audios');

    await this.normalizeMediaArrayField(next, 'media');
    await this.normalizeReferenceSequenceField(next);

    return next as T;
  }

  private async normalizeImageFields(target: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = target[key];
      if (typeof value === 'string' && value.trim()) {
        target[key] = await this.normalizeImageReferenceUrl(value);
      } else if (Array.isArray(value)) {
        target[key] = await Promise.all(
          value.map((item) => typeof item === 'string' ? this.normalizeImageReferenceUrl(item) : item),
        );
      }
    }
  }

  private normalizeVideoFields(target: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = target[key];
      if (typeof value === 'string' && value.trim()) {
        target[key] = this.normalizePublicVideoReferenceUrl(value);
      } else if (Array.isArray(value)) {
        target[key] = value.map((item) => typeof item === 'string' ? this.normalizePublicVideoReferenceUrl(item) : item);
      }
    }
  }

  private async normalizeStringArrayField(
    target: Record<string, unknown>,
    key: string,
    normalize: (value: string) => Promise<string>,
  ) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      target[key] = [await normalize(value)];
      return;
    }
    if (!Array.isArray(value)) return;
    target[key] = await Promise.all(
      value.map((item) => typeof item === 'string' ? normalize(item) : item),
    );
  }

  private normalizeVideoArrayField(target: Record<string, unknown>, key: string) {
    const value = target[key];
    if (typeof value === 'string' && value.trim()) {
      target[key] = [this.normalizePublicVideoReferenceUrl(value)];
      return;
    }
    if (!Array.isArray(value)) return;
    target[key] = value.map((item) => typeof item === 'string' ? this.normalizePublicVideoReferenceUrl(item) : item);
  }

  private async normalizeMediaArrayField(target: Record<string, unknown>, key: string) {
    const value = target[key];
    if (!Array.isArray(value)) return;

    const normalized = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        normalized.push(item);
        continue;
      }
      const record = { ...(item as Record<string, unknown>) };
      const type = typeof record.type === 'string' ? record.type : '';
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (url) {
        if (type.includes('video') || type.includes('clip') || type.includes('audio') || type.includes('voice')) {
          record.url = this.normalizePublicVideoReferenceUrl(url);
        } else if (type.includes('image') || type.includes('frame')) {
          record.url = await this.normalizeImageReferenceUrl(url);
        }
      }
      normalized.push(record);
    }
    target[key] = normalized;
  }

  private async normalizeReferenceSequenceField(target: Record<string, unknown>) {
    const value = target.referenceSequence ?? target.reference_sequence;
    if (!Array.isArray(value)) return;

    const normalized = [];
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        normalized.push(item);
        continue;
      }
      const record = { ...(item as Record<string, unknown>) };
      const kind = typeof record.kind === 'string' ? record.kind : '';
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      if (url) {
        if (kind === 'video' || kind === 'audio') {
          record.url = this.normalizePublicVideoReferenceUrl(url);
        } else if (kind === 'image') {
          record.url = await this.normalizeImageReferenceUrl(url);
        }
      }
      normalized.push(record);
    }

    if (Array.isArray(target.referenceSequence)) target.referenceSequence = normalized;
    if (Array.isArray(target.reference_sequence)) target.reference_sequence = normalized;
  }

  async saveImageResult(urlOrBase64: string, taskNo: string): Promise<StoredImageResult> {
    const { buffer, contentType } = await this.loadToBuffer(urlOrBase64);
    const originalExt = this.inferExtFromUrl(urlOrBase64) || this.inferExtFromContentType(contentType) || '.png';

    const original = await this.putObject('images', taskNo, buffer, contentType, originalExt);

    const thumbBuffer = await sharp(buffer)
      .resize({ width: 512, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbBaseName = `${taskNo}_thumb_${sha1Hex(thumbBuffer).slice(0, 8)}`;
    const thumbnail = await this.putObject('thumbnails', thumbBaseName, thumbBuffer, 'image/jpeg', '.jpg');

    return { original, thumbnail };
  }

  async saveVideoThumbnailFromVideoUrl(videoUrl: string, taskNo: string): Promise<StoredObject> {
    return this.saveVideoLastFrameFromVideoUrl({ videoUrl, taskNo });
  }

  private toPositiveNumber(value: unknown) {
    const numeric =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  private extractVideoDurationFromAvinfo(payload: CosAvinfoResponse) {
    const candidates: unknown[] = [
      payload?.format?.duration,
      payload?.video?.duration,
      ...(payload?.streams ?? [])
        .filter((stream) => stream?.codec_type === 'video')
        .map((stream) => stream?.duration),
    ];

    for (const candidate of candidates) {
      const duration = this.toPositiveNumber(candidate);
      if (duration !== null) return duration;
    }

    return null;
  }

  private formatSnapshotTime(seconds: number) {
    const normalized = Math.max(0, seconds);
    const fixed = normalized.toFixed(3);
    return fixed.replace(/\.?0+$/, '') || '0';
  }

  private buildLastFrameCandidateTimes(durationSeconds: number) {
    const offsets = [0.001, 0.03, 0.1, 0.3];
    const seen = new Set<string>();
    const times: string[] = [];

    for (const offset of offsets) {
      const time = this.formatSnapshotTime(Math.max(durationSeconds - offset, 0));
      if (seen.has(time)) continue;
      seen.add(time);
      times.push(time);
    }

    if (times.length === 0) {
      times.push('0');
    }

    return times;
  }

  async saveVideoLastFrameFromVideoUrl(input: {
    videoUrl: string;
    objectKey?: string | null;
    taskNo: string;
  }): Promise<StoredObject> {
    const cosConfig = await this.getCosConfig();
    if (!cosConfig || !input.objectKey) {
      throw new Error('请配置腾讯云 COS 并开启数据万象后生成视频尾帧缩略图');
    }

    const avinfoRequest = this.buildCosObjectRequest(cosConfig, input.objectKey, {
      'ci-process': 'avinfo',
    });
    const avinfo = await this.fetchUrlToJson<CosAvinfoResponse>(avinfoRequest.url, 120_000, avinfoRequest.headers);
    const durationSeconds = this.extractVideoDurationFromAvinfo(avinfo);
    if (durationSeconds === null) {
      throw new Error('无法从数据万象 avinfo 获取视频时长');
    }

    let lastErr: unknown = null;
    for (const time of this.buildLastFrameCandidateTimes(durationSeconds)) {
      try {
        const snapshotRequest = this.buildCosObjectRequest(cosConfig, input.objectKey, {
          'ci-process': 'snapshot',
          time,
          format: 'jpg',
          rotate: 'auto',
          mode: 'exactframe',
        });
        const { buffer, contentType } = await this.fetchUrlToBufferWithHeaders(
          snapshotRequest.url,
          120_000,
          snapshotRequest.headers,
        );
        const baseName = `${input.taskNo}_last_${sha1Hex(buffer).slice(0, 8)}`;
        return this.putObject('thumbnails', baseName, buffer, contentType ?? 'image/jpeg', '.jpg');
      } catch (error) {
        lastErr = error;
      }
    }

    throw lastErr instanceof Error ? lastErr : new Error('数据万象截取视频尾帧失败');
  }

  async saveVideoResult(urlOrBase64: string, taskNo: string): Promise<StoredObject> {
    if (isHttpUrl(urlOrBase64)) {
      const { buffer, contentType } = await this.fetchUrlToBuffer(urlOrBase64);
      const ext = this.inferExtFromUrl(urlOrBase64) || this.inferExtFromContentType(contentType) || '.mp4';
      return this.putObject('videos', taskNo, buffer, contentType, ext);
    }

    const { buffer, contentType } = this.decodeBase64ToBuffer(urlOrBase64);
    const ext = this.inferExtFromContentType(contentType) || '.mp4';
    return this.putObject('videos', taskNo, buffer, contentType, ext);
  }

  async uploadVideoInput(
    fileBuffer: Buffer,
    originalName: string,
    kind: VideoInputUploadKind,
    contentType?: string,
  ): Promise<StoredObject> {
    const ext = extname(originalName) || this.inferExtFromContentType(contentType) || '';
    const baseName = `input_${Date.now()}_${sha1Hex(fileBuffer).slice(0, 12)}`;
    const resolvedContentType = contentType ?? ((mimeLookup(originalName) || undefined) as string | undefined);
    return this.putObject(getVideoInputFolder(kind), baseName, fileBuffer, resolvedContentType, ext);
  }

  async uploadAvatar(fileBuffer: Buffer, originalName: string, userId: bigint): Promise<StoredObject> {
    const ext = extname(originalName) || '.jpg';
    const baseName = `avatar_${userId.toString()}_${Date.now()}_${sha1Hex(fileBuffer).slice(0, 8)}`;
    const contentType = (mimeLookup(originalName) || undefined) as string | undefined;
    return this.putObject('avatars', baseName, fileBuffer, contentType, ext);
  }

  async saveProjectImageUpload(
    fileBuffer: Buffer,
    originalName: string,
    contentType?: string,
  ): Promise<StoredProjectAssetResult> {
    const resolvedContentType = contentType ?? ((mimeLookup(originalName) || undefined) as string | undefined);
    const originalExt = extname(originalName) || this.inferExtFromContentType(resolvedContentType) || '.png';
    const baseName = `project_img_${Date.now()}_${sha1Hex(fileBuffer).slice(0, 12)}`;

    const original = await this.putObject('project-assets/images', baseName, fileBuffer, resolvedContentType, originalExt);
    const thumbBuffer = await sharp(fileBuffer)
      .resize({ width: 512, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbBaseName = `${baseName}_thumb_${sha1Hex(thumbBuffer).slice(0, 8)}`;
    const thumbnail = await this.putObject('project-assets/thumbnails', thumbBaseName, thumbBuffer, 'image/jpeg', '.jpg');

    return { original, thumbnail };
  }

  async saveProjectVideoUpload(
    fileBuffer: Buffer,
    originalName: string,
    contentType?: string,
  ): Promise<StoredProjectAssetResult> {
    const resolvedContentType = contentType ?? ((mimeLookup(originalName) || undefined) as string | undefined);
    const ext = extname(originalName) || this.inferExtFromContentType(resolvedContentType) || '.mp4';
    const baseName = `project_vid_${Date.now()}_${sha1Hex(fileBuffer).slice(0, 12)}`;
    const original = await this.putObject('project-assets/videos', baseName, fileBuffer, resolvedContentType, ext);

    let thumbnail: StoredObject | null = null;
    try {
      thumbnail = await this.saveVideoLastFrameFromVideoUrl({
        videoUrl: original.url,
        objectKey: original.storageKey,
        taskNo: baseName,
      });
    } catch {
      thumbnail = null;
    }

    return { original, thumbnail };
  }

  async saveProjectDocumentUpload(
    fileBuffer: Buffer,
    originalName: string,
    contentType?: string,
  ): Promise<StoredProjectAssetResult> {
    const resolvedContentType = contentType ?? ((mimeLookup(originalName) || undefined) as string | undefined);
    const ext = extname(originalName) || '.bin';
    const baseName = `project_doc_${Date.now()}_${sha1Hex(fileBuffer).slice(0, 12)}`;
    const original = await this.putObject('project-assets/documents', baseName, fileBuffer, resolvedContentType, ext);
    return { original, thumbnail: null };
  }
}
