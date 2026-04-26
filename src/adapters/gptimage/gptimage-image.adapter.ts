import axios from 'axios';

import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type OpenAIImageDataItem = {
  url?: string;
  b64_json?: string;
  revised_prompt?: string;
  [key: string]: unknown;
};

type OpenAIImagesResponse = {
  created?: number;
  data?: OpenAIImageDataItem[];
  [key: string]: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
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
  const m = value.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  return { contentType: m[1], base64: m[2] };
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

function decodeBase64(value: string) {
  const parsed = parseDataUrl(value);
  if (parsed) return { buffer: Buffer.from(normalizeBase64(parsed.base64), 'base64'), contentType: parsed.contentType };
  return { buffer: Buffer.from(normalizeBase64(value), 'base64'), contentType: 'application/octet-stream' };
}

async function loadImageInput(value: string) {
  const v = value.trim();
  if (isHttpUrl(v)) {
    const u = new URL(v);
    if (!isSafeRemoteHost(u.hostname)) throw new Error('Unsafe image host');

    const res = await axios.get<ArrayBuffer>(v, {
      responseType: 'arraybuffer',
      timeout: 60_000,
      maxContentLength: 25 * 1024 * 1024,
    });
    const contentType = (res.headers['content-type'] as string | undefined) ?? undefined;
    return { buffer: Buffer.from(res.data), contentType };
  }

  if (!isProbablyBase64(v)) throw new Error('Invalid image input (expected base64/dataUrl or https url)');
  return decodeBase64(v);
}

function inferImageExt(contentType: string | undefined) {
  if (!contentType) return 'png';
  const ct = contentType.split(';')[0]?.trim().toLowerCase();
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg';
  if (ct === 'image/webp') return 'webp';
  if (ct === 'image/png') return 'png';
  return 'png';
}

type GptImageOperation = 'generations' | 'edits';

function getOperation(params: ImageGenerateParams): GptImageOperation {
  const raw = asString((params as any).gptImageOperation) ?? asString((params as any).operation);
  const normalized = raw?.toLowerCase();
  if (!normalized || normalized === 'generate' || normalized === 'generation' || normalized === 'generations') return 'generations';
  if (normalized === 'edit' || normalized === 'edits' || normalized === 'mask') return 'edits';
  return normalized as GptImageOperation;
}

function toDataUrlFromB64(b64: string) {
  const v = b64.trim();
  if (v.startsWith('data:')) return v;
  return `data:image/png;base64,${v}`;
}

export class GptImageAdapter extends BaseImageAdapter {
  async submitTask(params: ImageGenerateParams): Promise<string> {
    const op = getOperation(params);

    if (op === 'generations') {
      const body = this.transformParams(params) as Record<string, unknown>;
      const res = await this.httpClient.post<OpenAIImagesResponse>('v1/images/generations', body, {
        headers: { Accept: 'application/json' },
      });

      const first = (res.data?.data ?? [])[0];
      const url = asString(first?.url);
      if (url) return `url:${url}`;

      const b64 = asString(first?.b64_json);
      if (b64) return `inline:${toDataUrlFromB64(b64)}`;

      throw new Error('GPT Image generations: missing url/b64_json in response');
    }

    if (op === 'edits') {
      const form = await this.buildEditsMultipart(params);
      const res = await this.httpClient.post<OpenAIImagesResponse>('v1/images/edits', form, {
        headers: { Accept: 'application/json' },
        maxBodyLength: Infinity,
      });

      const first = (res.data?.data ?? [])[0];
      const url = asString(first?.url);
      if (url) return `url:${url}`;

      const b64 = asString(first?.b64_json);
      if (b64) return `inline:${toDataUrlFromB64(b64)}`;

      throw new Error('GPT Image edits: missing url/b64_json in response');
    }

    throw new Error(`GPT Image adapter: unsupported operation ${op}`);
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const parsed = this.parseProviderTaskId(taskId);
    if (parsed) {
      if (parsed.kind === 'url') return { status: 'completed', resultUrls: [parsed.value], providerData: { url: parsed.value } };
      return { status: 'completed', resultUrls: [parsed.value], providerData: { inline: true } };
    }

    // GPT Image endpoints are synchronous in this implementation.
    return { status: 'processing' };
  }

  async getTaskResult(taskId: string): Promise<string[]> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls ?? [];
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Not supported
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as ImageGenerateParams;
    const op = getOperation(p);
    const errors: string[] = [];

    if (!asString(p.prompt)) errors.push('prompt is required');

    if (op === 'edits') {
      const image = (p as any).image ?? (p as any).imageUrl ?? (p as any).imageBase64 ?? (p as any).images;
      if (!image) errors.push('image (image/imageUrl/imageBase64/images) is required for edits');
    }

    const n = asNumber((p as any).n ?? (p as any)['n']);
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 10)) errors.push('n must be integer between 1 and 10');

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: ImageGenerateParams): unknown {
    const op = getOperation(params);
    if (op !== 'generations') return params;

    const body: Record<string, unknown> = {
      prompt: params.prompt,
    };

    const model = asString((params as any).model) ?? asString((params as any).gptImageModel) ?? asString((params as any).modelId);
    body.model = model ?? 'gpt-image-1.5';

    const n = asNumber((params as any).n ?? (params as any)['n']);
    body.n = n ?? 1;

    const size = asString((params as any).size);
    body.size = size ?? '1024x1024';

    // Pass through common optional fields if provided.
    const quality = asString((params as any).quality);
    if (quality) body.quality = quality;
    const responseFormat = asString((params as any).response_format);
    if (responseFormat) body.response_format = responseFormat;
    const background = asString((params as any).background);
    if (background) body.background = background;
    return body;
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

  private async buildEditsMultipart(params: ImageGenerateParams) {
    const form = new FormData();

    const images = (params as any).images ?? (params as any).imageArray;
    const single = asString((params as any).imageBase64) ?? asString((params as any).imageUrl) ?? asString((params as any).image);
    const list: string[] = Array.isArray(images) ? images.filter((x) => typeof x === 'string') : single ? [single] : [];
    if (!list.length) throw new Error('Missing image for edits');

    for (let i = 0; i < list.length; i += 1) {
      const { buffer, contentType } = await loadImageInput(list[i]);
      const ext = inferImageExt(contentType);
      const blob = new Blob([buffer], { type: contentType });
      form.append('image', blob, `image_${i + 1}.${ext}`);
    }

    form.append('prompt', params.prompt);

    const mask = asString((params as any).maskBase64) ?? asString((params as any).maskUrl) ?? asString((params as any).mask);
    if (mask) {
      const { buffer, contentType } = await loadImageInput(mask);
      const ext = inferImageExt(contentType);
      const blob = new Blob([buffer], { type: contentType });
      form.append('mask', blob, `mask.${ext}`);
    }

    const model = asString((params as any).model) ?? asString((params as any).gptImageModel);
    if (model) form.append('model', model);

    const n = asNumber((params as any).n ?? (params as any)['n']);
    if (n !== undefined) form.append('n', String(n));

    const size = asString((params as any).size);
    if (size) form.append('size', size);

    const quality = asString((params as any).quality);
    if (quality) form.append('quality', quality);

    const responseFormat = asString((params as any).response_format);
    if (responseFormat) form.append('response_format', responseFormat);

    const background = asString((params as any).background);
    if (background) form.append('background', background);

    return form;
  }
}
