import { BaseImageAdapter, ImageGenerateParams, TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type DoubaoImageDataItem =
  | {
      url?: string;
      b64_json?: string;
      size?: string;
      [key: string]: unknown;
    }
  | {
      error?: { code?: string; message?: string; [key: string]: unknown };
      [key: string]: unknown;
    };

type DoubaoImagesResponse = {
  model?: string;
  created?: number;
  data?: DoubaoImageDataItem[];
  usage?: {
    generated_images?: number;
    output_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  };
  error?: { code?: string; message?: string; [key: string]: unknown };
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

function toDataUrlFromB64(b64: string) {
  const v = b64.trim();
  if (v.startsWith('data:')) return v;
  return `data:image/jpeg;base64,${v}`;
}

export class DoubaoImageAdapter extends BaseImageAdapter {
  async submitTask(params: ImageGenerateParams): Promise<string> {
    const body = this.transformParams(params) as Record<string, unknown>;
    const res = await this.httpClient.post<DoubaoImagesResponse>('api/v3/images/generations', body, {
      headers: { Accept: 'application/json' },
    });

    const data = res.data ?? {};
    if (data.error?.message) throw new Error(data.error.message);

    const items = (data.data ?? []) as DoubaoImageDataItem[];
    for (const it of items) {
      const url = asString((it as any)?.url);
      if (url) return `url:${url}`;
      const b64 = asString((it as any)?.b64_json);
      if (b64) return `inline:${toDataUrlFromB64(b64)}`;
      const errMsg = asString((it as any)?.error?.message);
      if (errMsg) throw new Error(errMsg);
    }

    throw new Error('Doubao image generations: missing url/b64_json in response');
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const parsed = this.parseProviderTaskId(taskId);
    if (parsed) {
      if (parsed.kind === 'url') return { status: 'completed', resultUrls: [parsed.value], providerData: { url: parsed.value } };
      return { status: 'completed', resultUrls: [parsed.value], providerData: { inline: true } };
    }
    // Doubao image generations are synchronous in this implementation.
    return { status: 'processing' };
  }

  async getTaskResult(taskId: string): Promise<string[]> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls ?? [];
  }

  async cancelTask(taskId: string): Promise<void> {
    void taskId;
    // Not supported
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as ImageGenerateParams;
    const errors: string[] = [];

    if (!asString(p.prompt)) errors.push('prompt is required');

    const model = asString((p as any).model) ?? asString((p as any).doubaoModel) ?? asString((p as any).arkModel);
    if (!model) errors.push('model is required (model/doubaoModel/arkModel)');

    const stream = (p as any).stream;
    if (stream === true) errors.push('stream=true is not supported (use non-stream response)');

    const sequential = asString((p as any).sequential_image_generation);
    if (sequential && sequential !== 'auto' && sequential !== 'disabled') {
      errors.push('sequential_image_generation must be auto or disabled');
    }

    const seed = asNumber((p as any).seed);
    if (seed !== undefined && (!Number.isInteger(seed) || seed < -1 || seed > 2147483647)) {
      errors.push('seed must be integer between -1 and 2147483647');
    }

    const watermark = (p as any).watermark;
    if (watermark !== undefined && typeof watermark !== 'boolean') errors.push('watermark must be boolean');

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: ImageGenerateParams): unknown {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
    };

    const model = asString((params as any).model) ?? asString((params as any).doubaoModel) ?? asString((params as any).arkModel);
    if (model) body.model = model;

    const image = (params as any).image ?? (params as any).images;
    if (typeof image === 'string' && image.trim()) body.image = image.trim();
    if (Array.isArray(image)) body.image = image;

    const size = asString((params as any).size);
    if (size) body.size = size;

    const seed = asNumber((params as any).seed);
    if (seed !== undefined) body.seed = seed;

    const sequential = asString((params as any).sequential_image_generation);
    if (sequential) body.sequential_image_generation = sequential;

    const seqOptions = (params as any).sequential_image_generation_options;
    if (seqOptions && typeof seqOptions === 'object') body.sequential_image_generation_options = seqOptions;

    const guidance = asNumber((params as any).guidance_scale);
    if (guidance !== undefined) body.guidance_scale = guidance;

    const responseFormat = asString((params as any).response_format);
    if (responseFormat) body.response_format = responseFormat;

    const watermark = (params as any).watermark;
    if (typeof watermark === 'boolean') body.watermark = watermark;

    const optimize = (params as any).optimize_prompt_options;
    if (optimize && typeof optimize === 'object') body.optimize_prompt_options = optimize;

    // Force non-stream
    body.stream = false;

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
}
