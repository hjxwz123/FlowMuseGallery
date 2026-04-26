import { BaseVideoAdapter, VideoGenerateParams } from '../base/base-video.adapter';
import { TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type WanxTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN';

type WanxI2vMediaType = 'first_frame' | 'last_frame' | 'driving_audio' | 'first_clip';
type WanxR2vMediaType = 'reference_image' | 'reference_video' | 'first_frame';
type WanxMediaType = WanxI2vMediaType | WanxR2vMediaType;
type WanxModelKind = 't2v' | 'i2v' | 'r2v' | 'unknown';
type WanxGeneration = 'wan2.7' | 'wan2.6' | 'unknown';

type WanxMediaItem = {
  type: WanxMediaType;
  url: string;
  reference_voice?: string;
};

type WanxSubmitResponse = {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    task_id?: string;
    task_status?: WanxTaskStatus;
    code?: string;
    message?: string;
  };
  [key: string]: unknown;
};

type WanxQueryResponse = {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    task_id?: string;
    task_status?: WanxTaskStatus;
    submit_time?: string;
    scheduled_time?: string;
    end_time?: string;
    video_url?: string;
    orig_prompt?: string;
    code?: string;
    message?: string;
  };
  usage?: Record<string, unknown>;
  [key: string]: unknown;
};

type WanxCancelResponse = {
  request_id?: string;
  code?: string;
  message?: string;
  output?: {
    code?: string;
    message?: string;
  };
  [key: string]: unknown;
};

type StringListParseResult = {
  items: string[];
  provided: boolean;
  invalid: boolean;
};

type WanxStructuredMediaResult = {
  media: WanxMediaItem[];
  audioUrl?: string;
  errors: string[];
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
}

function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function parseStringList(value: unknown): StringListParseResult {
  if (!isProvided(value)) return { items: [], provided: false, invalid: false };

  if (typeof value === 'string') {
    const item = asString(value);
    return item
      ? { items: [item], provided: true, invalid: false }
      : { items: [], provided: true, invalid: true };
  }

  if (!Array.isArray(value)) {
    return { items: [], provided: true, invalid: true };
  }

  const items: string[] = [];
  let invalid = false;

  for (const item of value) {
    const parsed = asString(item);
    if (!parsed) {
      invalid = true;
      continue;
    }
    items.push(parsed);
  }

  if (items.length !== value.length) invalid = true;
  return { items, provided: true, invalid };
}

function resolveWanxModel(params: Record<string, unknown>) {
  return asString(params.model) ?? asString(params.wanxModel) ?? asString(params.remoteModel);
}

function resolveWanxGeneration(model: string | undefined): WanxGeneration {
  const normalized = (model ?? '').toLowerCase();
  if (normalized.startsWith('wan2.7')) return 'wan2.7';
  if (normalized.startsWith('wan2.6')) return 'wan2.6';
  return 'unknown';
}

function resolveWanxModelKind(model: string | undefined): WanxModelKind {
  const normalized = (model ?? '').toLowerCase();
  if (normalized.includes('-t2v')) return 't2v';
  if (normalized.includes('-i2v')) return 'i2v';
  if (normalized.includes('-r2v')) return 'r2v';
  return 'unknown';
}

function mapWanxStatus(state: string | undefined): TaskStatusResponse['status'] {
  const normalized = (state ?? '').toUpperCase();
  if (!normalized) return 'processing';
  if (normalized === 'PENDING') return 'pending';
  if (normalized === 'RUNNING') return 'processing';
  if (normalized === 'SUCCEEDED') return 'completed';
  if (normalized === 'FAILED' || normalized === 'CANCELED' || normalized === 'UNKNOWN') return 'failed';
  return 'processing';
}

function getPromptExtendValue(params: Record<string, unknown>): boolean | undefined {
  return parseBoolean(params.prompt_extend ?? params.promptExtend);
}

function getWatermarkValue(params: Record<string, unknown>): boolean | undefined {
  return parseBoolean(params.watermark);
}

