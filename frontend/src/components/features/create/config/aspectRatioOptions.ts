/**
 * 图片尺寸/比例配置
 * 根据不同的AI提供商定义不同的尺寸选项
 */

import {
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Smartphone,
  Monitor,
  TabletSmartphone,
  Film,
  Tv,
  Clock,
  Wand2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export interface AspectRatioOption {
  value: string
  label: string
  description: string
  icon: LucideIcon
  width?: number // 用于视觉预览
  height?: number
}

// GPT Image 尺寸选项（固定像素尺寸，不显示比例预览）
export const GPT_IMAGE_SIZE_OPTIONS: AspectRatioOption[] = [
  {
    value: 'auto',
    label: 'Auto',
    description: '自动选择最佳尺寸',
    icon: Square,
  },
  {
    value: '1024x1024',
    label: '1024×1024',
    description: '正方形 - 1024x1024 像素',
    icon: Square,
  },
  {
    value: '1536x1024',
    label: '1536×1024',
    description: '横版 - 1536x1024 像素',
    icon: RectangleHorizontal,
  },
  {
    value: '1024x1536',
    label: '1024×1536',
    description: '竖版 - 1024x1536 像素',
    icon: RectangleVertical,
  },
]

// Qwen 图片尺寸选项（DashScope size 使用 "*" 连接）
export const QWEN_IMAGE_SIZE_OPTIONS: AspectRatioOption[] = [
  {
    value: '720*1280',
    label: '720×1280',
    description: '竖版 - 手机长图',
    icon: Smartphone,
    width: 9,
    height: 16,
  },
  {
    value: '768*1152',
    label: '768×1152',
    description: '竖版 - 标准海报',
    icon: RectangleVertical,
    width: 2,
    height: 3,
  },
  {
    value: '1024*1024',
    label: '1024×1024',
    description: '正方形 - 标准分辨率',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '1024*1536',
    label: '1024×1536',
    description: '竖版 - 高清海报',
    icon: RectangleVertical,
    width: 2,
    height: 3,
  },
  {
    value: '1152*768',
    label: '1152×768',
    description: '横版 - 标准海报',
    icon: RectangleHorizontal,
    width: 3,
    height: 2,
  },
  {
    value: '1280*720',
    label: '1280×720',
    description: '横版 - 宽屏',
    icon: Tv,
    width: 16,
    height: 9,
  },
  {
    value: '1536*1024',
    label: '1536×1024',
    description: '横版 - 高清海报',
    icon: RectangleHorizontal,
    width: 3,
    height: 2,
  },
  {
    value: '2048*2048',
    label: '2048×2048',
    description: '正方形 - 高清分辨率',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '2688*1536',
    label: '2688×1536',
    description: '横版 - 高清分辨率',
    icon: RectangleHorizontal,
    width: 4,
    height: 3,
  },
  {
    value: '1728*2304',
    label: '1728×2304',
    description: '竖版 - 高清分辨率',
    icon: RectangleVertical,
    width: 3,
    height: 4,
  },
]

// Nano Banana（Gemini）比例选项
export const NANO_BANANA_ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    value: '',
    label: '默认',
    description: '使用模型默认比例',
    icon: Square,
  },
  {
    value: '1:1',
    label: '1:1',
    description: '正方形',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '4:3',
    label: '4:3',
    description: '标准横版',
    icon: Monitor,
    width: 4,
    height: 3,
  },
  {
    value: '3:4',
    label: '3:4',
    description: '标准竖版',
    icon: TabletSmartphone,
    width: 3,
    height: 4,
  },
  {
    value: '16:9',
    label: '16:9',
    description: '宽屏横版',
    icon: Tv,
    width: 16,
    height: 9,
  },
  {
    value: '9:16',
    label: '9:16',
    description: '手机竖屏',
    icon: Smartphone,
    width: 9,
    height: 16,
  },
  {
    value: '21:9',
    label: '21:9',
    description: '超宽屏',
    icon: Film,
    width: 21,
    height: 9,
  },
  {
    value: '3:2',
    label: '3:2',
    description: '经典横版',
    icon: RectangleHorizontal,
    width: 3,
    height: 2,
  },
  {
    value: '2:3',
    label: '2:3',
    description: '经典竖版',
    icon: RectangleVertical,
    width: 2,
    height: 3,
  },
  {
    value: '5:4',
    label: '5:4',
    description: '微横版',
    icon: RectangleHorizontal,
    width: 5,
    height: 4,
  },
  {
    value: '4:5',
    label: '4:5',
    description: '微竖版',
    icon: RectangleVertical,
    width: 4,
    height: 5,
  },
]

