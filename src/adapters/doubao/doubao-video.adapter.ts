import { BaseVideoAdapter, VideoGenerateParams } from '../base/base-video.adapter';
import { TaskStatusResponse, ValidationResult } from '../base/base-image.adapter';

type DoubaoTaskError = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

// 豆包创建任务响应
type DoubaoVideoSubmitResponse = {
  id?: string;
  error?: DoubaoTaskError;
  [key: string]: unknown;
};

// 豆包查询任务响应
type DoubaoVideoQueryResponse = {
  id?: string;
  model?: string;
  status?: string; // queued | running | succeeded | failed | expired | cancelled
  error?: DoubaoTaskError | null;
  created_at?: number;
  updated_at?: number;
  content?: {
    video_url?: string;
    last_frame_url?: string;
    [key: string]: unknown;
  } | null;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  frames?: number;
  framespersecond?: number;
  generate_audio?: boolean;
  service_tier?: string;
  execution_expires_after?: number;
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type DoubaoTextContentItem = {
  type: 'text';
  text: string;
};

type DoubaoImageContentItem = {
  type: 'image_url';
  image_url: { url: string };
  role?: 'first_frame' | 'last_frame' | 'reference_image';
};

type DoubaoVideoContentItem = {
  type: 'video_url';
  video_url: { url: string };
  role: 'reference_video';
};

type DoubaoAudioContentItem = {
  type: 'audio_url';
  audio_url: { url: string };
  role: 'reference_audio';
};

type DoubaoDraftTaskContentItem = {
  type: 'draft_task';
  draft_task: { id: string };
};

type DoubaoContentItem =
  | DoubaoTextContentItem
  | DoubaoImageContentItem
  | DoubaoVideoContentItem
  | DoubaoAudioContentItem
  | DoubaoDraftTaskContentItem;

type OrderedReferenceItem = {
  kind: 'image' | 'video' | 'audio';
  url: string;
};

type StringListParseResult = {
  items: string[];
  provided: boolean;
  invalid: boolean;
};

type DoubaoModelInfo = {
  raw: string;
  isSeedance20Series: boolean;
  isSeedance15: boolean;
  isSeedance10LiteI2V: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceAudio: boolean;
  supportsGenerateAudio: boolean;
  supportsDraft: boolean;
  supportsFlexServiceTier: boolean;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function mapDoubaoStateToStatus(state: string | undefined): TaskStatusResponse['status'] {
  const s = (state ?? '').toLowerCase();
  if (!s) return 'processing';
  if (s === 'queued') return 'pending';
  if (s === 'running') return 'processing';
  if (s === 'succeeded') return 'completed';
  if (s === 'failed' || s === 'expired' || s === 'cancelled') return 'failed';
  return 'processing';
}

function parseStringList(value: unknown): StringListParseResult {
  if (!isProvided(value)) return { items: [], provided: false, invalid: false };

  if (typeof value === 'string') {
    const item = asString(value);
    return item ? { items: [item], provided: true, invalid: false } : { items: [], provided: true, invalid: true };
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

function resolveDoubaoModel(params: Record<string, unknown>): string | undefined {
  return asString(params.model) ?? asString(params.doubaoModel) ?? asString(params.arkModel);
}

function getDoubaoModelInfo(model: string | undefined): DoubaoModelInfo {
  const raw = (model ?? '').toLowerCase();
  const isSeedance20Series = raw.includes('seedance-2-0');
  const isSeedance15 = raw.includes('seedance-1-5');
  const isSeedance10LiteI2V = raw.includes('seedance-1-0-lite-i2v');

  return {
    raw,
    isSeedance20Series,
    isSeedance15,
    isSeedance10LiteI2V,
    supportsReferenceVideo: isSeedance20Series,
    supportsReferenceAudio: isSeedance20Series,
    supportsGenerateAudio: isSeedance20Series || isSeedance15,
    supportsDraft: isSeedance15,
    supportsFlexServiceTier: !isSeedance20Series,
  };
}

function getFirstFrame(params: Record<string, unknown>): string | undefined {
  return asString(params.firstFrame) ?? asString(params.first_frame) ?? asString(params.referenceImage);
}

function getLastFrame(params: Record<string, unknown>): string | undefined {
  return asString(params.lastFrame) ?? asString(params.last_frame);
}

function getReferenceImages(params: Record<string, unknown>): StringListParseResult {
  return parseStringList(params.referenceImages ?? params.reference_images);
}

function getReferenceVideos(params: Record<string, unknown>): StringListParseResult {
  return parseStringList(params.referenceVideos ?? params.reference_videos ?? params.referenceVideo ?? params.reference_video);
}

function getReferenceAudios(params: Record<string, unknown>): StringListParseResult {
  return parseStringList(params.referenceAudios ?? params.reference_audios ?? params.referenceAudio ?? params.reference_audio);
}

function getDraftTaskId(params: Record<string, unknown>): string | undefined {
  return (
    asString(params.draftTaskId) ??
    asString(params.draft_task_id) ??
    asString(params.draftTask) ??
    asString(params.draft_task)
  );
}

function normalizeOrderedReferences(value: unknown): OrderedReferenceItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const kind = source.kind === 'image' || source.kind === 'video' || source.kind === 'audio'
        ? source.kind
        : null;
      const url = asString(source.url);
      if (!kind || !url) return null;
      return { kind, url } satisfies OrderedReferenceItem;
    })
    .filter((item): item is OrderedReferenceItem => Boolean(item));
}

function hasAnyMediaInput(input: {
  draftTaskId?: string;
  firstFrame?: string;
  lastFrame?: string;
  referenceImages: string[];
  referenceVideos: string[];
  referenceAudios: string[];
}) {
  return Boolean(
    input.draftTaskId ||
      input.firstFrame ||
      input.lastFrame ||
      input.referenceImages.length > 0 ||
      input.referenceVideos.length > 0 ||
      input.referenceAudios.length > 0,
  );
}

/**
 * 豆包视频生成适配器
 *
 * 重点适配 Seedance 2.0 / 2.0 fast：
 * - 文生视频
 * - 图生视频（首帧 / 首尾帧）
 * - 多模态参考生视频（参考图 / 参考视频 / 参考音频）
 * - 编辑视频 / 延长视频（通过 reference_video）
 * 同时兼容旧前端字段：
 * - fps / framespersecond 仍可接收，但不会再下发到豆包接口
 * - camerafixed / cameraFixed 会统一转换为 camera_fixed
 * - firstFrame / lastFrame / referenceImages 等历史字段继续可用
 */
export class DoubaoVideoAdapter extends BaseVideoAdapter {
  private getUpstreamErrorMessage(error: any) {
    const upstream = error?.response?.data ?? {};
    return (
      asString(upstream.error?.message) ??
      asString(upstream.message) ??
      asString(upstream.error?.code) ??
      error?.message
    );
  }

  async submitTask(params: VideoGenerateParams): Promise<string> {
    const request = this.transformParams(params) as Record<string, unknown>;
    const res = await this.httpClient.post<DoubaoVideoSubmitResponse>('/api/v3/contents/generations/tasks', request, {
      headers: { Accept: 'application/json' },
    });

    const data = res.data ?? {};
    if (data.error?.message) throw new Error(data.error.message);

    const taskId = asString(data.id);
    if (!taskId) throw new Error('Doubao video submit: missing task id');

    return taskId;
  }

  async queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    const res = await this.httpClient.get<DoubaoVideoQueryResponse>(
      `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: { Accept: 'application/json' },
      },
    );

    const data = res.data ?? {};
    const state = asString(data.status);
    const status = mapDoubaoStateToStatus(state);

    const videoUrl = asString(data.content?.video_url);
    const lastFrameUrl = asString(data.content?.last_frame_url);
    const errorMessage = asString(data.error?.message);

    return {
      status,
      resultUrls: videoUrl ? [videoUrl] : [],
      errorMessage: status === 'failed' ? errorMessage ?? 'Task failed' : undefined,
      providerData: {
        ...data,
        thumbnailUrl: lastFrameUrl,
      },
    };
  }

  async getTaskResult(taskId: string): Promise<string> {
    const status = await this.queryTaskStatus(taskId);
    return status.resultUrls?.[0] ?? '';
  }

  async cancelTask(taskId: string): Promise<void> {
    try {
      await this.httpClient.delete(
        `/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`,
        {
          headers: { Accept: 'application/json' },
        },
      );
    } catch (error: any) {
      throw new Error(this.getUpstreamErrorMessage(error) ?? 'Failed to cancel task');
    }
  }

  validateParams(params: unknown): ValidationResult {
    const p = (params ?? {}) as Record<string, unknown>;
    const errors: string[] = [];

    const prompt = asString(p.prompt);
    const model = resolveDoubaoModel(p);
    const modelInfo = getDoubaoModelInfo(model);

    const firstFrame = getFirstFrame(p);
    const lastFrame = getLastFrame(p);
    const referenceImages = getReferenceImages(p);
    const referenceVideos = getReferenceVideos(p);
    const referenceAudios = getReferenceAudios(p);
    const draftTaskId = getDraftTaskId(p);

    if (!model) errors.push('model is required (model/doubaoModel/arkModel)');

    if (!prompt && !hasAnyMediaInput({
      draftTaskId,
      firstFrame,
      lastFrame,
      referenceImages: referenceImages.items,
      referenceVideos: referenceVideos.items,
      referenceAudios: referenceAudios.items,
    })) {
      errors.push('prompt is required unless media references or draftTaskId are provided');
    }

    if (
      (isProvided(p.firstFrame) || isProvided(p.first_frame) || isProvided(p.referenceImage)) &&
      !firstFrame
    ) {
      errors.push('firstFrame/referenceImage must be a non-empty string');
    }

    if ((isProvided(p.lastFrame) || isProvided(p.last_frame)) && !lastFrame) {
      errors.push('lastFrame must be a non-empty string');
    }

    if (lastFrame && !firstFrame) {
      errors.push('lastFrame requires firstFrame');
    }

    if (referenceImages.invalid) errors.push('referenceImages must be a string or string[]');
    if (referenceVideos.invalid) errors.push('referenceVideos must be a string or string[]');
    if (referenceAudios.invalid) errors.push('referenceAudios must be a string or string[]');

    const hasFrameScene = Boolean(firstFrame || lastFrame);
    const hasReferenceScene =
      referenceImages.items.length > 0 || referenceVideos.items.length > 0 || referenceAudios.items.length > 0;

    if (hasFrameScene && hasReferenceScene) {
      errors.push('firstFrame/lastFrame cannot be combined with referenceImages/referenceVideos/referenceAudios');
    }

    if (draftTaskId && (hasFrameScene || hasReferenceScene)) {
      errors.push('draftTaskId cannot be combined with firstFrame/lastFrame/reference inputs');
    }

    if (referenceImages.provided) {
      const maxImages = modelInfo.isSeedance20Series ? 9 : 4;
      if (referenceImages.items.length < 1 || referenceImages.items.length > maxImages) {
        errors.push(`referenceImages must contain 1-${maxImages} images`);
      }
    }

    if (referenceVideos.provided) {
      if (referenceVideos.items.length < 1 || referenceVideos.items.length > 3) {
        errors.push('referenceVideos must contain 1-3 videos');
      }
      if (referenceVideos.items.length > 0 && !modelInfo.supportsReferenceVideo) {
        errors.push('referenceVideos are only supported by Seedance 2.0 series models');
      }
    }

    if (referenceAudios.provided) {
      if (referenceAudios.items.length < 1 || referenceAudios.items.length > 3) {
        errors.push('referenceAudios must contain 1-3 audios');
      }
      if (referenceAudios.items.length > 0 && !modelInfo.supportsReferenceAudio) {
        errors.push('referenceAudios are only supported by Seedance 2.0 series models');
      }
      if (referenceAudios.items.length > 0 && referenceImages.items.length === 0 && referenceVideos.items.length === 0) {
        errors.push('referenceAudios require at least one referenceImage or referenceVideo');
      }
    }

    if (draftTaskId && !modelInfo.supportsDraft) {
      errors.push('draftTaskId is only supported by Seedance 1.5 pro');
    }

    const resolution = asString(p.resolution);
    if (resolution && !['480p', '720p', '1080p'].includes(resolution)) {
      errors.push('resolution must be 480p, 720p, or 1080p');
    }
    if (resolution === '1080p' && modelInfo.isSeedance20Series) {
      errors.push('resolution 1080p is not supported by Seedance 2.0 series models');
    }
    if (resolution === '1080p' && modelInfo.isSeedance10LiteI2V && referenceImages.items.length > 0) {
      errors.push('resolution 1080p is not supported by Seedance 1.0 lite i2v reference-image mode');
    }

    const ratio = asString(p.ratio);
    if (ratio && !['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'].includes(ratio)) {
      errors.push('ratio must be 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, or adaptive');
    }

    const duration = asNumber(p.duration);
    if (duration !== undefined) {
      if (!Number.isInteger(duration)) {
        errors.push('duration must be an integer');
      } else if (modelInfo.isSeedance20Series) {
        if (duration !== -1 && (duration < 4 || duration > 15)) {
          errors.push('duration must be -1 or an integer between 4 and 15 seconds for Seedance 2.0 series');
        }
      } else if (modelInfo.isSeedance15) {
        if (duration !== -1 && (duration < 4 || duration > 12)) {
          errors.push('duration must be -1 or an integer between 4 and 12 seconds for Seedance 1.5 pro');
        }
      } else if (duration < 2 || duration > 12) {
        errors.push('duration must be an integer between 2 and 12 seconds');
      }
    }

    const frames = asNumber(p.frames);
    if (frames !== undefined) {
      if (!Number.isInteger(frames)) {
        errors.push('frames must be an integer');
      } else if (frames < 29 || frames > 289 || (frames - 25) % 4 !== 0) {
        errors.push('frames must be within [29, 289] and satisfy 25 + 4n');
      }
      if (modelInfo.isSeedance20Series || modelInfo.isSeedance15) {
        errors.push('frames is not supported by Seedance 2.0 / 1.5 models');
      }
    }

    const fps = asNumber(p.fps) ?? asNumber(p.framespersecond);
    if (fps !== undefined && fps !== 24) {
      errors.push('framespersecond (fps) must be 24 when provided');
    }

    const seed = asNumber(p.seed);
    if (seed !== undefined && (!Number.isInteger(seed) || seed < -1 || seed > Math.pow(2, 32) - 1)) {
      errors.push('seed must be an integer between -1 and 2^32-1');
    }

    const watermark = p.watermark;
    if (watermark !== undefined && typeof watermark !== 'boolean') {
      errors.push('watermark must be boolean');
    }

    const cameraFixed = p.camera_fixed ?? p.camerafixed ?? p.cameraFixed;
    if (cameraFixed !== undefined && typeof cameraFixed !== 'boolean') {
      errors.push('camera_fixed must be boolean');
    }
    if (cameraFixed === true && modelInfo.isSeedance20Series) {
      errors.push('camera_fixed is not supported by Seedance 2.0 series models');
    }
    if (cameraFixed === true && referenceImages.items.length > 0) {
      errors.push('camera_fixed is not supported in reference-image mode');
    }

    const returnLastFrame = p.return_last_frame ?? p.returnLastFrame;
    if (returnLastFrame !== undefined && typeof returnLastFrame !== 'boolean') {
      errors.push('return_last_frame must be boolean');
    }

    const callbackUrl = asString(p.callback_url) ?? asString(p.callbackUrl);
    if ((isProvided(p.callback_url) || isProvided(p.callbackUrl)) && !callbackUrl) {
      errors.push('callback_url must be a non-empty string');
    }

    const serviceTier = asString(p.service_tier) ?? asString(p.serviceTier);
    if (serviceTier && !['default', 'flex'].includes(serviceTier)) {
      errors.push('service_tier must be default or flex');
    }
    if (serviceTier === 'flex' && !modelInfo.supportsFlexServiceTier) {
      errors.push('service_tier=flex is not supported by Seedance 2.0 series models');
    }

    const expiresAfter = asNumber(p.execution_expires_after) ?? asNumber(p.executionExpiresAfter);
    if (expiresAfter !== undefined) {
      if (!Number.isInteger(expiresAfter) || expiresAfter < 3600 || expiresAfter > 259200) {
        errors.push('execution_expires_after must be an integer between 3600 and 259200');
      }
    }

    const generateAudio = p.generate_audio ?? p.generateAudio;
    if (generateAudio !== undefined && typeof generateAudio !== 'boolean') {
      errors.push('generate_audio must be boolean');
    }
    if (generateAudio !== undefined && !modelInfo.supportsGenerateAudio) {
      errors.push('generate_audio is only supported by Seedance 2.0 series and Seedance 1.5 pro');
    }

    const draft = p.draft;
    if (draft !== undefined && typeof draft !== 'boolean') {
      errors.push('draft must be boolean');
    }
    if (draft === true && !modelInfo.supportsDraft) {
      errors.push('draft is only supported by Seedance 1.5 pro');
    }
    if (draft === true && returnLastFrame === true) {
      errors.push('return_last_frame is not supported when draft=true');
    }
    if (draft === true && serviceTier === 'flex') {
      errors.push('service_tier=flex is not supported when draft=true');
    }

    const safetyIdentifier = asString(p.safety_identifier) ?? asString(p.safetyIdentifier);
    if ((isProvided(p.safety_identifier) || isProvided(p.safetyIdentifier)) && !safetyIdentifier) {
      errors.push('safety_identifier must be a non-empty string');
    }
    if (safetyIdentifier && safetyIdentifier.length > 64) {
      errors.push('safety_identifier must be at most 64 characters');
    }

    return { valid: errors.length === 0, errors };
  }

  transformParams(params: VideoGenerateParams): unknown {
    const raw = (params ?? {}) as Record<string, unknown>;
    const content: DoubaoContentItem[] = [];

    const prompt = asString(raw.prompt);
    const firstFrame = getFirstFrame(raw);
    const lastFrame = getLastFrame(raw);
    const referenceImages = getReferenceImages(raw).items;
    const referenceVideos = getReferenceVideos(raw).items;
    const referenceAudios = getReferenceAudios(raw).items;
    const orderedReferences = normalizeOrderedReferences(raw.referenceSequence ?? raw.reference_sequence);
    const draftTaskId = getDraftTaskId(raw);

    if (draftTaskId) {
      content.push({
        type: 'draft_task',
        draft_task: { id: draftTaskId },
      });
    } else {
      if (prompt) {
        content.push({
          type: 'text',
          text: prompt,
        });
      }

      if (firstFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: firstFrame },
          role: 'first_frame',
        });
      }

      if (lastFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: lastFrame },
          role: 'last_frame',
        });
      }

      if (orderedReferences.length > 0) {
        for (const item of orderedReferences) {
          if (item.kind === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: item.url },
              role: 'reference_image',
            });
            continue;
          }
          if (item.kind === 'video') {
            content.push({
              type: 'video_url',
              video_url: { url: item.url },
              role: 'reference_video',
            });
            continue;
          }

          content.push({
            type: 'audio_url',
            audio_url: { url: item.url },
            role: 'reference_audio',
          });
        }
      } else {
        for (const url of referenceImages) {
          content.push({
            type: 'image_url',
            image_url: { url },
            role: 'reference_image',
          });
        }

        for (const url of referenceVideos) {
          content.push({
            type: 'video_url',
            video_url: { url },
            role: 'reference_video',
          });
        }

        for (const url of referenceAudios) {
          content.push({
            type: 'audio_url',
            audio_url: { url },
            role: 'reference_audio',
          });
        }
      }
    }

    const body: Record<string, unknown> = {
      model: resolveDoubaoModel(raw),
      content,
    };

    const resolution = asString(raw.resolution);
    if (resolution) body.resolution = resolution;

    const ratio = asString(raw.ratio);
    if (ratio) body.ratio = ratio;

    const duration = asNumber(raw.duration);
    if (duration !== undefined) body.duration = duration;

    const frames = asNumber(raw.frames);
    if (frames !== undefined) body.frames = frames;

    const seed = asNumber(raw.seed);
    if (seed !== undefined) body.seed = seed;

    const watermark = raw.watermark;
    body.watermark = typeof watermark === 'boolean' ? watermark : false;

    const cameraFixed = raw.camera_fixed ?? raw.camerafixed ?? raw.cameraFixed;
    if (typeof cameraFixed === 'boolean') {
      body.camera_fixed = cameraFixed;
    }

    const callbackUrl = asString(raw.callback_url) ?? asString(raw.callbackUrl);
    if (callbackUrl) body.callback_url = callbackUrl;

    const returnLastFrame = raw.return_last_frame ?? raw.returnLastFrame;
    body.return_last_frame = typeof returnLastFrame === 'boolean' ? returnLastFrame : true;

    const serviceTier = asString(raw.service_tier) ?? asString(raw.serviceTier);
    if (serviceTier) body.service_tier = serviceTier;

    const expiresAfter = asNumber(raw.execution_expires_after) ?? asNumber(raw.executionExpiresAfter);
    if (expiresAfter !== undefined) body.execution_expires_after = expiresAfter;

    const generateAudio = raw.generate_audio ?? raw.generateAudio;
    if (typeof generateAudio === 'boolean') body.generate_audio = generateAudio;

    if (typeof raw.draft === 'boolean') body.draft = raw.draft;

    const safetyIdentifier = asString(raw.safety_identifier) ?? asString(raw.safetyIdentifier);
    if (safetyIdentifier) body.safety_identifier = safetyIdentifier;

    return body;
  }
}
