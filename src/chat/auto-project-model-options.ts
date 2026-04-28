import { AiModel } from '@prisma/client';

import { normalizeProviderKey } from '../common/utils/provider.util';
import { buildModelCapabilities } from '../models/model-capabilities';

export type AutoProjectModelOptionCatalog = {
  aspectRatios: string[];
  resolutions: string[];
  durations: string[];
};

const GPT_IMAGE_SIZE_VALUES = ['1024x1024', '1536x1024', '1024x1536'];
const QWEN_IMAGE_SIZE_VALUES = [
  '720*1280',
  '768*1152',
  '1024*1024',
  '1024*1536',
  '1152*768',
  '1280*720',
  '1536*1024',
  '2048*2048',
  '2688*1536',
  '1728*2304',
];
const NANO_BANANA_ASPECT_RATIO_VALUES = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '3:2', '2:3', '5:4', '4:5'];
const NANO_BANANA_IMAGE_SIZE_VALUES = ['2K', '4K'];
const DOUBAO_IMAGE_RESOLUTION_VALUES = ['2K', '4K'];
const COMMON_ASPECT_RATIO_VALUES = ['1:1', '4:3', '3:4', '16:9', '9:16'];

const DOUBAO_VIDEO_RESOLUTION_VALUES = ['480p', '720p', '1080p'];
const DOUBAO_VIDEO_RATIO_VALUES = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
const DOUBAO_VIDEO_DURATION_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
const WANX_VIDEO_RESOLUTION_VALUES = ['720P', '1080P'];
const WANX_VIDEO_RATIO_VALUES = ['16:9', '9:16', '1:1', '4:3', '3:4'];
const WANX_VIDEO_DURATION_VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
const HAPPYHORSE_VIDEO_DURATION_VALUES = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];

function dedupe(values: string[]) {
  return [...new Set(values.map((item) => item.trim()).filter((item) => item.length > 0))];
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
}

function expandTokenCandidates(value: string) {
  const normalized = normalizeToken(value);
  const candidates = new Set<string>([normalized]);

  if (normalized.includes('x')) {
    candidates.add(normalized.replace(/x/g, '*'));
    candidates.add(normalized.replace(/x/g, ':'));
  }
  if (normalized.includes('*')) {
    candidates.add(normalized.replace(/\*/g, 'x'));
    candidates.add(normalized.replace(/\*/g, ':'));
  }
  if (normalized.includes(':')) {
    candidates.add(normalized.replace(/:/g, 'x'));
    candidates.add(normalized.replace(/:/g, '*'));
  }

  const numericPrefixMatch = normalized.match(/^(\d+)(?:s|sec|secs|second|seconds|秒)?$/);
  if (numericPrefixMatch) {
    candidates.add(numericPrefixMatch[1]);
    candidates.add(`${numericPrefixMatch[1]}s`);
  }

  if (normalized.endsWith('秒')) {
    candidates.add(normalized.replace(/秒$/g, ''));
  }

  return [...candidates];
}

function findCanonicalAllowed(value: string | null | undefined, allowed: string[]) {
  const normalizedValue = (value ?? '').trim();
  if (!normalizedValue) return null;
  if (allowed.length === 0) return null;

  const allowedIndex = new Map<string, string>();
  for (const option of allowed) {
    for (const candidate of expandTokenCandidates(option)) {
      if (!allowedIndex.has(candidate)) {
        allowedIndex.set(candidate, option);
      }
    }
  }

  for (const candidate of expandTokenCandidates(normalizedValue)) {
    const matched = allowedIndex.get(candidate);
    if (matched) return matched;
  }

  const numericValue = normalizeToken(normalizedValue).match(/^(\d+)/)?.[1];
  if (numericValue) {
    for (const option of allowed) {
      const optionNumeric = normalizeToken(option).match(/^(\d+)/)?.[1];
      if (optionNumeric && optionNumeric === numericValue) {
        return option;
      }
    }
  }

  return null;
}