// Nano Banana（Gemini）分辨率选项
export const NANO_BANANA_IMAGE_SIZE_OPTIONS: AspectRatioOption[] = [
  {
    value: '',
    label: '默认',
    description: '使用模型默认分辨率',
    icon: Square,
  },
  {
    value: '2K',
    label: '2K',
    description: '高清 (~2048px)',
    icon: Square,
  },
  {
    value: '4K',
    label: '4K',
    description: '超高清 (~4096px)',
    icon: Square,
  },
]

// 豆包（Doubao）分辨率选项（只支持分辨率，不支持选择具体尺寸）
export const DOUBAO_RESOLUTION_OPTIONS: AspectRatioOption[] = [
  {
    value: '',
    label: '默认',
    description: '使用模型默认分辨率',
    icon: Square,
  },
  {
    value: '2K',
    label: '2K',
    description: '高清 (~2048px)',
    icon: Square,
  },
  {
    value: '4K',
    label: '4K',
    description: '超高清 (~4096px)',
    icon: Square,
  },
]

// 豆包视频分辨率选项（480p, 720p, 1080p）
export const DOUBAO_VIDEO_RESOLUTION_OPTIONS: AspectRatioOption[] = [
  {
    value: '480p',
    label: '480p',
    description: '标清',
    icon: Tv,
  },
  {
    value: '720p',
    label: '720p',
    description: '高清',
    icon: Tv,
  },
  {
    value: '1080p',
    label: '1080p',
    description: '全高清',
    icon: Tv,
  },
]

// 豆包视频宽高比选项
export const DOUBAO_VIDEO_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    value: '16:9',
    label: '16:9',
    description: '横屏 - 标准',
    icon: Tv,
    width: 16,
    height: 9,
  },
  {
    value: '4:3',
    label: '4:3',
    description: '横屏 - 经典',
    icon: Monitor,
    width: 4,
    height: 3,
  },
  {
    value: '1:1',
    label: '1:1',
    description: '正方形',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '3:4',
    label: '3:4',
    description: '竖屏 - 经典',
    icon: TabletSmartphone,
    width: 3,
    height: 4,
  },
  {
    value: '9:16',
    label: '9:16',
    description: '竖屏 - 手机',
    icon: Smartphone,
    width: 9,
    height: 16,
  },
  {
    value: '21:9',
    label: '21:9',
    description: '超宽屏',
    icon: Film,
    width: 21,
    height: 9,
  },
  {
    value: 'adaptive',
    label: 'Adaptive',
    description: '自适应',
    icon: Square,
  },
]

// 豆包视频时长选项（完整基础集合；具体模型会在调用方按 remoteModel 过滤）
export const DOUBAO_VIDEO_DURATION_OPTIONS: AspectRatioOption[] = [
  {
    value: '2',
    label: '2秒',
    description: '极短视频',
    icon: Clock,
  },
  {
    value: '3',
    label: '3秒',
    description: '超短视频',
    icon: Clock,
  },
  {
    value: '4',
    label: '4秒',
    description: '短视频',
    icon: Clock,
  },
  {
    value: '5',
    label: '5秒',
    description: '标准时长',
    icon: Clock,
  },
  {
    value: '6',
    label: '6秒',
    description: '中短视频',
    icon: Clock,
  },
  {
    value: '7',
    label: '7秒',
    description: '中短视频',
    icon: Clock,
  },
  {
    value: '8',
    label: '8秒',
    description: '中等时长',
    icon: Clock,
  },
  {
    value: '9',
    label: '9秒',
    description: '中等时长',
    icon: Clock,
  },
  {
    value: '10',
    label: '10秒',
    description: '较长视频',
    icon: Clock,
  },
  {
    value: '11',
    label: '11秒',
    description: '较长视频',
    icon: Clock,
  },
  {
    value: '12',
    label: '12秒',
    description: '长视频',
    icon: Clock,
  },
  {
    value: '13',
    label: '13秒',
    description: '长视频',
    icon: Clock,
  },
  {
    value: '14',
    label: '14秒',
    description: '长视频',
    icon: Clock,
  },
  {
    value: '15',
    label: '15秒',
    description: '超长视频',
    icon: Clock,
  },
]

// 通用比例选项（用于其他provider）
export const COMMON_ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    value: '',
    label: '默认',
    description: '使用模型默认比例',
    icon: Square,
  },
  {
    value: '1:1',
    label: '1:1',
    description: '正方形',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '4:3',
    label: '4:3',
    description: '横版',
    icon: RectangleHorizontal,
    width: 4,
    height: 3,
  },
  {
    value: '3:4',
    label: '3:4',
    description: '竖版',
    icon: RectangleVertical,
    width: 3,
    height: 4,
  },
  {
    value: '16:9',
    label: '16:9',
    description: '宽屏',
    icon: Tv,
    width: 16,
    height: 9,
  },
  {
    value: '9:16',
    label: '9:16',
    description: '手机竖屏',
    icon: Smartphone,
    width: 9,
    height: 16,
  },
]

