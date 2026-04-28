import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import {
  getAspectRatioOptions,
  getImageSizeOptions,
  getWanxVideoRatioOptions,
  getWanxVideoResolutionOptions,
  getDoubaoVideoDurationOptions,
  getDoubaoVideoRatioOptions,
  getDoubaoVideoResolutionOptions,
  createWanxVideoDurationOptions,
  type AspectRatioOption,
} from '@/components/features/create/config/aspectRatioOptions'

export const AUTO_AGENT_OPTION_VALUE = '__auto__'

export function normalizeProviderFamily(providerValue?: string | null) {
  const normalized = String(providerValue ?? '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'qianwen') return 'qwen'
  if (normalized === 'mj') return 'midjourney'
  if (normalized === 'wanxiang') return 'wanx'
  return normalized
}

export function isDoubaoFamilyProvider(providerValue?: string | null) {
  const provider = normalizeProviderFamily(providerValue)
  return provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')
}

export function isDefaultLikeAspectRatioOption(option: AspectRatioOption) {
  const normalizedLabel = option.label.toLowerCase()
  return (
    option.value === '' ||
    option.value === 'auto' ||
    option.value === 'adaptive' ||
    normalizedLabel === 'auto' ||
    normalizedLabel === 'adaptive' ||
    normalizedLabel === '默认'
  )
}

function legacySupportsChatAgentImageModel(model: ModelWithCapabilities | null) {
  return Boolean(
    model &&
      model.type === 'image' &&
      model.capabilities?.supports?.contextualEdit
  )
}

function legacySupportsChatAgentVideoModel(model: ModelWithCapabilities | null) {
  return Boolean(
    model &&
      model.type === 'video' &&
      model.capabilities?.supports?.contextualEdit
  )
}

export function isWanxR2vChatAgentVideoModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return false

  const provider = normalizeProviderFamily(model.provider)
  const remoteModel = String(model.capabilities?.remoteModel ?? model.modelKey ?? '').trim().toLowerCase()
  return (
    provider.includes('wanx') &&
    (remoteModel.includes('wan2.7') || remoteModel.includes('happyhorse-1.0')) &&
    remoteModel.includes('-r2v')
  )
}

function legacySupportsChatAutoImageModel(model: ModelWithCapabilities | null) {
  return Boolean(model && model.type === 'image')
}

function legacySupportsChatAutoVideoModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return false

  const provider = normalizeProviderFamily(model.provider)
  return Boolean(
    (
      provider.includes('doubao') ||
      provider.includes('bytedance') ||
      provider.includes('ark') ||
      isWanxR2vChatAgentVideoModel(model)
    ) &&
    (
      model.capabilities?.supports?.imageInput ||
      model.capabilities?.supports?.videoInput ||
      model.capabilities?.supports?.contextualEdit
    )
  )
}

export function supportsChatAgentImageModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'image') return false
  return typeof model.supportsAgentMode === 'boolean'
    ? model.supportsAgentMode
    : legacySupportsChatAgentImageModel(model)
}

export function supportsChatAgentVideoModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return false
  return typeof model.supportsAgentMode === 'boolean'
    ? model.supportsAgentMode
    : legacySupportsChatAgentVideoModel(model)
}

export function supportsChatAutoImageModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'image') return false
  return typeof model.supportsAutoMode === 'boolean'
    ? model.supportsAutoMode
    : legacySupportsChatAutoImageModel(model)
}

export function supportsChatAutoVideoModel(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return false
  return typeof model.supportsAutoMode === 'boolean'
    ? model.supportsAutoMode
    : legacySupportsChatAutoVideoModel(model)
}

export function supportsChatAgentModel(model: ModelWithCapabilities | null) {
  return supportsChatAgentImageModel(model) || supportsChatAgentVideoModel(model)
}

export function getChatAgentReferenceLimits(model: ModelWithCapabilities | null) {
  if (!model) {
    return { images: 0, videos: 0, audios: 0, sharedVisualLimit: null as number | null }
  }

  const sharedVisualLimit = isWanxR2vChatAgentVideoModel(model) ? 5 : null

  return {
    images: model.capabilities.supports.imageInput
      ? Math.max(1, model.capabilities.limits.maxInputImages ?? 1)
      : 0,
    videos:
      model.type === 'video' && model.capabilities.supports.videoInput
        ? Math.max(1, model.capabilities.limits.maxInputVideos ?? 1)
        : 0,
    audios:
      model.type === 'video' && model.capabilities.supports.audioInput
        ? Math.max(1, model.capabilities.limits.maxInputAudios ?? 1)
        : 0,
    sharedVisualLimit,
  }
}

export function getChatAgentImageAspectRatioOptions(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'image') return []
  return getAspectRatioOptions(model.provider).filter((option) => !isDefaultLikeAspectRatioOption(option))
}

export function getChatAgentImageResolutionOptions(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'image') return null
  return getImageSizeOptions(model.provider)
}

export function getChatAgentVideoResolutionOptions(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return null

  const provider = normalizeProviderFamily(model.provider)
  if (provider.includes('wanx')) {
    return getWanxVideoResolutionOptions(model.provider)
  }
  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return getDoubaoVideoResolutionOptions(model.provider, model.capabilities?.remoteModel)
  }

  return null
}

export function getChatAgentVideoDurationOptions(
  model: ModelWithCapabilities | null,
  options?: { hasReferenceVideo?: boolean }
) {
  if (!model || model.type !== 'video') return null

  const provider = normalizeProviderFamily(model.provider)
  if (provider.includes('wanx')) {
    const remoteModel = String(model.capabilities?.remoteModel ?? model.modelKey ?? '').trim().toLowerCase()
    const generation = remoteModel.startsWith('happyhorse-1.0')
      ? 'happyhorse-1.0'
      : remoteModel.startsWith('wan2.7') ? 'wan2.7' : null
    return createWanxVideoDurationOptions({
      hasReferenceVideo: options?.hasReferenceVideo === true,
      generation,
    })
  }
  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return getDoubaoVideoDurationOptions(model.provider, model.capabilities?.remoteModel)
  }

  return null
}

export function getChatAgentVideoRatioOptions(model: ModelWithCapabilities | null) {
  if (!model || model.type !== 'video') return null

  const provider = normalizeProviderFamily(model.provider)
  if (provider.includes('wanx')) {
    return getWanxVideoRatioOptions(model.provider)
  }
  if (provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')) {
    return getDoubaoVideoRatioOptions(model.provider)
  }

  return null
}
