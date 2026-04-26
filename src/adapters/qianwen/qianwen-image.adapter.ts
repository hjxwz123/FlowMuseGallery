import axios from 'axios';

import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type QwenMessageContentItem = {
  image?: string;
  text?: string;
  [key: string]: unknown;
};

type QwenGenerationResponse = {
  output?: {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        role?: string;
        content?: QwenMessageContentItem[];
      };
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  usage?: {
    image_count?: number;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  request_id?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseDataUrl(value: string): { contentType: string; base64: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) return null;
  return { contentType: match[1], base64: match[2] };
}

function normalizeBase64(value: string) {
  return value.replace(/\s+/g, '');
}

function isProbablyBase64(value: string) {
  if (!value) return false;
  if (value.startsWith('data:')) return true;
  if (value.length < 64) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function isSafeRemoteHost(hostname: string) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;
  if (h.endsWith('.local')) return false;
  return true;
}

async function loadImageInput(value: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const trimmed = value.trim();
  if (isHttpUrl(trimmed)) {
    const parsed = new URL(trimmed);
    if (!isSafeRemoteHost(parsed.hostname)) throw new Error('Unsafe imageUrl host');

    const response = await axios.get<ArrayBuffer>(trimmed, {
      responseType: 'arraybuffer',
      timeout: 120_000,
      maxContentLength: 25 * 1024 * 1024,
    });
    const contentType = (response.headers['content-type'] as string | undefined) ?? undefined;
    return { buffer: Buffer.from(response.data), contentType };
  }

  const dataUrl = parseDataUrl(trimmed);
  if (dataUrl) {
    return {
      buffer: Buffer.from(normalizeBase64(dataUrl.base64), 'base64'),
      contentType: dataUrl.contentType,
    };
  }

  if (!isProbablyBase64(trimmed)) throw new Error('Invalid image input (expected base64/dataUrl or https url)');
  return {
    buffer: Buffer.from(normalizeBase64(trimmed), 'base64'),
    contentType: undefined,
  };
}

function inferMimeType(contentType?: string) {
  const normalized = contentType?.split(';')[0]?.trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg';
  if (normalized === 'image/webp') return 'image/webp';
  if (normalized === 'image/gif') return 'image/gif';
  return 'image/png';
}

function toDataUrl(value: { buffer: Buffer; contentType?: string }) {
  const mimeType = inferMimeType(value.contentType);
  return `data:${mimeType};base64,${value.buffer.toString('base64')}`;
}

function collectImageInputs(params: ImageGenerateParams): string[] {
  const images = (params as any).images ?? (params as any).imageArray;
  const single =
    asString((params as any).imageBase64) ??
    asString((params as any).imageUrl) ??
    asString((params as any).image);

  const list: string[] = Array.isArray(images) ? images.filter((item) => typeof item === 'string') : single ? [single] : [];
  return list.map((item) => item.trim()).filter(Boolean);
}

function pickResultImage(response: QwenGenerationResponse): string | undefined {
  const choices = Array.isArray(response.output?.choices) ? response.output?.choices : [];
  for (const choice of choices) {
    const content = Array.isArray(choice?.message?.content) ? choice.message.content : [];
    for (const item of content) {
      const image = asString(item?.image);
      if (image) return image;
    }
  }
  return undefined;
}

export class QianwenImageAdapter extends BaseImageAdapter {
  async submitTask(params: ImageGenerateParams): Promise<string> {
    const body = await this.buildRequestBody(params);
    const response = await this.httpClient.post<QwenGenerationResponse>(this.getGenerationPath(), body, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      maxBodyLength: Infinity,
      timeout: Math.max(this.channel.timeout ?? 120_000, 180_000),
    });

    const data = response.data ?? {};
    if (data.message) {
      const code = asString(data.code);
      throw new Error(code ? `${code}: ${data.message}` : data.message);
    }

    const image = pickResultImage(data);
    if (!image) throw new Error('Qwen image generation: missing image url in response');

    if (image.startsWith('data:')) return `inline:${image}`;
    if (isHttpUrl(image)) return `url:${image}`;
    return `inline:data:image/png;base64,${normalizeBase64(image)}`;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const parsed = this.parseProviderTaskId(taskId);
    if (parsed) {
      if (parsed.kind === 'url') {
        return { status: 'completed', resultUrls: [parsed.value], providerData: { url: parsed.value } };
      }
      return { status: 'completed', resultUrls: [parsed.value], providerData: { inline: true } };
    }

    return { status: 'processing' };
  }

  async getTaskResult(taskId: string): Promise<string[]> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls ?? [];
  }

  async cancelTask(_taskId: string): Promise<void> {
    // DashScope multimodal-generation does not expose cancellation in this adapter.
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as ImageGenerateParams;
    const errors: string[] = [];

    if (!asString(p.prompt)) errors.push('prompt is required');

    const model = asString((p as any).model) ?? asString((p as any).qwenModel) ?? asString((p as any).qianwenModel);
    if (!model) errors.push('model is required (model/qwenModel/qianwenModel)');

    const n = asNumber((p as any).n);
    if (n !== undefined && (!Number.isInteger(n) || n < 1)) errors.push('n must be a positive integer');

    const size = asString((p as any).size);
    if (size && !/^\d+\*\d+$/.test(size)) errors.push('size must use WIDTH*HEIGHT format, for example 2048*2048');

    const watermark = (p as any).watermark;
    if (watermark !== undefined && typeof watermark !== 'boolean') errors.push('watermark must be boolean');

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: ImageGenerateParams): unknown {
    const promptText = this.buildPromptText(params);
    return {
      model:
        asString((params as any).model) ??
        asString((params as any).qwenModel) ??
        asString((params as any).qianwenModel),
      input: {
        messages: [
          {
            role: 'user',
            content: [{ text: promptText }],
          },
        ],
      },
      parameters: {
        n: asNumber((params as any).n) ?? 1,
        watermark: typeof (params as any).watermark === 'boolean' ? (params as any).watermark : false,
        size: asString((params as any).size) ?? '1024*1024',
      },
    };
  }

  private parseProviderTaskId(taskId: string): { kind: 'url' | 'inline'; value: string } | null {
    const raw = String(taskId ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('url:')) return { kind: 'url', value: raw.slice(4) };
    if (raw.startsWith('inline:')) return { kind: 'inline', value: raw.slice(7) };
    if (raw.startsWith('data:')) return { kind: 'inline', value: raw };
    if (isHttpUrl(raw)) return { kind: 'url', value: raw };
    return null;
  }

  private buildPromptText(params: ImageGenerateParams) {
    const prompt = asString(params.prompt) ?? '';
    const negativePrompt = asString((params as any).negativePrompt);
    if (!negativePrompt) return prompt;
    return `${prompt}\n\nNegative prompt: ${negativePrompt}`;
  }

  private getGenerationPath() {
    const rawBase = String(this.channel.baseUrl ?? '').trim();
    const base = String(this.channel.baseUrl ?? '').toLowerCase();
    if (base.includes('/api/v1/services/aigc/multimodal-generation/generation')) return rawBase.replace(/\/+$/, '');
    if (base.includes('/api/v1/services/aigc/multimodal-generation/')) return 'generation';
    if (base.includes('/api/v1/services/aigc/')) return 'multimodal-generation/generation';
    if (base.includes('/api/v1/')) return 'services/aigc/multimodal-generation/generation';
    return 'api/v1/services/aigc/multimodal-generation/generation';
  }

  private async buildRequestBody(params: ImageGenerateParams): Promise<Record<string, unknown>> {
    const body = this.transformParams(params) as Record<string, unknown>;
    const images = collectImageInputs(params);
    if (images.length === 0) return body;

    const content: QwenMessageContentItem[] = [];
    for (const image of images) {
      const loaded = await loadImageInput(image);
      content.push({ image: toDataUrl(loaded) });
    }
    content.push({ text: this.buildPromptText(params) });

    return {
      ...body,
      input: {
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      },
    };
  }
}
