import { AiModel } from '@prisma/client';

import { normalizeProviderKey } from '../common/utils/provider.util';
import { buildModelCapabilities } from '../models/model-capabilities';
import {
  sanitizeAutoProjectImagePreferences,
  sanitizeAutoProjectVideoPreferences,
} from './auto-project-model-options';

type ChatImageTaskPreferenceInput = {
  preferredAspectRatio?: string | null;
  preferredResolution?: string | null;
};

type ChatVideoTaskPreferenceInput = {
  preferredAspectRatio?: string | null;
  preferredResolution?: string | null;
  preferredDuration?: string | null;
};

type BuildChatImageTaskParameterInput = ChatImageTaskPreferenceInput & {
  hasReferenceImages: boolean;
};

function resolveChatImageTaskDefaults(model: AiModel) {
  const provider = normalizeProviderKey(model.provider);
  const capabilities = buildModelCapabilities(model, null);
  const remoteModel = (capabilities.remoteModel ?? '').toLowerCase();

  if (provider.includes('qwen')) {
    return {
      preferredAspectRatio: null,
      preferredResolution: '720*1280',
    };
  }

  if (provider.includes('gpt') || provider.includes('openai')) {
    return {
      preferredAspectRatio: null,
      preferredResolution: 'auto',
    };
  }

  if (provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')) {
    return {
      preferredAspectRatio: null,
      preferredResolution:
        capabilities.supports.resolutionSelect || remoteModel.includes('pro')
          ? '2K'
          : null,
    };
  }

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return {
      preferredAspectRatio: null,
      preferredResolution: '2K',
    };
  }

  return {
    preferredAspectRatio: capabilities.supports.sizeSelect ? '1:1' : null,
    preferredResolution: null,
  };
}

function resolveChatVideoTaskDefaults(model: AiModel) {
  const provider = normalizeProviderKey(model.provider);

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return {
      preferredAspectRatio: '16:9',
      preferredResolution: '720p',
      preferredDuration: '5',
    };
  }

  return {
    preferredAspectRatio: '1:1',
    preferredResolution: null,
    preferredDuration: '5',
  };
}

export function resolveChatImageTaskPreferences(model: AiModel, input: ChatImageTaskPreferenceInput) {
  const sanitized = sanitizeAutoProjectImagePreferences(model, {
    preferredAspectRatio: input.preferredAspectRatio ?? null,
    preferredResolution: input.preferredResolution ?? null,
  });
  const defaults = resolveChatImageTaskDefaults(model);

  return {
    preferredAspectRatio: sanitized.preferredAspectRatio ?? defaults.preferredAspectRatio,
    preferredResolution: sanitized.preferredResolution ?? defaults.preferredResolution,
  };
}

export function resolveChatVideoTaskPreferences(model: AiModel, input: ChatVideoTaskPreferenceInput) {
  const sanitized = sanitizeAutoProjectVideoPreferences(model, {
    preferredAspectRatio: input.preferredAspectRatio ?? null,
    preferredResolution: input.preferredResolution ?? null,
    preferredDuration: input.preferredDuration ?? null,
  });
  const defaults = resolveChatVideoTaskDefaults(model);

  return {
    preferredAspectRatio: sanitized.preferredAspectRatio ?? defaults.preferredAspectRatio,
    preferredResolution: sanitized.preferredResolution ?? defaults.preferredResolution,
    preferredDuration: sanitized.preferredDuration ?? defaults.preferredDuration,
  };
}

export function buildChatImageTaskParameters(model: AiModel, input: BuildChatImageTaskParameterInput) {
  const provider = normalizeProviderKey(model.provider);
  const capabilities = buildModelCapabilities(model, null);
  const remoteModel = capabilities.remoteModel || undefined;
  const preferences = resolveChatImageTaskPreferences(model, input);
  const parameters: Record<string, unknown> = {};

  if (provider.includes('qwen')) {
    parameters.aspectRatio = null;
    parameters.aspect_ratio = null;
    parameters.imageSize = null;
    parameters.image_size = null;
    parameters.size = preferences.preferredResolution;
    parameters.n = 1;
    parameters.watermark = false;
    if (remoteModel) parameters.model = remoteModel;
    return parameters;
  }

  if (provider.includes('gpt') || provider.includes('openai')) {
    parameters.aspectRatio = null;
    parameters.aspect_ratio = null;
    parameters.imageSize = null;
    parameters.image_size = null;
    parameters.size = preferences.preferredResolution;
    return parameters;
  }

  if (provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')) {
    parameters.size = null;
    parameters.aspect_ratio = null;
    parameters.image_size = null;
    parameters.aspectRatio = preferences.preferredAspectRatio;
    parameters.imageSize = preferences.preferredResolution;
    parameters.responseModalities = ['IMAGE'];
    return parameters;
  }

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    parameters.aspectRatio = null;
    parameters.aspect_ratio = null;
    parameters.imageSize = null;
    parameters.image_size = null;
    parameters.size = preferences.preferredResolution;
    parameters.response_format = 'url';
    parameters.watermark = false;
    if (remoteModel) parameters.model = remoteModel;
    return parameters;
  }

  parameters.size = null;
  parameters.imageSize = null;
  parameters.image_size = null;
  parameters.aspect_ratio = null;
  parameters.aspectRatio = preferences.preferredAspectRatio;
  return parameters;
}

export function buildChatVideoTaskParameters(model: AiModel, input: ChatVideoTaskPreferenceInput) {
  const provider = normalizeProviderKey(model.provider);
  const capabilities = buildModelCapabilities(model, null);
  const remoteModel = capabilities.remoteModel || undefined;
  const preferences = resolveChatVideoTaskPreferences(model, input);
  const parameters: Record<string, unknown> = {};

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    parameters.size = null;
    parameters.seconds = null;
    parameters.resolution = preferences.preferredResolution ?? '720p';
    parameters.ratio = preferences.preferredAspectRatio ?? '16:9';
    parameters.duration = Number.parseInt(preferences.preferredDuration ?? '5', 10) || 5;
    parameters.watermark = false;
    if (remoteModel) parameters.model = remoteModel;
    return parameters;
  }

  if (provider.includes('wanx') || provider.includes('wanxiang')) {
    parameters.size = null;
    parameters.seconds = null;
    parameters.aspectRatio = null;
    parameters.resolution = preferences.preferredResolution ?? '720P';
    parameters.duration = Number.parseInt(preferences.preferredDuration ?? '5', 10) || 5;
    parameters.watermark = false;
    if (remoteModel?.includes('-r2v') || remoteModel?.includes('-t2v')) {
      parameters.ratio = preferences.preferredAspectRatio ?? '16:9';
    } else {
      parameters.ratio = null;
    }
    if (remoteModel) parameters.model = remoteModel;
    return parameters;
  }

  parameters.size = null;
  parameters.seconds = null;
  parameters.ratio = null;
  if (preferences.preferredResolution) parameters.resolution = preferences.preferredResolution;
  if (preferences.preferredDuration) parameters.duration = preferences.preferredDuration;
  if (preferences.preferredAspectRatio) parameters.aspectRatio = preferences.preferredAspectRatio;
  return parameters;
}