function parseWanxDirectMedia(
  params: Record<string, unknown>,
  kind: WanxModelKind,
): WanxStructuredMediaResult | null {
  if (!Array.isArray(params.media)) return null;

  const allowedMediaTypes: Record<WanxModelKind, WanxMediaType[]> = {
    t2v: [],
    i2v: ['first_frame', 'last_frame', 'driving_audio', 'first_clip'],
    r2v: ['reference_image', 'reference_video', 'first_frame'],
    unknown: [],
  };

  const media: WanxMediaItem[] = [];
  const errors: string[] = [];

  for (const item of params.media) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push('media must be an array of objects');
      continue;
    }

    const rawItem = item as Record<string, unknown>;
    const type = asString(rawItem.type) as WanxMediaType | undefined;
    const url = asString(rawItem.url);
    const referenceVoice = asString(rawItem.reference_voice ?? rawItem.referenceVoice);

    if (!type || !allowedMediaTypes[kind].includes(type)) {
      errors.push(`media.type is invalid for wan ${kind}`);
      continue;
    }

    if (!url) {
      errors.push('media.url must be a non-empty string');
      continue;
    }

    if (kind !== 'r2v' && referenceVoice) {
      errors.push('reference_voice is only supported by wan r2v');
      continue;
    }

    media.push({
      type,
      url,
      ...(referenceVoice ? { reference_voice: referenceVoice } : {}),
    });
  }

  return { media, errors };
}

function getSingleWanxField(
  params: Record<string, unknown>,
  keys: string[],
  label: string,
  errors: string[],
): string | undefined {
  const providedValues = keys.filter((key) => isProvided(params[key]));
  if (providedValues.length === 0) return undefined;

  const result = parseStringList(params[providedValues[0]]);
  if (result.invalid || result.items.length === 0) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }

  if (result.items.length > 1) {
    errors.push(`${label} supports at most 1 item`);
    return result.items[0];
  }

  return result.items[0];
}

function buildWanxT2vInput(params: Record<string, unknown>): WanxStructuredMediaResult {
  const errors: string[] = [];
  const directMedia = parseWanxDirectMedia(params, 't2v');
  if (directMedia) {
    if (directMedia.media.length > 0) {
      errors.push('wan t2v does not support media input');
    }
    return {
      media: [],
      audioUrl: getSingleWanxField(params, ['audioUrl', 'audio_url'], 'audioUrl', errors),
      errors: [...errors, ...directMedia.errors],
    };
  }

  const audioUrl =
    getSingleWanxField(params, ['audioUrl', 'audio_url'], 'audioUrl', errors) ??
    parseStringList(params.referenceAudios ?? params.reference_audios ?? params.referenceAudio ?? params.reference_audio).items[0];

  return { media: [], audioUrl, errors };
}

function buildWanxI2vInput(params: Record<string, unknown>): WanxStructuredMediaResult {
  const directMedia = parseWanxDirectMedia(params, 'i2v');
  if (directMedia) return directMedia;

  const errors: string[] = [];
  const media: WanxMediaItem[] = [];

  const firstFrame = getSingleWanxField(
    params,
    ['firstFrame', 'first_frame', 'firstFrameImage', 'first_frame_image'],
    'firstFrame',
    errors,
  );
  const lastFrame = getSingleWanxField(
    params,
    ['lastFrame', 'last_frame', 'lastFrameImage', 'last_frame_image'],
    'lastFrame',
    errors,
  );
  const firstClip = getSingleWanxField(
    params,
    ['firstClip', 'first_clip'],
    'firstClip',
    errors,
  );
  const drivingAudio =
    getSingleWanxField(params, ['drivingAudio', 'driving_audio'], 'drivingAudio', errors) ??
    getSingleWanxField(params, ['audioUrl', 'audio_url'], 'audioUrl', errors) ??
    parseStringList(params.referenceAudios ?? params.reference_audios ?? params.referenceAudio ?? params.reference_audio).items[0];

  if (firstFrame) media.push({ type: 'first_frame', url: firstFrame });
  if (lastFrame) media.push({ type: 'last_frame', url: lastFrame });
  if (firstClip) media.push({ type: 'first_clip', url: firstClip });
  if (drivingAudio) media.push({ type: 'driving_audio', url: drivingAudio });

  return { media, errors };
}