function parseDurationNumber(value: string | null | undefined) {
  const normalizedValue = (value ?? '').trim();
  if (!normalizedValue) return null;

  const numericMatch = normalizeToken(normalizedValue).match(/(\d{1,3})/);
  if (!numericMatch?.[1]) return null;

  const numeric = Number(numericMatch[1]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeAutoProjectVideoDuration(
  value: string | null | undefined,
  allowedDurations: string[],
) {
  const canonical = findCanonicalAllowed(value, allowedDurations);
  if (canonical) return canonical;

  const numericValue = parseDurationNumber(value);
  if (numericValue === null) return null;

  if (allowedDurations.length === 0) {
    return String(numericValue);
  }

  const numericOptions = allowedDurations
    .map((option) => {
      const numeric = parseDurationNumber(option);
      return numeric === null ? null : { option, numeric };
    })
    .filter((item): item is { option: string; numeric: number } => Boolean(item))
    .sort((left, right) => left.numeric - right.numeric);

  if (numericOptions.length === 0) return null;

  const minOption = numericOptions[0];
  const maxOption = numericOptions[numericOptions.length - 1];
  if (numericValue <= minOption.numeric) return minOption.option;
  if (numericValue >= maxOption.numeric) return maxOption.option;

  return numericOptions.reduce((closest, current) => {
    const closestDistance = Math.abs(closest.numeric - numericValue);
    const currentDistance = Math.abs(current.numeric - numericValue);
    return currentDistance < closestDistance ? current : closest;
  }).option;
}

export function getAutoProjectImageOptionCatalog(model: AiModel): AutoProjectModelOptionCatalog {
  const provider = normalizeProviderKey(model.provider);
  const capabilities = buildModelCapabilities(model, null);
  const remoteModel = (capabilities.remoteModel ?? '').toLowerCase();

  if (provider.includes('gpt') || provider.includes('openai')) {
    return {
      aspectRatios: [],
      resolutions: GPT_IMAGE_SIZE_VALUES,
      durations: [],
    };
  }

  if (provider.includes('qwen')) {
    return {
      aspectRatios: [],
      resolutions: QWEN_IMAGE_SIZE_VALUES,
      durations: [],
    };
  }

  if (provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')) {
    return {
      aspectRatios: NANO_BANANA_ASPECT_RATIO_VALUES,
      resolutions:
        capabilities.supports.resolutionSelect || remoteModel.includes('pro')
          ? NANO_BANANA_IMAGE_SIZE_VALUES
          : [],
      durations: [],
    };
  }

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return {
      aspectRatios: [],
      resolutions: DOUBAO_IMAGE_RESOLUTION_VALUES,
      durations: [],
    };
  }

  return {
    aspectRatios: capabilities.supports.sizeSelect ? COMMON_ASPECT_RATIO_VALUES : [],
    resolutions: [],
    durations: [],
  };
}

export function getAutoProjectVideoOptionCatalog(model: AiModel): AutoProjectModelOptionCatalog {
  const provider = normalizeProviderKey(model.provider);
  const capabilities = buildModelCapabilities(model, null);
  const remoteModel = (capabilities.remoteModel ?? '').toLowerCase();

  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return {
      aspectRatios: DOUBAO_VIDEO_RATIO_VALUES,
      resolutions:
        remoteModel.includes('seedance-2-0')
          ? DOUBAO_VIDEO_RESOLUTION_VALUES.filter((item) => item !== '1080p')
          : DOUBAO_VIDEO_RESOLUTION_VALUES,
      durations: dedupe(
        DOUBAO_VIDEO_DURATION_VALUES.filter((item) => {
          const numeric = Number(item);
          if (!Number.isFinite(numeric)) return false;
          if (remoteModel.includes('seedance-2-0')) return numeric >= 4 && numeric <= 15;
          if (remoteModel.includes('seedance-1-5')) return numeric >= 4 && numeric <= 12;
          return numeric >= 2 && numeric <= 12;
        }),
      ),
    };
  }

  if (provider.includes('wanx') || provider.includes('wanxiang')) {
    return {
      aspectRatios: WANX_VIDEO_RATIO_VALUES,
      resolutions: WANX_VIDEO_RESOLUTION_VALUES,
      durations: remoteModel.includes('happyhorse-1.0')
        ? HAPPYHORSE_VIDEO_DURATION_VALUES
        : WANX_VIDEO_DURATION_VALUES,
    };
  }

  return {
    aspectRatios: capabilities.supports.sizeSelect ? COMMON_ASPECT_RATIO_VALUES : [],
    resolutions: [],
    durations: [],
  };
}

export function sanitizeAutoProjectImagePreferences(
  model: AiModel,
  input: {
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
  },
) {
  const provider = normalizeProviderKey(model.provider);
  const catalog = getAutoProjectImageOptionCatalog(model);

  let preferredAspectRatio = findCanonicalAllowed(input.preferredAspectRatio, catalog.aspectRatios);
  let preferredResolution = findCanonicalAllowed(input.preferredResolution, catalog.resolutions);

  if (!preferredResolution && catalog.resolutions.length > 0) {
    preferredResolution = findCanonicalAllowed(input.preferredAspectRatio, catalog.resolutions);
  }

  if (
    preferredResolution &&
    (provider.includes('gpt') ||
      provider.includes('openai') ||
      provider.includes('qwen') ||
      provider.includes('doubao') ||
      provider.includes('bytedance') ||
      provider.includes('ark'))
  ) {
    preferredAspectRatio = null;
  }

  return {
    preferredAspectRatio,
    preferredResolution,
  };
}

export function sanitizeAutoProjectVideoPreferences(
  model: AiModel,
  input: {
    preferredAspectRatio?: string | null;
    preferredResolution?: string | null;
    preferredDuration?: string | null;
  },
) {
  const catalog = getAutoProjectVideoOptionCatalog(model);

  const preferredAspectRatio = findCanonicalAllowed(input.preferredAspectRatio, catalog.aspectRatios);
  const preferredResolution = findCanonicalAllowed(input.preferredResolution, catalog.resolutions);
  const preferredDuration = normalizeAutoProjectVideoDuration(input.preferredDuration, catalog.durations);

  return {
    preferredAspectRatio,
    preferredResolution,
    preferredDuration,
  };
}
