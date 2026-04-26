import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';
import { HttpService } from '../base/http.service';
import axios from 'axios';

export class NanobananaImageAdapter extends BaseImageAdapter {
  protected override createHttpClient(): HttpService {
    const extraHeaders = (this.channel.extraHeaders ?? {}) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string') headers[key] = value;
      else if (typeof value === 'number' || typeof value === 'boolean') headers[key] = String(value);
    }

    // Gemini API Key auth (REST): x-goog-api-key
    if (this.channel.apiKey) headers['x-goog-api-key'] = this.channel.apiKey;

    return new HttpService({
      baseURL: this.channel.baseUrl,
      timeout: this.channel.timeout,
      headers,
    });
  }

  async submitTask(params: ImageGenerateParams): Promise<string> {
    const model = asString((params as any).model) ?? 'gemini-2.5-flash-image';

    const body = (await this.buildRequestBody(params)) as Record<string, unknown>;

    const path = this.getGenerateContentPath();
    const url = `${path}models/${encodeURIComponent(model)}:generateContent`;

    const startTime = Date.now();

    try {
      const res = await this.httpClient.post<GeminiGenerateContentResponse>(
        url,
        body,
        {
          headers: { Accept: 'application/json' },
          maxBodyLength: Infinity,
          // 增加超时时间到 5 分钟，避免大图生成时超时
          timeout: Math.max(this.channel.timeout ?? 120_000, 300_000),
        }
      );

      const elapsed = Date.now() - startTime;

      const parsed = pickBestInlineImage(res.data);
      if (!parsed) {
        const err = (res.data as any)?.error?.message;
        if (typeof err === 'string' && err.trim()) throw new Error(err);
        throw new Error('Nanobanana: missing inline image in response');
      }

      const { mimeType, base64 } = parsed;
      const dataUrl = `data:${mimeType || 'image/png'};base64,${base64}`;

      // Synchronous: return inline image data (local runner saves it under uploads/).
      // Note: providerTaskId is NOT persisted for inline/url fast-path.
      return `inline:${dataUrl}`;
    } catch (error: any) {
      const elapsed = Date.now() - startTime;

      // 增强错误信息，包含详细的调试信息
      if (error.code === 'ECONNABORTED' || error.code === 23) {
        throw new Error(
          `Nanobanana request timeout after ${elapsed}ms (model: ${model}, channel: ${this.channel.name}). ` +
          `Troubleshooting: 1) Verify baseURL "${this.channel.baseUrl}" is correct, ` +
          `2) Check API key is valid (configured: ${!!this.channel.apiKey}), ` +
          `3) Test network connectivity to API endpoint, ` +
          `4) Consider increasing channel timeout (current: ${this.channel.timeout}ms).`
        );
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error(
          `Nanobanana connection timeout (model: ${model}, elapsed: ${elapsed}ms). ` +
          `Check network connection and firewall settings.`
        );
      }
      if (error.response?.status === 429) {
        throw new Error('Nanobanana rate limit exceeded. Please wait and try again.');
      }
      if (error.response?.status === 403) {
        throw new Error(
          `Nanobanana API key invalid or insufficient permissions (channel: ${this.channel.name}). ` +
          `Verify the x-goog-api-key header is correct.`
        );
      }
      if (error.response?.status === 404) {
        throw new Error(
          `Nanobanana API endpoint not found. Verify baseURL "${this.channel.baseUrl}" and model "${model}" are correct.`
        );
      }
      if (error.response?.data?.error?.message) {
        throw new Error(`Nanobanana API error: ${error.response.data.error.message}`);
      }
      // 保留原始错误消息但添加上下文
      throw new Error(
        `Nanobanana request failed after ${elapsed}ms (${error.message || 'Unknown error'}). ` +
        `Channel: ${this.channel.name}, Model: ${model}, BaseURL: ${this.channel.baseUrl}`
      );
    }
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const parsed = this.parseProviderTaskId(taskId);
    if (parsed) {
      if (parsed.kind === 'url') return { status: 'completed', resultUrls: [parsed.value], providerData: { url: parsed.value } };
      return { status: 'completed', resultUrls: [parsed.value], providerData: { inline: true } };
    }
    // Synchronous only
    return { status: 'processing' };
  }

  async getTaskResult(taskId: string): Promise<string[]> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls ?? [];
  }

  async cancelTask(_taskId: string): Promise<void> {
    // Not supported
  }

  validateParams(_params: unknown): ValidationResult {
    const params = (_params ?? {}) as ImageGenerateParams;
    const errors: string[] = [];

    if (!asString(params.prompt)) errors.push('prompt is required');

    const model = asString((params as any).model) ?? asString((params as any).nanobananaModel);
    const effectiveModel = model ?? 'gemini-2.5-flash-image';

    const images = collectImageInputs(params);
    if (images.length) {
      const max = effectiveModel === 'gemini-3-pro-image-preview' ? 14 : 3;
      if (images.length > max) errors.push(`too many images: ${images.length} (max ${max} for ${effectiveModel})`);
    }

    const imageSize = asString((params as any).imageSize ?? (params as any).image_size);
    if (imageSize && !['2K', '4K'].includes(imageSize)) errors.push('imageSize must be 2K/4K');

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: ImageGenerateParams): unknown {
    // Note: actual image loading (https URL -> base64) is async and performed in submitTask.
    // transformParams is kept as a sync representation for debugging/inspection.
    const parts: GeminiPartInput[] = [{ text: params.prompt }];

    const aspectRatio = asString((params as any).aspectRatio ?? (params as any).aspect_ratio);
    const imageSize = asString((params as any).imageSize ?? (params as any).image_size);
    const responseModalities =
      Array.isArray((params as any).responseModalities) ? (params as any).responseModalities : (params as any).response_modalities;

    const generationConfig: Record<string, unknown> = {};
    generationConfig.responseModalities = ['IMAGE'];

    const imageConfig: Record<string, unknown> = {};
    if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
    // image_size only meaningful for gemini-3-pro-image-preview, but harmless to send.
    if (imageSize) imageConfig.imageSize = imageSize;
    if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;

    // Allow optional tools (e.g., google_search) for gemini-3-pro-image-preview if caller passes it through.
    const tools = (params as any).tools;

    return {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      ...(tools ? { tools } : {}),
      ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    };
  }

  private getGenerateContentPath() {
    const base = String(this.channel.baseUrl ?? '').toLowerCase();
    if (base.includes('/v1beta') || base.endsWith('v1beta/') || base.endsWith('v1beta')) return '';
    return 'v1beta/';
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

  private async buildRequestBody(params: ImageGenerateParams): Promise<Record<string, unknown>> {
    const base = this.transformParams(params) as Record<string, unknown>;

    const images = collectImageInputs(params);
    if (!images.length) return base;

    const imageFirst = Boolean((params as any).imageFirst ?? (params as any).nanobananaImageFirst);
    const imageParts = await this.buildInlineImageParts(params, images);

    const content0 = (base.contents as any)?.[0] ?? { role: 'user', parts: [] };
    const textParts = Array.isArray(content0.parts) ? content0.parts.filter((p: any) => p && typeof p.text === 'string') : [];
    const textPart = textParts[0] ?? { text: params.prompt };

    const parts: GeminiPartInput[] = imageFirst ? [...imageParts, textPart] : [textPart, ...imageParts];
    return {
      ...base,
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
    };
  }

  private async buildInlineImageParts(params: ImageGenerateParams, inputs: string[]): Promise<GeminiPartInput[]> {
    const explicitDefaultMime = asString((params as any).imageMimeType ?? (params as any).mimeType ?? (params as any).mime_type);
    const explicitMimeList = Array.isArray((params as any).imageMimeTypes) ? (params as any).imageMimeTypes : undefined;

    const out: GeminiPartInput[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const raw = inputs[i];
      const parsed = parseDataUrl(raw.trim());
      if (parsed) {
        out.push({
          inline_data: {
            mime_type: parsed.contentType,
            data: normalizeBase64(parsed.base64),
          },
        });
        continue;
      }

      const { buffer, contentType } = await loadImageInput(raw);
      const mimeType =
        asString(explicitMimeList?.[i]) ??
        explicitDefaultMime ??
        inferMimeType(contentType);

      out.push({
        inline_data: {
          mime_type: mimeType,
          data: buffer.toString('base64'),
        },
      });
    }

    return out;
  }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<Record<string, unknown>>;
    };
  }>;
  error?: { message?: string; [key: string]: unknown };
  [key: string]: unknown;
};