/**
 * 根据provider获取对应的尺寸选项
 *
 * 注意：
 * - Nano Banana: 返回比例选项（需配合 getImageSizeOptions 使用）
 * - 豆包: 返回空数组（只需分辨率，通过 getImageSizeOptions 获取）
 * - GPT Image: 返回固定像素尺寸选项
 * - 其他 provider: 返回通用比例选项（使用 ":" 连接符，如 "16:9"）
 */
export function getAspectRatioOptions(provider?: string): AspectRatioOption[] {
  if (!provider) return COMMON_ASPECT_RATIO_OPTIONS

  const normalizedProvider = provider.toLowerCase()

  // GPT Image / OpenAI
  if (normalizedProvider.includes('gpt') || normalizedProvider.includes('openai')) {
    return GPT_IMAGE_SIZE_OPTIONS
  }

  // Qwen / Qianwen
  if (normalizedProvider.includes('qwen') || normalizedProvider.includes('qianwen')) {
    return QWEN_IMAGE_SIZE_OPTIONS
  }

  // Nano Banana / Gemini / Google
  if (normalizedProvider.includes('nanobanana') || normalizedProvider.includes('gemini') || normalizedProvider.includes('google')) {
    return NANO_BANANA_ASPECT_RATIO_OPTIONS
  }

  // 豆包 / Bytedance / Ark
  if (normalizedProvider.includes('doubao') || normalizedProvider.includes('bytedance') || normalizedProvider.includes('ark')) {
    return [] // 豆包只需要分辨率，不需要比例选项
  }

  return COMMON_ASPECT_RATIO_OPTIONS
}

/**
 * 获取分辨率选项（仅部分provider支持）
 *
 * 注意：
 * - Nano Banana Pro: 返回 2K/4K 分辨率选项（普通 Nano Banana 不支持）
 * - Gemini 3 Pro: 返回 2K/4K 分辨率选项
 * - 豆包: 返回 2K/4K 分辨率选项
 */
export function getImageSizeOptions(provider?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()

  // Nano Banana Pro / Gemini Pro（支持多种命名格式）
  if (normalizedProvider.includes('nanobananapro') ||
      normalizedProvider.includes('nano_banana_pro') ||
      normalizedProvider.includes('nano-banana-pro') ||
      normalizedProvider.includes('nanobanana pro') ||
      (normalizedProvider.includes('nanobanana') && normalizedProvider.includes('pro')) ||
      (normalizedProvider.includes('gemini') && normalizedProvider.includes('pro'))) {
    return NANO_BANANA_IMAGE_SIZE_OPTIONS
  }

  // 豆包 / Bytedance / Ark
  if (normalizedProvider.includes('doubao') || normalizedProvider.includes('bytedance') || normalizedProvider.includes('ark')) {
    return DOUBAO_RESOLUTION_OPTIONS
  }

  return null
}

/**
 * 获取豆包视频分辨率选项
 */
export function getDoubaoVideoResolutionOptions(provider?: string, remoteModel?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase()

  // 豆包 / Bytedance / Ark
  if (normalizedProvider.includes('doubao') || normalizedProvider.includes('bytedance') || normalizedProvider.includes('ark')) {
    if (normalizedRemoteModel.includes('seedance-2-0')) {
      return DOUBAO_VIDEO_RESOLUTION_OPTIONS.filter((option) => option.value !== '1080p')
    }
    return DOUBAO_VIDEO_RESOLUTION_OPTIONS
  }

  return null
}

/**
 * 获取豆包视频宽高比选项
 */
export function getDoubaoVideoRatioOptions(provider?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()

  // 豆包 / Bytedance / Ark
  if (normalizedProvider.includes('doubao') || normalizedProvider.includes('bytedance') || normalizedProvider.includes('ark')) {
    return DOUBAO_VIDEO_RATIO_OPTIONS
  }

  return null
}

/**
 * 获取豆包视频时长选项
 */
export function getDoubaoVideoDurationOptions(provider?: string, remoteModel?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()
  const normalizedRemoteModel = (remoteModel ?? '').toLowerCase()

  // 豆包 / Bytedance / Ark
  if (normalizedProvider.includes('doubao') || normalizedProvider.includes('bytedance') || normalizedProvider.includes('ark')) {
    if (normalizedRemoteModel.includes('seedance-2-0')) {
      return DOUBAO_VIDEO_DURATION_OPTIONS.filter((option) => {
        const value = Number(option.value)
        return Number.isFinite(value) && value >= 4 && value <= 15
      })
    }

    if (normalizedRemoteModel.includes('seedance-1-5')) {
      return DOUBAO_VIDEO_DURATION_OPTIONS.filter((option) => {
        const value = Number(option.value)
        return Number.isFinite(value) && value >= 4 && value <= 12
      })
    }

    return DOUBAO_VIDEO_DURATION_OPTIONS
  }

  return null
}