function buildWanxR2vInput(params: Record<string, unknown>): WanxStructuredMediaResult {
  const directMedia = parseWanxDirectMedia(params, 'r2v');
  if (directMedia) return directMedia;

  const errors: string[] = [];
  const referenceImages = parseStringList(params.referenceImages ?? params.reference_images);
  const referenceVideos = parseStringList(params.referenceVideos ?? params.reference_videos ?? params.referenceVideo ?? params.reference_video);
  const referenceAudios = parseStringList(params.referenceAudios ?? params.reference_audios ?? params.referenceAudio ?? params.reference_audio);
  const firstFrame = getSingleWanxField(
    params,
    ['firstFrame', 'first_frame', 'firstFrameImage', 'first_frame_image'],
    'firstFrame',
    errors,
  );

  if (referenceImages.invalid) errors.push('referenceImages must be a string or string[]');
  if (referenceVideos.invalid) errors.push('referenceVideos must be a string or string[]');
  if (referenceAudios.invalid) errors.push('referenceAudios must be a string or string[]');

  const media: WanxMediaItem[] = [];
  const visualMedia: WanxMediaItem[] = [];

  for (const url of referenceImages.items) {
    const item: WanxMediaItem = { type: 'reference_image', url };
    media.push(item);
    visualMedia.push(item);
  }

  for (const url of referenceVideos.items) {
    const item: WanxMediaItem = { type: 'reference_video', url };
    media.push(item);
    visualMedia.push(item);
  }

  referenceAudios.items.forEach((url, index) => {
    if (visualMedia[index]) {
      visualMedia[index].reference_voice = url;
    }
  });

  if (firstFrame) {
    media.push({ type: 'first_frame', url: firstFrame });
  }

  if (referenceAudios.items.length > visualMedia.length) {
    errors.push('referenceAudios cannot exceed the number of reference images/videos');
  }

  return { media, errors };
}

function validateCommonWanx27Params(params: Record<string, unknown>, errors: string[]) {
  const prompt = asString(params.prompt);
  const negativePrompt = asString(params.negativePrompt ?? params.negative_prompt);

  if (prompt && prompt.length > 5000) {
    errors.push('prompt must be at most 5000 characters');
  }

  if (negativePrompt && negativePrompt.length > 500) {
    errors.push('negativePrompt must be at most 500 characters');
  }

  const resolution = asString(params.resolution);
  if (resolution && !['720P', '1080P'].includes(resolution.toUpperCase())) {
    errors.push('resolution must be 720P or 1080P');
  }

  const duration = asNumber(params.duration);
  if (duration !== undefined) {
    if (!Number.isInteger(duration)) {
      errors.push('duration must be an integer');
    } else if (duration < 2 || duration > 15) {
      errors.push('duration must be an integer between 2 and 15 seconds');
    }
  }

  const promptExtend = getPromptExtendValue(params);
  if ((isProvided(params.prompt_extend) || isProvided(params.promptExtend)) && promptExtend === undefined) {
    errors.push('prompt_extend must be boolean');
  }

  const watermark = getWatermarkValue(params);
  if (isProvided(params.watermark) && watermark === undefined) {
    errors.push('watermark must be boolean');
  }

  const seed = asNumber(params.seed);
  if (seed !== undefined && (!Number.isInteger(seed) || seed < 0 || seed > 2147483647)) {
    errors.push('seed must be an integer between 0 and 2147483647');
  }
}

