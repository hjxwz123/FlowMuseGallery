import { AiModel, ModelProvider } from '@prisma/client';
import { AiModelType } from '../common/prisma-enums';
import { isQwenProvider, normalizeProviderKey } from '../common/utils/provider.util';

export type ModelExecution = 'sync' | 'async';

export type ModelOperationCapability = {
  key: string;
  execution: ModelExecution;
  description: string;
  requiredParameters?: string[];
  optionalParameters?: string[];
  notes?: string[];
};

export type ModelCapabilities = {
  modelId: string;
  provider: string;
  providerIcon: string | null;
  type: 'image' | 'video' | 'chat';
  remoteModel: string | null;
  operationParamKey: string | null;
  operations: ModelOperationCapability[];
  supports: {
    textToImage: boolean;
    imageToImage: boolean;
    imageInput: boolean;
    videoInput: boolean;
    audioInput: boolean;
    multiImageInput: boolean;
    mask: boolean;
    async: boolean;
    webhook: boolean;
    followUpActions: boolean;
    highRes: boolean;
    resolutionSelect: boolean;
    sizeSelect: boolean;
    contextualEdit: boolean;
  };
  limits: {
    maxInputImages?: number;
    maxInputVideos?: number;
    maxInputAudios?: number;
    imageSizes?: string[];
  };
  followUp?: {
    midjourneyActionEndpoint?: string;
    midjourneyModalEndpoint?: string;
  };
  providerSchema?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isWanxProvider(provider: string): boolean {
  const normalizedProvider = normalizeProviderKey(provider);
  return normalizedProvider.includes('wanx') || normalizedProvider.includes('wanxiang');
}

type Wanx27ModelKind = 't2v' | 'i2v' | 'r2v' | null;

function resolveWanx27ModelKind(remoteModel: string | null): Wanx27ModelKind {
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();
  if (!normalizedRemoteModel.startsWith('wan2.7')) return null;
  if (normalizedRemoteModel.includes('-t2v')) return 't2v';
  if (normalizedRemoteModel.includes('-i2v')) return 'i2v';
  if (normalizedRemoteModel.includes('-r2v')) return 'r2v';
  return null;
}

function inferImageInputFromProvider(
  type: 'image' | 'video' | 'chat',
  provider: string,
  imageToImage: boolean,
  remoteModel: string | null,
): boolean {
  if (type === 'chat') return false;
  if (type === 'image') return imageToImage || isNanoBananaFamily(provider) || isQwenProvider(provider);

  if (isWanxProvider(provider)) {
    const wanxKind = resolveWanx27ModelKind(remoteModel);
    if (wanxKind === 't2v') return false;
    if (wanxKind === 'i2v' || wanxKind === 'r2v') return true;
  }

  const normalizedProvider = normalizeProviderKey(provider);
  return (
    normalizedProvider.includes('doubao') ||
    normalizedProvider.includes('bytedance') ||
    normalizedProvider.includes('ark') ||
    normalizedProvider.includes('wanx') ||
    normalizedProvider.includes('wanxiang')
  );
}

function inferVideoInputFromProvider(
  type: 'image' | 'video' | 'chat',
  provider: string,
  remoteModel: string | null,
): boolean {
  if (type !== 'video') return false;

  const normalizedProvider = normalizeProviderKey(provider);
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();

  if (isWanxProvider(provider)) {
    const wanxKind = resolveWanx27ModelKind(remoteModel);
    if (wanxKind === 't2v') return false;
    if (wanxKind === 'i2v' || wanxKind === 'r2v') return true;
  }

  if (
    normalizedProvider.includes('doubao') ||
    normalizedProvider.includes('bytedance') ||
    normalizedProvider.includes('ark')
  ) {
    return !normalizedRemoteModel.includes('seedance-1-5-pro');
  }

  return (
    normalizedProvider.includes('wanx') ||
    normalizedProvider.includes('wanxiang')
  );
}

function inferAudioInputFromProvider(
  type: 'image' | 'video' | 'chat',
  provider: string,
  remoteModel: string | null,
): boolean {
  if (type !== 'video') return false;

  if (isWanxProvider(provider)) {
    return resolveWanx27ModelKind(remoteModel) !== null;
  }

  const normalizedProvider = normalizeProviderKey(provider);
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();
  return (
    (normalizedProvider.includes('doubao') ||
      normalizedProvider.includes('bytedance') ||
      normalizedProvider.includes('ark')) &&
    normalizedRemoteModel.includes('seedance-2-0')
  ) || (
    (normalizedProvider.includes('wanx') || normalizedProvider.includes('wanxiang')) &&
    normalizedRemoteModel.includes('wan2.7')
  );
}

function inferContextualEditSupport(
  type: 'image' | 'video' | 'chat',
  provider: string,
  remoteModel: string | null,
  supports: {
    imageToImage: boolean;
    imageInput: boolean;
    videoInput: boolean;
    audioInput: boolean;
  },
): boolean {
  if (type === 'chat') return false;

  const normalizedProvider = normalizeProviderKey(provider);

  if (type === 'video' && isWanxProvider(provider)) {
    const wanxKind = resolveWanx27ModelKind(remoteModel);
    if (wanxKind === 't2v') return false;
    if (wanxKind === 'i2v' || wanxKind === 'r2v') return true;
  }

  if (type === 'image') {
    if (!supports.imageInput && !supports.imageToImage) return false;

    return (
      normalizedProvider.includes('qwen') ||
      normalizedProvider.includes('doubao') ||
      normalizedProvider.includes('nanobanana') ||
      normalizedProvider.includes('gemini') ||
      normalizedProvider.includes('google')
    );
  }

  if (supports.imageInput || supports.videoInput || supports.audioInput) {
    return true;
  }

  return (
    normalizedProvider.includes('wanx') ||
    normalizedProvider.includes('wanxiang') ||
    ((normalizedProvider.includes('doubao') ||
      normalizedProvider.includes('bytedance') ||
      normalizedProvider.includes('ark')) &&
      Boolean((remoteModel ?? '').trim()))
  );
}

function isNanoBananaFamily(provider: string): boolean {
  const normalizedProvider = normalizeProviderKey(provider);
  return (
    normalizedProvider.includes('nanobanana') ||
    normalizedProvider.includes('gemini') ||
    normalizedProvider.includes('google')
  );
}

function inferResolutionSelect(provider: string, remoteModel: string | null): boolean {
  if (!isNanoBananaFamily(provider)) return false;
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();
  return normalizedRemoteModel.includes('pro');
}

function withAdminOverrides(caps: ModelCapabilities, model: AiModel, remoteModel: string | null): ModelCapabilities {
  const configuredImageInput = asBoolean((model as any).supportsImageInput);
  const configuredResolutionSelect = asBoolean((model as any).supportsResolutionSelect);
  const configuredSizeSelect = asBoolean((model as any).supportsSizeSelect);
  const inferredImageInput = inferImageInputFromProvider(caps.type, caps.provider, caps.supports.imageToImage, remoteModel);
  const inferredVideoInput = inferVideoInputFromProvider(caps.type, caps.provider, remoteModel);
  const inferredAudioInput = inferAudioInputFromProvider(caps.type, caps.provider, remoteModel);
  const inferredSizeSelect = caps.type === 'chat' ? false : isNanoBananaFamily(caps.provider);
  const inferredResolutionSelect = caps.type === 'chat' ? false : inferResolutionSelect(caps.provider, remoteModel);

  caps.supports.imageInput = configuredImageInput ?? inferredImageInput;
  caps.supports.videoInput = inferredVideoInput;
  caps.supports.audioInput = inferredAudioInput;
  caps.supports.sizeSelect = configuredSizeSelect ?? inferredSizeSelect;
  caps.supports.resolutionSelect = configuredResolutionSelect ?? inferredResolutionSelect;
  caps.supports.contextualEdit = inferContextualEditSupport(caps.type, caps.provider, remoteModel, {
    imageToImage: caps.supports.imageToImage,
    imageInput: caps.supports.imageInput,
    videoInput: caps.supports.videoInput,
    audioInput: caps.supports.audioInput,
  });
  return caps;
}

export function buildModelCapabilities(model: AiModel, providerConfig?: ModelProvider | null): ModelCapabilities {
  const provider = model.provider;
  const providerKey = normalizeProviderKey(provider);
  let type: ModelCapabilities['type'] = 'image';
  if (model.type === AiModelType.video) type = 'video';
  if (model.type === AiModelType.chat) type = 'chat';
  const remoteModel = asString((model as any).modelKey) ?? null;

  // Defaults
  const caps: ModelCapabilities = {
    modelId: model.id.toString(),
    provider,
    providerIcon: (model as any).icon ?? providerConfig?.icon ?? null,
    type,
    remoteModel,
    operationParamKey: null,
    operations: [],
    supports: {
      textToImage: type === 'image',
      imageToImage: false,
      imageInput: false,
      videoInput: false,
      audioInput: false,
      multiImageInput: false,
      mask: false,
      async: false,
      webhook: Boolean(providerConfig?.webhookRequired),
      followUpActions: false,
      highRes: false,
      resolutionSelect: false,
      sizeSelect: false,
      contextualEdit: false,
    },
    limits: {},
    providerSchema: providerConfig?.paramSchema ?? null,
  };

  if (type === 'chat') {
    caps.operations = [
      {
        key: 'chat.completions',
        execution: 'sync',
        description: 'OpenAI 兼容聊天接口（POST /chat/completions）',
        requiredParameters: ['messages'],
        optionalParameters: ['temperature', 'top_p', 'max_tokens'],
      },
    ];
    return withAdminOverrides(caps, model, remoteModel);
  }

  if (type === 'video') {
    // Video defaults
    caps.supports.async = true;

    if (providerKey === 'doubao') {
      const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();
      caps.operationParamKey = null;
      caps.supports.multiImageInput = true;
      caps.limits.maxInputImages = normalizedRemoteModel.includes('seedance-2-0') ? 9 : 4;
      caps.limits.maxInputVideos = normalizedRemoteModel.includes('seedance-2-0') ? 3 : undefined;
      caps.limits.maxInputAudios = normalizedRemoteModel.includes('seedance-2-0') ? 3 : undefined;
      caps.operations = [
        {
          key: 'contentGenerationTask',
          execution: 'async',
          description: '豆包 Seedance 视频生成（提交 /api/v3/contents/generations/tasks，轮询 /api/v3/contents/generations/tasks/{id}）。',
          requiredParameters: ['model'],
          optionalParameters: [
            'prompt',
            'firstFrame',
            'lastFrame',
            'referenceImages',
            'referenceVideos',
            'referenceAudios',
            'resolution',
            'ratio',
            'duration',
            'frames',
            'seed',
            'watermark',
            'camera_fixed',
            'return_last_frame',
            'service_tier',
            'execution_expires_after',
            'generate_audio',
            'safety_identifier',
          ],
        },
      ];
      return withAdminOverrides(caps, model, remoteModel);
    }

    if (providerKey === 'wanx') {
      const normalizedRemoteModel = (remoteModel ?? '').toLowerCase();
      const wanx27Kind = resolveWanx27ModelKind(remoteModel);
      const isWan27 = normalizedRemoteModel.includes('wan2.7');
      const isWan26 = normalizedRemoteModel.includes('wan2.6');

      caps.operationParamKey = null;
      if (wanx27Kind === 't2v') {
        caps.supports.multiImageInput = false;
        caps.limits.maxInputAudios = 1;
        caps.operations = [
          {
            key: 'video-synthesis.t2v',
            execution: 'async',
            description: '万相 wan2.7 文生视频（提交 /services/aigc/video-generation/video-synthesis，轮询 /tasks/{id}）。',
            requiredParameters: ['model', 'prompt'],
            optionalParameters: ['negativePrompt', 'audioUrl', 'resolution', 'ratio', 'duration', 'prompt_extend', 'watermark', 'seed'],
          },
        ];
        return withAdminOverrides(caps, model, remoteModel);
      }

      if (wanx27Kind === 'i2v') {
        caps.supports.multiImageInput = false;
        caps.limits.maxInputImages = 2;
        caps.limits.maxInputVideos = 1;
        caps.limits.maxInputAudios = 1;
        caps.operations = [
          {
            key: 'video-synthesis.i2v',
            execution: 'async',
            description: '万相 wan2.7 图生视频/视频续写（提交 /services/aigc/video-generation/video-synthesis，轮询 /tasks/{id}）。',
            requiredParameters: ['model'],
            optionalParameters: ['prompt', 'negativePrompt', 'firstFrame', 'lastFrame', 'firstClip', 'drivingAudio', 'resolution', 'duration', 'prompt_extend', 'watermark', 'seed'],
          },
        ];
        return withAdminOverrides(caps, model, remoteModel);
      }

      if (wanx27Kind === 'r2v') {
        caps.supports.multiImageInput = true;
        caps.limits.maxInputImages = 5;
        caps.limits.maxInputVideos = 5;
        caps.limits.maxInputAudios = 5;
        caps.operations = [
          {
            key: 'video-synthesis.r2v',
            execution: 'async',
            description: '万相 wan2.7 参考生视频（提交 /services/aigc/video-generation/video-synthesis，轮询 /tasks/{id}）。',
            requiredParameters: ['model', 'prompt'],
            optionalParameters: ['negativePrompt', 'referenceImages', 'referenceVideos', 'referenceAudios', 'firstFrame', 'resolution', 'ratio', 'duration', 'prompt_extend', 'watermark', 'seed'],
          },
        ];
        return withAdminOverrides(caps, model, remoteModel);
      }

      caps.supports.multiImageInput = true;
      caps.limits.maxInputImages = 5;
      caps.limits.maxInputVideos = isWan26 ? 3 : 5;
      caps.limits.maxInputAudios = isWan27 ? 5 : undefined;
      caps.operations = [
        {
          key: isWan26 ? 'video-synthesis.legacy' : 'video-synthesis',
          execution: 'async',
          description: isWan26
            ? '万相 wan2.6 参考生视频（提交 /services/aigc/video-generation/video-synthesis，轮询 /tasks/{id}）。'
            : '万相 wan2.7 视频生成（提交 /services/aigc/video-generation/video-synthesis，轮询 /tasks/{id}）。',
          requiredParameters: ['model', 'prompt'],
          optionalParameters: isWan26
            ? ['referenceUrls', 'size', 'duration', 'shot_type', 'audio', 'watermark', 'seed']
            : ['referenceImages', 'referenceVideos', 'referenceAudios', 'firstFrame', 'resolution', 'ratio', 'duration', 'prompt_extend', 'watermark', 'seed'],
        },
      ];
      return withAdminOverrides(caps, model, remoteModel);
    }

    return withAdminOverrides(caps, model, remoteModel);
  }

  if (type !== 'image') return withAdminOverrides(caps, model, remoteModel);

  if (providerKey === 'nanobanana') {
    // Gemini native image generation via generateContent. Synchronous output (base64).
    caps.operationParamKey = null;
    caps.supports.imageToImage = true;
    caps.supports.multiImageInput = true;
    caps.supports.mask = false;
    caps.supports.async = false;
    caps.supports.followUpActions = false;

    if (remoteModel === 'gemini-3-pro-image-preview') {
      caps.supports.highRes = true;
      caps.limits.maxInputImages = 14;
      caps.limits.imageSizes = ['2K', '4K'];
    } else {
      caps.supports.highRes = false;
      caps.limits.maxInputImages = 3;
    }

    caps.operations = [
      {
        key: 'generateContent',
        execution: 'sync',
        description: 'Gemini 原生图片生成（文生图/图生图/多图）',
        optionalParameters: ['images', 'imageUrl', 'imageBase64', 'aspectRatio', 'imageSize', 'responseModalities', 'tools'],
      },
    ];

    return withAdminOverrides(caps, model, remoteModel);
  }

  if (providerKey === 'gptimage') {
    caps.operationParamKey = 'gptImageOperation';
    caps.supports.imageToImage = true;
    caps.supports.multiImageInput = true;
    caps.supports.mask = true;
    caps.supports.async = false;
    caps.supports.followUpActions = false;
    caps.limits.maxInputImages = 4;
    caps.operations = [
      {
        key: 'generations',
        execution: 'sync',
        description: '文生图',
        optionalParameters: ['model', 'n', 'size', 'quality', 'background'],
      },
      {
        key: 'edits',
        execution: 'sync',
        description: '图生图',
        requiredParameters: ['image(imageUrl/imageBase64/images[])'],
        optionalParameters: ['mask(maskUrl/maskBase64)', 'model', 'n', 'size', 'quality', 'background'],
      },
    ];
    return withAdminOverrides(caps, model, remoteModel);
  }

  if (providerKey === 'doubao') {
    caps.operationParamKey = null;
    caps.supports.imageToImage = true;
    caps.supports.multiImageInput = true;
    caps.supports.mask = false;
    caps.supports.async = false;
    caps.supports.followUpActions = false;
    caps.limits.maxInputImages = 4;
    caps.operations = [
      {
        key: 'imageGenerations',
        execution: 'sync',
        description: '图片生成',
        optionalParameters: [
          'model',
          'prompt',
          'image',
          'size',
          'seed',
          'response_format',
          'watermark',
          'sequential_image_generation',
          'sequential_image_generation_options',
        ],
        notes: ['当前后端实现仅支持非流式 stream=false。'],
      },
    ];
    return withAdminOverrides(caps, model, remoteModel);
  }

  if (providerKey === 'midjourney') {
    caps.operationParamKey = 'mjOperation';
    caps.supports.imageToImage = true; // via blend / modal / describe / base64Array in imagine
    caps.supports.multiImageInput = true; // base64Array in imagine, up to N images
    caps.supports.mask = true; // modal maskBase64
    caps.supports.async = true;
    caps.supports.webhook = true;
    caps.supports.followUpActions = true;
    caps.limits.maxInputImages = 5; // Midjourney 支持最多 5 张垫图
    caps.followUp = {
      midjourneyActionEndpoint: '/images/tasks/:id/midjourney/action',
      midjourneyModalEndpoint: '/images/tasks/:id/midjourney/modal',
    };
    caps.operations = [
      {
        key: 'imagine',
        execution: 'async',
        description: '文生图/图生图',
        optionalParameters: ['base64Array', 'aspectRatio', 'style', 'seed']
      },
      { key: 'describe', execution: 'async', description: 'MJ 图生文（/mj/submit/describe）。', requiredParameters: ['base64'] },
      { key: 'blend', execution: 'async', description: 'MJ 图片混合（/mj/submit/blend）。', requiredParameters: ['base64Array'] },
      { key: 'shorten', execution: 'async', description: 'MJ prompt 分析（/mj/submit/shorten）。', requiredParameters: ['prompt'] },
      {
        key: 'action',
        execution: 'async',
        description: 'MJ 对已生成图片执行操作（放大/重绘/变焦等）。使用独立接口提交。',
        notes: ['使用 GET /images/tasks/:id 获取 buttons.customId，再调用 midjourneyActionEndpoint。'],
      },
      {
        key: 'modal',
        execution: 'async',
        description: 'MJ 操作需要弹窗时提交（mask/补 prompt）。使用独立接口提交。',
        notes: ['当任务 errorMessage=MODAL 时需要调用 midjourneyModalEndpoint。'],
      },
    ];
    return withAdminOverrides(caps, model, remoteModel);
  }

  if (providerKey === 'qwen') {
    caps.operationParamKey = null;
    caps.supports.imageToImage = true;
    caps.supports.multiImageInput = true;
    caps.supports.mask = false;
    caps.supports.async = false;
    caps.supports.followUpActions = false;
    caps.supports.highRes = true;
    caps.limits.maxInputImages = 4;
    caps.limits.imageSizes = ['1024*1024', '2048*2048', '2688*1536', '1728*2304'];
    caps.operations = [
      {
        key: 'multimodalGeneration',
        execution: 'sync',
        description: 'DashScope 通义千问多模态图片生成（文生图/多图生图，同步返回图片 URL）。',
        requiredParameters: ['model', 'prompt'],
        optionalParameters: ['images', 'imageBase64', 'imageUrl', 'n', 'size', 'watermark'],
      },
    ];
    return withAdminOverrides(caps, model, remoteModel);
  }

  // Unknown provider: keep defaults
  return withAdminOverrides(caps, model, remoteModel);
}