type GeminiPartInput =
  | { text: string }
  | {
      inline_data: {
        mime_type: string;
        data: string;
      };
    };

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
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

async function loadImageInput(value: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const v = value.trim();
  if (isHttpUrl(v)) {
    const u = new URL(v);
    if (!isSafeRemoteHost(u.hostname)) throw new Error('Unsafe imageUrl host');

    try {
      const res = await axios.get<ArrayBuffer>(v, {
        responseType: 'arraybuffer',
        timeout: 120_000, // Increased to 2 minutes for slower remote downloads
        maxContentLength: 25 * 1024 * 1024,
      });
      const contentType = (res.headers['content-type'] as string | undefined) ?? undefined;
      return { buffer: Buffer.from(res.data), contentType };
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error(
          `Failed to download reference image from "${v}". The download timed out after 120 seconds. ` +
          `Please check the source URL configuration and network speed.`
        );
      }
      throw new Error(`Failed to load reference image from "${v}": ${error.message || 'Unknown error'}`);
    }
  }

  const parsed = parseDataUrl(v);
  if (parsed) {
    return { buffer: Buffer.from(normalizeBase64(parsed.base64), 'base64'), contentType: parsed.contentType };
  }
  if (!isProbablyBase64(v)) throw new Error('Invalid image input (expected base64/dataUrl or https url)');
  return { buffer: Buffer.from(normalizeBase64(v), 'base64'), contentType: undefined };
}