function buildWanx27Body(params: Record<string, unknown>, kind: WanxModelKind) {
  if (kind === 't2v') {
    const prepared = buildWanxT2vInput(params);
    const body: Record<string, unknown> = {
      model: resolveWanxModel(params),
      input: {},
    };
    const input = body.input as Record<string, unknown>;

    const prompt = asString(params.prompt);
    if (prompt) input.prompt = prompt;

    const negativePrompt = asString(params.negativePrompt ?? params.negative_prompt);
    if (negativePrompt) input.negative_prompt = negativePrompt;

    if (prepared.audioUrl) input.audio_url = prepared.audioUrl;

    const parameters: Record<string, unknown> = {};
    const resolution = asString(params.resolution);
    if (resolution) parameters.resolution = resolution.toUpperCase();

    const ratio = asString(params.ratio);
    if (ratio) parameters.ratio = ratio;

    const duration = asNumber(params.duration);
    if (duration !== undefined) parameters.duration = duration;

    const promptExtend = getPromptExtendValue(params);
    if (promptExtend !== undefined) parameters.prompt_extend = promptExtend;

    const watermark = getWatermarkValue(params);
    if (watermark !== undefined) parameters.watermark = watermark;

    const seed = asNumber(params.seed);
    if (seed !== undefined) parameters.seed = seed;

    if (Object.keys(parameters).length > 0) body.parameters = parameters;
    return body;
  }

  if (kind === 'i2v') {
    const prepared = buildWanxI2vInput(params);
    const body: Record<string, unknown> = {
      model: resolveWanxModel(params),
      input: {
        media: prepared.media,
      },
    };
    const input = body.input as Record<string, unknown>;

    const prompt = asString(params.prompt);
    if (prompt) input.prompt = prompt;

    const negativePrompt = asString(params.negativePrompt ?? params.negative_prompt);
    if (negativePrompt) input.negative_prompt = negativePrompt;

    const parameters: Record<string, unknown> = {};
    const resolution = asString(params.resolution);
    if (resolution) parameters.resolution = resolution.toUpperCase();

    const duration = asNumber(params.duration);
    if (duration !== undefined) parameters.duration = duration;

    const promptExtend = getPromptExtendValue(params);
    if (promptExtend !== undefined) parameters.prompt_extend = promptExtend;

    const watermark = getWatermarkValue(params);
    if (watermark !== undefined) parameters.watermark = watermark;

    const seed = asNumber(params.seed);
    if (seed !== undefined) parameters.seed = seed;

    if (Object.keys(parameters).length > 0) body.parameters = parameters;
    return body;
  }

  const prepared = buildWanxR2vInput(params);
  const body: Record<string, unknown> = {
    model: resolveWanxModel(params),
    input: {
      prompt: asString(params.prompt) ?? '',
      media: prepared.media,
    },
  };

  const negativePrompt = asString(params.negativePrompt ?? params.negative_prompt);
  if (negativePrompt) {
    (body.input as Record<string, unknown>).negative_prompt = negativePrompt;
  }

  const parameters: Record<string, unknown> = {};
  const resolution = asString(params.resolution);
  if (resolution) parameters.resolution = resolution.toUpperCase();

  const ratio = asString(params.ratio);
  if (ratio) parameters.ratio = ratio;

  const duration = asNumber(params.duration);
  if (duration !== undefined) parameters.duration = duration;

  const promptExtend = getPromptExtendValue(params);
  if (promptExtend !== undefined) parameters.prompt_extend = promptExtend;

  const watermark = getWatermarkValue(params);
  if (watermark !== undefined) parameters.watermark = watermark;

  const seed = asNumber(params.seed);
  if (seed !== undefined) parameters.seed = seed;

  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }

  return body;
}

export class WanxVideoAdapter extends BaseVideoAdapter {
  private buildApiPath(path: string) {
    const normalizedPath = path.replace(/^\/+/, '');
    const rawBaseUrl = String(this.channel.baseUrl ?? '').toLowerCase();
    if (rawBaseUrl.includes('/api/v1')) return normalizedPath;
    return `api/v1/${normalizedPath}`;
  }

  private getUpstreamErrorMessage(error: any) {
    const upstream = error?.response?.data ?? {};
    return (
      asString(upstream.message) ??
      asString(upstream.output?.message) ??
      asString(upstream.output?.code) ??
      error?.message
    );
  }

  async submitTask(params: VideoGenerateParams): Promise<string> {
    const request = this.transformParams(params) as Record<string, unknown>;
    const res = await this.httpClient.post<WanxSubmitResponse>(
      this.buildApiPath('/services/aigc/video-generation/video-synthesis'),
      request,
      {
        headers: {
          Accept: 'application/json',
          'X-DashScope-Async': 'enable',
        },
      },
    );

    const data = res.data ?? {};
    const taskId = asString(data.output?.task_id);
    const errorMessage = asString(data.message) ?? asString(data.output?.message);

    if (!taskId) {
      throw new Error(errorMessage ?? 'Wanx video submit: missing task id');
    }

    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get<WanxQueryResponse>(
      this.buildApiPath(`/tasks/${encodeURIComponent(taskId)}`),
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    const data = res.data ?? {};
    const output = data.output ?? {};
    const status = mapWanxStatus(output.task_status);
    const videoUrl = asString(output.video_url);
    const errorMessage = asString(output.message) ?? asString(data.message);

    return {
      status,
      resultUrls: videoUrl ? [videoUrl] : [],
      errorMessage: status === 'failed' ? errorMessage ?? 'Task failed' : undefined,
      providerData: {
        request_id: data.request_id,
        output,
        usage: data.usage ?? null,
      },
    };
  }

  async getTaskResult(taskId: string): Promise<string> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls?.[0] ?? '';
  }