// Midjourney Bot 类型选项
export const MIDJOURNEY_BOT_TYPE_OPTIONS: AspectRatioOption[] = [
  {
    value: 'MID_JOURNEY',
    label: 'Midjourney',
    description: '通用绘画模型',
    icon: Wand2,
  },
  {
    value: 'NIJI_JOURNEY',
    label: 'Niji',
    description: '动漫风格模型',
    icon: Sparkles,
  },
]

// Midjourney 版本选项
export const MIDJOURNEY_VERSION_OPTIONS: AspectRatioOption[] = [
  { value: '', label: '默认', description: '使用默认版本', icon: Wand2 },
  { value: '7', label: 'V7', description: '最新版本', icon: Wand2 },
  { value: '6.1', label: 'V6.1', description: '稳定版本', icon: Wand2 },
  { value: '6', label: 'V6', description: '经典版本', icon: Wand2 },
  { value: '5.2', label: 'V5.2', description: '旧版本', icon: Wand2 },
]

// Midjourney 质量选项
export const MIDJOURNEY_QUALITY_OPTIONS: AspectRatioOption[] = [
  { value: '', label: '默认', description: '标准质量 (1)', icon: Sparkles },
  { value: '.25', label: '0.25x', description: '快速草稿', icon: Sparkles },
  { value: '.5', label: '0.5x', description: '低质量', icon: Sparkles },
  { value: '1', label: '1x', description: '标准质量', icon: Sparkles },
  { value: '2', label: '2x', description: '高质量（慢）', icon: Sparkles },
]

// Midjourney 风格选项
export const MIDJOURNEY_STYLE_OPTIONS: AspectRatioOption[] = [
  { value: '', label: '默认', description: '不指定风格', icon: Wand2 },
  { value: 'raw', label: 'Raw', description: '更写实、更少美化', icon: Wand2 },
]

export const WANX_VIDEO_RESOLUTION_OPTIONS: AspectRatioOption[] = [
  {
    value: '720P',
    label: '720P',
    description: '标准清晰度',
    icon: Tv,
  },
  {
    value: '1080P',
    label: '1080P',
    description: '更高清晰度',
    icon: Monitor,
  },
]

export const WANX_VIDEO_RATIO_OPTIONS: AspectRatioOption[] = [
  {
    value: '16:9',
    label: '16:9',
    description: '横版宽屏',
    icon: Tv,
    width: 16,
    height: 9,
  },
  {
    value: '9:16',
    label: '9:16',
    description: '竖版短视频',
    icon: Smartphone,
    width: 9,
    height: 16,
  },
  {
    value: '1:1',
    label: '1:1',
    description: '正方形',
    icon: Square,
    width: 1,
    height: 1,
  },
  {
    value: '4:3',
    label: '4:3',
    description: '经典横版',
    icon: Monitor,
    width: 4,
    height: 3,
  },
  {
    value: '3:4',
    label: '3:4',
    description: '经典竖版',
    icon: TabletSmartphone,
    width: 3,
    height: 4,
  },
]

export function createWanxVideoDurationOptions(
  input: boolean | { hasReferenceVideo?: boolean; generation?: string | null } = false
): AspectRatioOption[] {
  const hasReferenceVideo = typeof input === 'boolean' ? input : input.hasReferenceVideo === true
  const generation = typeof input === 'boolean' ? null : input.generation
  const min = generation === 'happyhorse-1.0' ? 3 : 2
  const max = 15

  return Array.from({ length: max - min + 1 }, (_, index) => {
    const seconds = index + min
    return {
      value: String(seconds),
      label: `${seconds}秒`,
      description: generation === 'happyhorse-1.0'
        ? 'HappyHorse 支持时长'
        : hasReferenceVideo ? '包含参考视频' : '视频生成时长',
      icon: Clock,
    }
  })
}

export function getWanxVideoResolutionOptions(provider?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()
  if (normalizedProvider.includes('wanx') || normalizedProvider.includes('wanxiang')) {
    return WANX_VIDEO_RESOLUTION_OPTIONS
  }

  return null
}

export function getWanxVideoRatioOptions(provider?: string): AspectRatioOption[] | null {
  if (!provider) return null

  const normalizedProvider = provider.toLowerCase()
  if (normalizedProvider.includes('wanx') || normalizedProvider.includes('wanxiang')) {
    return WANX_VIDEO_RATIO_OPTIONS
  }

  return null
}