function inferMimeType(contentType?: string) {
  const ct = contentType?.split(';')[0]?.trim().toLowerCase();
  if (ct === 'image/jpeg' || ct === 'image/jpg') return 'image/jpeg';
  if (ct === 'image/webp') return 'image/webp';
  if (ct === 'image/png') return 'image/png';
  return 'image/png';
}

function collectImageInputs(params: ImageGenerateParams): string[] {
  const images = (params as any).images ?? (params as any).imageArray;
  const single = asString((params as any).imageBase64) ?? asString((params as any).imageUrl) ?? asString((params as any).image);
  const list: string[] = Array.isArray(images) ? images.filter((x) => typeof x === 'string') : single ? [single] : [];
  return list.map((x) => x.trim()).filter(Boolean);
}

function pickBestInlineImage(resp: GeminiGenerateContentResponse): { mimeType?: string; base64: string } | null {
  const parts = resp?.candidates?.[0]?.content?.parts ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const images = parts
    .map((p) => p as any)
    .filter((p) => p && (p.inlineData || p.inline_data))
    .map((p) => {
      const inline = p.inlineData ?? p.inline_data;
      const base64 = asString(inline?.data);
      const mimeType = asString(inline?.mimeType ?? inline?.mime_type);
      return { base64, mimeType, thought: p.thought === true };
    })
    .filter((x) => !!x.base64);

  if (!images.length) return null;

  // Prefer final (non-thought) image if available; otherwise take the last one.
  const nonThought = images.filter((x) => !x.thought);
  const best = (nonThought.length ? nonThought : images)[(nonThought.length ? nonThought : images).length - 1];
  return { base64: best.base64!, mimeType: best.mimeType ?? 'image/png' };
}