  async cancelTask(taskId: string): Promise<void> {
    try {
      const res = await this.httpClient.post<WanxCancelResponse>(
        this.buildApiPath(`/tasks/${encodeURIComponent(taskId)}/cancel`),
        undefined,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      );

      const data = res.data ?? {};
      const errorMessage = asString(data.message) ?? asString(data.output?.message);
      if (data.code || data.output?.code) {
        throw new Error(errorMessage ?? 'Failed to cancel task');
      }
    } catch (error: any) {
      throw new Error(this.getUpstreamErrorMessage(error) ?? 'Failed to cancel task');
    }
  }

  validateParams(params: unknown): ValidationResult {
    const raw = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];

    const model = resolveWanxModel(raw);
    const generation = resolveWanxGeneration(model);
    const kind = resolveWanxModelKind(model);
    const prompt = asString(raw.prompt);

    if (!model) errors.push('model is required (model/wanxModel/remoteModel)');

    if (generation !== 'wan2.7') {
      errors.push('wan adapter only supports wan2.7 models');
      return { valid: false, errors };
    }

    if (kind === 'unknown') {
      errors.push('model must end with -t2v, -i2v, or -r2v');
      return { valid: false, errors };
    }

    validateCommonWanx27Params(raw, errors);

    if (kind === 't2v') {
      if (!prompt) errors.push('prompt is required');

      const ratio = asString(raw.ratio);
      if (ratio && !['16:9', '9:16', '1:1', '4:3', '3:4'].includes(ratio)) {
        errors.push('ratio must be 16:9, 9:16, 1:1, 4:3, or 3:4');
      }

      const prepared = buildWanxT2vInput(raw);
      errors.push(...prepared.errors);
      return { valid: errors.length === 0, errors };
    }

    if (kind === 'i2v') {
      const prepared = buildWanxI2vInput(raw);
      errors.push(...prepared.errors);

      if (prepared.media.length < 1) {
        errors.push('wan i2v requires at least one media item');
      }

      const ratio = asString(raw.ratio);
      if (ratio) {
        errors.push('wan i2v does not support ratio');
      }

      return { valid: errors.length === 0, errors };
    }

    if (!prompt) errors.push('prompt is required');

    const prepared = buildWanxR2vInput(raw);
    errors.push(...prepared.errors);

    const ratio = asString(raw.ratio);
    if (ratio && !['16:9', '9:16', '1:1', '4:3', '3:4'].includes(ratio)) {
      errors.push('ratio must be 16:9, 9:16, 1:1, 4:3, or 3:4');
    }

    const referenceImageCount = prepared.media.filter((item) => item.type === 'reference_image').length;
    const referenceVideoCount = prepared.media.filter((item) => item.type === 'reference_video').length;
    const firstFrameCount = prepared.media.filter((item) => item.type === 'first_frame').length;
    const visualCount = referenceImageCount + referenceVideoCount;
    const totalVisualCount = visualCount + firstFrameCount;

    if (visualCount < 1) {
      errors.push('wan r2v requires at least one reference_image or reference_video');
    }

    if (totalVisualCount > 5) {
      errors.push('reference_image + reference_video + first_frame must be at most 5 in total');
    }

    if (firstFrameCount > 1) {
      errors.push('first_frame supports at most 1 image');
    }

    if (isProvided(raw.duration)) {
      const duration = asNumber(raw.duration);
      if (duration !== undefined && Number.isInteger(duration)) {
        const max = referenceVideoCount > 0 ? 10 : 15;
        if (duration < 2 || duration > max) {
          errors.push(`duration must be an integer between 2 and ${max} seconds`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const raw = (params ?? {}) as Record<string, unknown>;
    const model = resolveWanxModel(raw);
    const generation = resolveWanxGeneration(model);
    const kind = resolveWanxModelKind(model);

    if (generation !== 'wan2.7' || kind === 'unknown') {
      return {
        model,
        input: {
          prompt: asString(raw.prompt) ?? '',
        },
      };
    }

    return buildWanx27Body(raw, kind);
  }
}
