
'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ImageDropzone } from '@/components/ui/ImageDropzone'
import { AspectRatioSelect } from '@/components/ui/AspectRatioSelect'
import {
  Sparkles,
  ImageIcon,
  VideoIcon,
  Info,
  Lightbulb,
  Clock,
  Image as ImageIconSolid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Wand2,
  FolderKanban,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageTransition } from '@/components/shared/PageTransition'
import { FadeIn } from '@/components/shared/FadeIn'
import { useAuthStore } from '@/lib/store/authStore'
import { cn } from '@/lib/utils/cn'
import { upsertTaskInTasksViewCache } from '@/lib/cache/viewCache'

import { SimplifiedModelSelector } from './SimplifiedModelSelector'
import { ProjectContextPanel } from './ProjectContextPanel'
import { PromptOptimizePanel } from './PromptOptimizePanel'
import { VideoCreateWorkspace } from './VideoCreateWorkspace'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import type { ProjectAsset, ProjectSummary } from '@/lib/api/types/projects'
import { modelService, imageService, videoService, projectsService, promptOptimizeService } from '@/lib/api/services'
import { useRouter, useSearchParams } from '@/lib/router'
import { useLocale, useTranslations } from '@/i18n/client'
import type { Prompt } from '@/lib/types/prompt'
import { loadNetworkPrompts } from '@/lib/prompts/localPrompts'
import {
  getAspectRatioOptions,
  getImageSizeOptions,
  NANO_BANANA_IMAGE_SIZE_OPTIONS,
  getDoubaoVideoResolutionOptions,
  getDoubaoVideoRatioOptions,
  getDoubaoVideoDurationOptions,
  getWanxVideoResolutionOptions,
  getWanxVideoRatioOptions,
  createWanxVideoDurationOptions,
  MIDJOURNEY_BOT_TYPE_OPTIONS,
  MIDJOURNEY_VERSION_OPTIONS,
  MIDJOURNEY_QUALITY_OPTIONS,
  MIDJOURNEY_STYLE_OPTIONS,
  COMMON_ASPECT_RATIO_OPTIONS,
} from './config/aspectRatioOptions'

type CreationType = 'image' | 'video'
type MentionMediaKind = 'image' | 'video' | 'audio'
type MentionMediaSource = 'upload' | 'project'
type MentionableProjectAsset = ProjectAsset & { kind: Extract<ProjectAsset['kind'], MentionMediaKind> }

type MentionToken = {
  id: string
  kind: MentionMediaKind
  source: MentionMediaSource
  file: File | null
  assetId: string | null
}

type MentionableMediaItem = {
  kind: MentionMediaKind
  ordinal: number
  source: MentionMediaSource
  file: File | null
  asset: ProjectAsset | null
}

type QuickStartDragState = {
  active: boolean
  pointerId: number | null
  startX: number
  scrollLeft: number
  hasMoved: boolean
}

const MENTIONED_MEDIA_PROMPT_REGEX = /@(?=(?:图|图片|视频|音频)\d+)/g

function getMentionMediaTypeLabel(kind: MentionMediaKind) {
  if (kind === 'video') return '视频'
  if (kind === 'audio') return '音频'
  return '图'
}

function getMentionReferenceLabel(kind: MentionMediaKind, ordinal: number) {
  return `${getMentionMediaTypeLabel(kind)}${ordinal}`
}

function getMentionMediaBadge(kind: MentionMediaKind) {
  if (kind === 'video') return 'VID'
  if (kind === 'audio') return 'AUD'
  return 'IMG'
}

function getMentionMediaTone(kind: MentionMediaKind) {
  if (kind === 'video') {
    return 'border-sky-200 bg-sky-100 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200'
  }
  if (kind === 'audio') {
    return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200'
  }
  return 'border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200'
}

function createUploadMentionableMediaItems(
  files: File[],
  kind: MentionMediaKind
): Array<Omit<MentionableMediaItem, 'ordinal'>> {
  return files.map((file) => ({
    kind,
    source: 'upload',
    file,
    asset: null,
  }))
}

function isMentionableProjectAsset(asset: ProjectAsset): asset is MentionableProjectAsset {
  return asset.kind === 'image' || asset.kind === 'video'
}

function createProjectMentionableMediaItems(
  assets: ProjectAsset[]
): Array<Omit<MentionableMediaItem, 'ordinal'>> {
  return assets.filter(isMentionableProjectAsset).map((asset) => ({
    kind: asset.kind,
    source: 'project',
    file: null,
    asset,
  }))
}

function assignMentionOrdinals(
  items: Array<Omit<MentionableMediaItem, 'ordinal'>>
): MentionableMediaItem[] {
  return items.map((item, index) => ({
    ...item,
    ordinal: index + 1,
  }))
}

function doesMentionItemMatchToken(item: MentionableMediaItem, token: MentionToken) {
  if (item.kind !== token.kind || item.source !== token.source) return false
  if (item.source === 'project') return item.asset?.id === token.assetId
  return item.file === token.file
}

function getMentionMediaDisplayName(item: MentionableMediaItem) {
  if (item.source === 'project') {
    return item.asset?.title || item.asset?.fileName || `${getMentionMediaTypeLabel(item.kind)}素材`
  }

  return item.file?.name || `${getMentionMediaTypeLabel(item.kind)}素材`
}

function normalizePromptForRequest(rawPrompt: string) {
  return rawPrompt.replace(MENTIONED_MEDIA_PROMPT_REGEX, '')
}

function normalizeProviderFamily(providerValue?: string | null) {
  const normalized = (providerValue || '').toLowerCase().trim()
  if (normalized === 'qianwen') return 'qwen'
  if (normalized === 'mj') return 'midjourney'
  if (normalized === 'wanxiang') return 'wanx'
  return normalized
}

function supportsQuickModeModel(model: ModelWithCapabilities) {
  if (typeof model.supportsQuickMode === 'boolean') {
    return model.supportsQuickMode
  }

  return model.type === 'image' || model.type === 'video'
}

type WanxModelKind = 't2v' | 'i2v' | 'r2v'

type WanxMergedBundle = {
  generation: string
  t2v: ModelWithCapabilities
  i2v: ModelWithCapabilities
  r2v: ModelWithCapabilities
}

type CreateSelectableModel = ModelWithCapabilities & {
  wanxMergedBundle?: WanxMergedBundle
}

function resolveWanxModelName(model?: Pick<ModelWithCapabilities, 'modelKey' | 'capabilities'> | null) {
  return (model?.capabilities?.remoteModel || model?.modelKey || '').trim()
}

function resolveWanxGeneration(modelName?: string | null) {
  const normalized = String(modelName || '').trim().toLowerCase()
  if (normalized.startsWith('wan2.7')) return 'wan2.7'
  if (normalized.startsWith('happyhorse-1.0')) return 'happyhorse-1.0'
  return null
}

function resolveWanxModelKind(modelName?: string | null): WanxModelKind | null {
  const normalized = String(modelName || '').trim().toLowerCase()
  if (normalized.includes('-t2v')) return 't2v'
  if (normalized.includes('-i2v')) return 'i2v'
  if (normalized.includes('-r2v')) return 'r2v'
  return null
}

function buildCreateSelectableModels(
  sourceModels: ModelWithCapabilities[],
  activeTab: CreationType
): CreateSelectableModel[] {
  if (activeTab !== 'video') {
    return sourceModels
  }

  const wanxCandidates = new Map<string, Partial<Record<WanxModelKind, ModelWithCapabilities>>>()

  sourceModels.forEach((model) => {
    const provider = normalizeProviderFamily(model.provider)
    if (!provider.includes('wanx')) return

    const modelName = resolveWanxModelName(model)
    const generation = resolveWanxGeneration(modelName)
    const kind = resolveWanxModelKind(modelName)
    if (!generation || !kind) return

    const current = wanxCandidates.get(generation) ?? {}
    if (!current[kind]) {
      current[kind] = model
      wanxCandidates.set(generation, current)
    }
  })

  const mergedGenerations = new Set<string>()
  wanxCandidates.forEach((bundle, generation) => {
    if (bundle.t2v && bundle.i2v && bundle.r2v) {
      mergedGenerations.add(generation)
    }
  })

  const emittedGenerations = new Set<string>()
  const result: CreateSelectableModel[] = []

  sourceModels.forEach((model) => {
    const provider = normalizeProviderFamily(model.provider)
    const modelName = resolveWanxModelName(model)
    const generation = provider.includes('wanx') ? resolveWanxGeneration(modelName) : null
    const kind = provider.includes('wanx') ? resolveWanxModelKind(modelName) : null

    if (!generation || !kind || !mergedGenerations.has(generation)) {
      result.push(model)
      return
    }

    if (emittedGenerations.has(generation)) {
      return
    }

    const bundle = wanxCandidates.get(generation)
    if (!bundle?.t2v || !bundle?.i2v || !bundle?.r2v) {
      result.push(model)
      return
    }

    emittedGenerations.add(generation)
    result.push({
      ...bundle.r2v,
      wanxMergedBundle: {
        generation,
        t2v: bundle.t2v,
        i2v: bundle.i2v,
        r2v: bundle.r2v,
      },
    })
  })

  return result
}

function inferWanxMergedModelKind(input: {
  generation?: string | null
  hasReferenceImages: boolean
  hasReferenceVideos: boolean
  hasFirstFrame: boolean
  hasLastFrame: boolean
  hasContinuation: boolean
}): WanxModelKind {
  const isHappyhorse = input.generation === 'happyhorse-1.0'

  if (input.hasLastFrame || input.hasContinuation) {
    return 'i2v'
  }

  if (isHappyhorse && input.hasReferenceVideos) {
    return 'i2v'
  }

  if (input.hasReferenceImages || input.hasReferenceVideos) {
    return 'r2v'
  }

  if (input.hasFirstFrame) {
    return 'i2v'
  }

  return 't2v'
}

export function SimplifiedCreateContent() {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('create')
  const searchParams = useSearchParams()
  const { user } = useAuthStore()

  // 基础状态
  const [activeTab, setActiveTab] = useState<CreationType>('image')
  const [models, setModels] = useState<CreateSelectableModel[]>([])
  const [loading, setLoading] = useState(false)

  // 网络提示词
  const [networkPrompts, setNetworkPrompts] = useState<Prompt[]>([])
  const [quickStartCategory, setQuickStartCategory] = useState('all')
  const [quickStartLoading, setQuickStartLoading] = useState(false)
  const [quickStartCanScrollPrev, setQuickStartCanScrollPrev] = useState(false)
  const [quickStartCanScrollNext, setQuickStartCanScrollNext] = useState(false)
  const [quickStartIsDragging, setQuickStartIsDragging] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([])
  const [projectAssetsLoading, setProjectAssetsLoading] = useState(false)
  const [selectedProjectAssetIds, setSelectedProjectAssetIds] = useState<string[]>([])
  const quickStartScrollerRef = useRef<HTMLDivElement | null>(null)
  const quickStartDragStateRef = useRef<QuickStartDragState>({
    active: false,
    pointerId: null,
    startX: 0,
    scrollLeft: 0,
    hasMoved: false,
  })
  const quickStartSuppressClickRef = useRef(false)

  useEffect(() => {
    document.body.classList.add('create-page-no-edge-glow')
    return () => {
      document.body.classList.remove('create-page-no-edge-glow')
    }
  }, [])

  // 创作参数
  const [selectedModelId, setSelectedModelId] = useState<string>('')
  const [prompt, setPrompt] = useState('')
  const promptEditorRef = useRef<HTMLDivElement | null>(null)
  const promptTextareaRef = useRef<HTMLDivElement | null>(null)
  const mentionInsertRangeRef = useRef<Range | null>(null)
  const [showMentionPicker, setShowMentionPicker] = useState(false)
  const [mentionTokens, setMentionTokens] = useState<MentionToken[]>([])
  const [mentionPreviewUrls, setMentionPreviewUrls] = useState<Array<string | null>>([])
  const [negativePrompt, setNegativePrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [inputImages, setInputImages] = useState<File[]>([])
  const [imageSize, setImageSize] = useState('2K') // Nano Banana 分辨率选项
  const [mjBotType, setMjBotType] = useState('MID_JOURNEY') // Midjourney bot 类型
  const [mjVersion, setMjVersion] = useState('') // Midjourney 版本 --v
  const [mjQuality, setMjQuality] = useState('') // Midjourney 质量 --q
  const [mjStylize, setMjStylize] = useState('') // Midjourney 风格化 --s (0-1000)
  const [mjChaos, setMjChaos] = useState('') // Midjourney 混乱度 --c (0-100)
  const [mjWeird, setMjWeird] = useState('') // Midjourney 怪异度 --weird (0-3000)
  const [mjStyle, setMjStyle] = useState('') // Midjourney 风格 --style raw
  const [mjSeed, setMjSeed] = useState('') // Midjourney 种子 --seed
  const [mjNo, setMjNo] = useState('') // Midjourney 排除 --no
  const [mjIw, setMjIw] = useState('') // Midjourney 图片权重 --iw
  const [mjTile, setMjTile] = useState(false) // Midjourney 平铺 --tile
  const [mjPersonalize, setMjPersonalize] = useState(false) // Midjourney 个性化 --p
  const [mjAdvancedOpen, setMjAdvancedOpen] = useState(false) // 更多参数面板展开状态

  // 视频特定参数
  const [videoDuration, setVideoDuration] = useState('5')
  const [videoResolution, setVideoResolution] = useState('720p')
  const [videoInputImages, setVideoInputImages] = useState<File[]>([]) // 视频参考图（通用：Sora/Runway/Luma等）
  const [doubaoReferenceImages, setDoubaoReferenceImages] = useState<File[]>([]) // 豆包参考图
  const [doubaoReferenceVideos, setDoubaoReferenceVideos] = useState<File[]>([]) // 豆包参考视频
  const [doubaoReferenceAudios, setDoubaoReferenceAudios] = useState<File[]>([]) // 豆包参考音频
  const [doubaoFrameImages, setDoubaoFrameImages] = useState<File[]>([]) // 豆包首尾帧（1-2张）
  const [wanxReferenceImages, setWanxReferenceImages] = useState<File[]>([])
  const [wanxReferenceVideos, setWanxReferenceVideos] = useState<File[]>([])
  const [wanxReferenceAudios, setWanxReferenceAudios] = useState<File[]>([])
  const [wanxFirstFrameImages, setWanxFirstFrameImages] = useState<File[]>([])
  const [wanxLastFrameImages, setWanxLastFrameImages] = useState<File[]>([])
  const [wanxVideoContinuationEnabled, setWanxVideoContinuationEnabled] = useState(false)
  const [doubaoGenerateAudio, setDoubaoGenerateAudio] = useState(true)

  // AI 提示词优化状态
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizedPrompts, setOptimizedPrompts] = useState<string[]>([])
  const [showOptimizeResult, setShowOptimizeResult] = useState(false)
  const [optimizeText, setoptimizeText] = useState('')
  const [includeImagesInOptimize, setIncludeImagesInOptimize] = useState(false)

  // 获取模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const data = await modelService.getModelsWithCapabilities({ type: activeTab })
        const filtered = data.filter((m) => m.isActive && supportsQuickModeModel(m))
        setModels(buildCreateSelectableModels(filtered, activeTab))
      } catch (error) {
        console.error('Failed to fetch models:', error)
        toast.error(t('errors.loadModels'))
      }
    }

    fetchModels()
  }, [activeTab, t])

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModelId('')
      return
    }

    if (!models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(models[0].id)
    }
  }, [models, selectedModelId])

  // 加载网络提示词
  useEffect(() => {
    let cancelled = false
    setQuickStartLoading(true)

    loadNetworkPrompts('image')
      .then((imagePrompts) => {
        if (cancelled) return
        setNetworkPrompts(imagePrompts)
      })
      .catch(() => {
        if (cancelled) return
        setNetworkPrompts([])
      })
      .finally(() => {
        if (!cancelled) {
          setQuickStartLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)

    projectsService.getProjects()
      .then((data) => {
        if (cancelled) return
        setProjects(data)
        setSelectedProjectId((current) => {
          if (current && data.some((project) => project.id === current)) return current
          return ''
        })
      })
      .catch((error) => {
        console.error('Failed to load projects:', error)
        if (cancelled) return
        setProjects([])
        setSelectedProjectId('')
      })
      .finally(() => {
        if (!cancelled) {
          setProjectsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectAssets([])
      setSelectedProjectAssetIds([])
      return
    }

    let cancelled = false
    setProjectAssetsLoading(true)

    projectsService.getProjectAssets(selectedProjectId)
      .then((data) => {
        if (cancelled) return
        setProjectAssets(data)
      })
      .catch((error) => {
        console.error('Failed to load project assets:', error)
        if (cancelled) return
        setProjectAssets([])
      })
      .finally(() => {
        if (!cancelled) {
          setProjectAssetsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedProjectId])

  useEffect(() => {
    setSelectedProjectAssetIds((prev) =>
      prev.filter((assetId) => projectAssets.some((asset) => asset.id === assetId))
    )
  }, [projectAssets])

  useEffect(() => {
    setQuickStartCategory('all')
  }, [activeTab])

  const applyNetworkPrompt = (item: Prompt) => {
    setPrompt(item.prompt)
    toast.success(`${t('featuredTemplates.applyTemplate')}: ${item.title}`)
  }

  useEffect(() => {
    const requestedMode = searchParams.get('mode')
    const requestedPrompt = searchParams.get('prompt')

    if (requestedMode === 'image' || requestedMode === 'video') {
      setActiveTab(requestedMode)
    }

    if (typeof requestedPrompt === 'string' && requestedPrompt.trim()) {
      setPrompt(requestedPrompt)
    }
  }, [searchParams])

  // 获取当前选中的模型
  const selectedModel = useMemo<CreateSelectableModel | null>(() => {
    return models.find((m) => m.id === selectedModelId) ?? null
  }, [models, selectedModelId])
  const selectedProject = useMemo<ProjectSummary | null>(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? null
  }, [projects, selectedProjectId])
  const supportsImageInput = Boolean(selectedModel?.capabilities?.supports?.imageInput)
  const supportsResolutionSelect = Boolean(selectedModel?.capabilities?.supports?.resolutionSelect)
  const supportsSizeSelect = Boolean(selectedModel?.capabilities?.supports?.sizeSelect)
  const maxInputImages = selectedModel?.capabilities?.limits?.maxInputImages || 1

  const hasSelectedProjectImageAssets = useMemo(
    () => projectAssets.some((asset) => asset.kind === 'image' && selectedProjectAssetIds.includes(asset.id)),
    [projectAssets, selectedProjectAssetIds]
  )

  // 智能判断创作模式
  const creationMode = useMemo(() => {
    if (activeTab === 'image' && (inputImages.length > 0 || hasSelectedProjectImageAssets) && supportsImageInput) {
      return 'image-to-image'
    }
    return 'text-to-image'
  }, [activeTab, inputImages.length, hasSelectedProjectImageAssets, supportsImageInput])

  // 获取当前模型支持的尺寸选项
  const aspectRatioOptions = useMemo(() => {
    return getAspectRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 获取当前模型支持的分辨率选项
  // 对 nanobanana/gemini：若管理员开启分辨率开关，即使非 Pro 也显示标准分辨率选项
  const imageSizeOptions = useMemo(() => {
    const result = getImageSizeOptions(selectedModel?.provider)
    if (result) return result

    // 如果 provider 匹配失败，尝试用 remoteModel 匹配（如 gemini-3-pro-image）
    const remoteModel = selectedModel?.capabilities?.remoteModel
    if (remoteModel) {
      return getImageSizeOptions(remoteModel)
    }

    const provider = selectedModel?.provider?.toLowerCase() || ''
    const isNanoBananaFamily = provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')
    if (isNanoBananaFamily && supportsResolutionSelect) {
      return NANO_BANANA_IMAGE_SIZE_OPTIONS
    }

    return null
  }, [selectedModel, supportsResolutionSelect])

  // 获取豆包视频分辨率选项
  const doubaoVideoResolutionOptions = useMemo(() => {
    return getDoubaoVideoResolutionOptions(selectedModel?.provider, selectedModel?.capabilities?.remoteModel)
  }, [selectedModel])

  // 获取豆包视频宽高比选项
  const doubaoVideoRatioOptions = useMemo(() => {
    return getDoubaoVideoRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 获取豆包视频时长选项
  const doubaoVideoDurationOptions = useMemo(() => {
    return getDoubaoVideoDurationOptions(selectedModel?.provider, selectedModel?.capabilities?.remoteModel)
  }, [selectedModel])

  const wanxVideoResolutionOptions = useMemo(() => {
    return getWanxVideoResolutionOptions(selectedModel?.provider)
  }, [selectedModel])

  const wanxVideoRatioOptions = useMemo(() => {
    return getWanxVideoRatioOptions(selectedModel?.provider)
  }, [selectedModel])

  // 判断是否是 Nano Banana Pro（支持 2K/4K 分辨率选项）
  // 同时检查 provider、modelKey 和 remoteModel，因为 provider 可能只是 "nanobanana"
  // 而 remoteModel 才包含完整模型名如 "gemini-3-pro-image"
  const isNanoBananaPro = useMemo(() => {
    const provider = selectedModel?.provider?.toLowerCase() || ''
    const remoteModel = selectedModel?.capabilities?.remoteModel?.toLowerCase() || ''
    const modelKey = selectedModel?.modelKey?.toLowerCase() || ''

    // 合并所有标识进行检测
    const combined = `${provider} ${remoteModel} ${modelKey}`

    return combined.includes('nanobananapro') ||
           combined.includes('nano_banana_pro') ||
           combined.includes('nano-banana-pro') ||
           (combined.includes('gemini') && combined.includes('pro'))
  }, [selectedModel])

  // 判断是否是普通 Nano Banana（不包含 Pro 版本）
  const isNanoBanana = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    const isNanoBananaFamily = provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')
    return isNanoBananaFamily && !isNanoBananaPro
  }, [selectedModel, isNanoBananaPro])

  // 判断是否是豆包（只需要分辨率）
  const isDoubao = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('doubao') || provider?.includes('bytedance') || provider?.includes('ark')
  }, [selectedModel])

  // 判断是否是 Qwen / 通义千问（固定像素尺寸，支持多图输入）
  const isQwenImage = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider.includes('qwen') || provider.includes('qianwen')
  }, [selectedModel])

  // 判断是否是 GPT Image（固定像素尺寸）
  const isGptImage = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('gpt') || provider?.includes('openai')
  }, [selectedModel])

  // 判断是否是豆包视频（支持首尾帧和完整参数控制）
  const isDoubaoVideo = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return activeTab === 'video' && (provider?.includes('doubao') || provider?.includes('bytedance') || provider?.includes('ark'))
  }, [selectedModel, activeTab])

  const isDoubaoSeedance20 = useMemo(() => {
    const remoteModel = selectedModel?.capabilities?.remoteModel?.toLowerCase() || ''
    return isDoubaoVideo && remoteModel.includes('seedance-2-0')
  }, [selectedModel, isDoubaoVideo])

  const isWanxVideo = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return activeTab === 'video' && provider.includes('wanx')
  }, [selectedModel, activeTab])

  const isWanx27Video = useMemo(() => {
    return isWanxVideo && resolveWanxGeneration(resolveWanxModelName(selectedModel)) === 'wan2.7'
  }, [selectedModel, isWanxVideo])

  const isWanxMergedVideo = useMemo(
    () => Boolean(selectedModel?.wanxMergedBundle),
    [selectedModel]
  )

  const wanxSelectedGeneration = useMemo(() => {
    if (!isWanxVideo) return null
    return selectedModel?.wanxMergedBundle?.generation ?? resolveWanxGeneration(resolveWanxModelName(selectedModel))
  }, [isWanxVideo, selectedModel])

  const isWanxHappyhorseVideo = useMemo(
    () => wanxSelectedGeneration === 'happyhorse-1.0',
    [wanxSelectedGeneration]
  )

  const wanxBaseModelKind = useMemo(() => {
    if (!isWanxVideo || isWanxMergedVideo) return null
    return resolveWanxModelKind(resolveWanxModelName(selectedModel))
  }, [isWanxMergedVideo, isWanxVideo, selectedModel])

  const wanxCanSelectVideoAssets = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return true
    if (wanxSelectedGeneration === 'happyhorse-1.0') {
      return isWanxMergedVideo || wanxBaseModelKind === 'i2v'
    }
    return false
  }, [isWanxMergedVideo, isWanxVideo, wanxBaseModelKind, wanxSelectedGeneration])

  // 判断是否是 Midjourney（不需要额外参数）
  const isMidjourney = useMemo(() => {
    const provider = normalizeProviderFamily(selectedModel?.provider)
    return provider?.includes('midjourney') || provider?.includes('mj')
  }, [selectedModel])

  const usableProjectAssets = useMemo(() => {
    if (!supportsImageInput || !selectedProject) return []

    if (activeTab === 'image') {
      return projectAssets.filter((asset) => asset.kind === 'image')
    }

    if (isDoubaoVideo && isDoubaoSeedance20) {
      return projectAssets.filter((asset) => asset.kind === 'image' || asset.kind === 'video')
    }

    if (isWanxVideo) {
      return projectAssets.filter((asset) => asset.kind === 'image' || (wanxCanSelectVideoAssets && asset.kind === 'video'))
    }

    return projectAssets.filter((asset) => asset.kind === 'image')
  }, [activeTab, isDoubaoSeedance20, isDoubaoVideo, isWanxVideo, projectAssets, selectedProject, supportsImageInput, wanxCanSelectVideoAssets])

  const selectedProjectAssets = useMemo(() => {
    const usableAssetMap = new Map<string, ProjectAsset>(
      usableProjectAssets.map((asset) => [asset.id, asset] as const)
    )
    return selectedProjectAssetIds
      .map((assetId) => usableAssetMap.get(assetId) ?? null)
      .filter((asset): asset is ProjectAsset => Boolean(asset))
  }, [selectedProjectAssetIds, usableProjectAssets])

  const selectedProjectImageAssets = useMemo(() => {
    return selectedProjectAssets.filter((asset) => asset.kind === 'image')
  }, [selectedProjectAssets])

  const selectedProjectVideoAssets = useMemo(() => {
    return selectedProjectAssets.filter((asset) => asset.kind === 'video')
  }, [selectedProjectAssets])

  const selectedUsableProjectAssetCount = useMemo(
    () => selectedProjectAssets.length,
    [selectedProjectAssets]
  )

  const wanxReferenceVisualUploadCount = useMemo(
    () => wanxReferenceImages.length + wanxReferenceVideos.length,
    [wanxReferenceImages.length, wanxReferenceVideos.length]
  )

  const wanxProjectReferenceVisualCount = useMemo(
    () => selectedProjectImageAssets.length + selectedProjectVideoAssets.length,
    [selectedProjectImageAssets.length, selectedProjectVideoAssets.length]
  )

  const wanxTotalReferenceVisualCount = useMemo(
    () => wanxReferenceVisualUploadCount + wanxProjectReferenceVisualCount,
    [wanxProjectReferenceVisualCount, wanxReferenceVisualUploadCount]
  )

  const wanxHasReferenceImageInputs = useMemo(
    () => wanxReferenceImages.length > 0 || selectedProjectImageAssets.length > 0,
    [wanxReferenceImages.length, selectedProjectImageAssets.length]
  )

  const wanxHasReferenceVideoInputs = useMemo(
    () => wanxReferenceVideos.length > 0 || selectedProjectVideoAssets.length > 0,
    [wanxReferenceVideos.length, selectedProjectVideoAssets.length]
  )

  const wanxResolvedModelKind = useMemo<WanxModelKind | null>(() => {
    if (!isWanxVideo) return null

    if (!isWanxMergedVideo) {
      return wanxBaseModelKind
    }

    return inferWanxMergedModelKind({
      generation: wanxSelectedGeneration,
      hasReferenceImages: wanxHasReferenceImageInputs,
      hasReferenceVideos: wanxHasReferenceVideoInputs,
      hasFirstFrame: wanxFirstFrameImages.length > 0,
      hasLastFrame: wanxLastFrameImages.length > 0,
      hasContinuation: wanxVideoContinuationEnabled,
    })
  }, [
    isWanxVideo,
    isWanxMergedVideo,
    wanxBaseModelKind,
    wanxHasReferenceImageInputs,
    wanxHasReferenceVideoInputs,
    wanxFirstFrameImages.length,
    wanxLastFrameImages.length,
    wanxSelectedGeneration,
    wanxVideoContinuationEnabled,
  ])

  const wanxSupportsAudioInput = useMemo(
    () => isWanx27Video || (isWanxHappyhorseVideo && wanxResolvedModelKind === 't2v'),
    [isWanx27Video, isWanxHappyhorseVideo, wanxResolvedModelKind]
  )

  const wanxSupportsFirstFrameInput = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return supportsImageInput || isWanxMergedVideo
    if (wanxSelectedGeneration === 'happyhorse-1.0') return isWanxMergedVideo || wanxResolvedModelKind === 'i2v'
    return false
  }, [isWanxMergedVideo, isWanxVideo, supportsImageInput, wanxResolvedModelKind, wanxSelectedGeneration])

  const wanxSupportsLastFrameInput = useMemo(
    () => isWanxVideo && wanxSelectedGeneration === 'wan2.7',
    [isWanxVideo, wanxSelectedGeneration]
  )

  const wanxAllowsReferenceVideoInputs = useMemo(() => {
    if (!isWanxVideo) return false
    if (wanxSelectedGeneration === 'wan2.7') return true
    if (wanxSelectedGeneration === 'happyhorse-1.0') {
      return isWanxMergedVideo || wanxResolvedModelKind === 'i2v'
    }
    return false
  }, [isWanxMergedVideo, isWanxVideo, wanxResolvedModelKind, wanxSelectedGeneration])

  const wanxCanCustomizeRatio = useMemo(
    () => isWanxVideo && wanxResolvedModelKind !== 'i2v' && wanxFirstFrameImages.length === 0,
    [isWanxVideo, wanxResolvedModelKind, wanxFirstFrameImages.length]
  )

  const wanxReferenceAudioUploadMaxFiles = useMemo(() => {
    if (!wanxSupportsAudioInput) return 0
    if (wanxResolvedModelKind === 'r2v') {
      return Math.min(5, Math.max(0, wanxTotalReferenceVisualCount))
    }
    return 1
  }, [wanxResolvedModelKind, wanxSupportsAudioInput, wanxTotalReferenceVisualCount])

  const selectedExecutionModel = useMemo<ModelWithCapabilities | null>(() => {
    if (!selectedModel) return null
    if (!selectedModel.wanxMergedBundle || !wanxResolvedModelKind) {
      return selectedModel
    }
    return selectedModel.wanxMergedBundle[wanxResolvedModelKind]
  }, [selectedModel, wanxResolvedModelKind])

  const imageReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, maxInputImages - selectedProjectImageAssets.length),
    [maxInputImages, selectedProjectImageAssets.length]
  )

  const standardVideoReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, maxInputImages - selectedProjectImageAssets.length),
    [maxInputImages, selectedProjectImageAssets.length]
  )

  const doubaoReferenceUploadMaxFiles = useMemo(
    () => Math.max(0, 4 - selectedProjectImageAssets.length),
    [selectedProjectImageAssets.length]
  )

  const seedanceReferenceImageUploadMaxFiles = useMemo(
    () => Math.max(0, 9 - selectedProjectImageAssets.length),
    [selectedProjectImageAssets.length]
  )

  const seedanceReferenceVideoUploadMaxFiles = useMemo(
    () => Math.max(0, 3 - selectedProjectVideoAssets.length),
    [selectedProjectVideoAssets.length]
  )

  const wanxReferenceImageUploadMaxFiles = useMemo(
    () => Math.max(0, 5 - wanxProjectReferenceVisualCount - wanxReferenceVideos.length),
    [wanxProjectReferenceVisualCount, wanxReferenceVideos.length]
  )

  const wanxReferenceVideoUploadMaxFiles = useMemo(
    () => {
      if (!wanxAllowsReferenceVideoInputs) return 0
      if (isWanxHappyhorseVideo) {
        return Math.max(0, 1 - selectedProjectVideoAssets.length)
      }
      return Math.max(0, 5 - wanxProjectReferenceVisualCount - wanxReferenceImages.length)
    },
    [
      isWanxHappyhorseVideo,
      selectedProjectVideoAssets.length,
      wanxAllowsReferenceVideoInputs,
      wanxProjectReferenceVisualCount,
      wanxReferenceImages.length,
    ]
  )

  const wanxVideoDurationOptions = useMemo(() => {
    if (!isWanxVideo) return null
    return createWanxVideoDurationOptions({
      hasReferenceVideo: wanxResolvedModelKind === 'r2v' && wanxHasReferenceVideoInputs,
      generation: wanxSelectedGeneration,
    })
  }, [isWanxVideo, wanxHasReferenceVideoInputs, wanxResolvedModelKind, wanxSelectedGeneration])

  const hasDoubaoSeedance20ReferenceInputs = useMemo(
    () =>
      doubaoReferenceImages.length > 0 ||
      doubaoReferenceVideos.length > 0 ||
      doubaoReferenceAudios.length > 0 ||
      selectedProjectImageAssets.length > 0 ||
      selectedProjectVideoAssets.length > 0,
    [
      doubaoReferenceImages,
      doubaoReferenceVideos,
      doubaoReferenceAudios,
      selectedProjectImageAssets.length,
      selectedProjectVideoAssets.length,
    ]
  )

  const hasDoubaoSeedance20FrameInputs = useMemo(
    () => doubaoFrameImages.length > 0,
    [doubaoFrameImages]
  )

  function canAddProjectAsset(asset: ProjectAsset) {
    if (!supportsImageInput) return false

    if (activeTab === 'image') {
      return asset.kind === 'image' && inputImages.length + selectedProjectImageAssets.length < maxInputImages
    }

    if (isDoubaoVideo) {
      if (doubaoFrameImages.length > 0) return false

      if (isDoubaoSeedance20) {
        if (asset.kind === 'image') {
          return doubaoReferenceImages.length + selectedProjectImageAssets.length < 9
        }
        if (asset.kind === 'video') {
          return doubaoReferenceVideos.length + selectedProjectVideoAssets.length < 3
        }
        return false
      }

      return asset.kind === 'image' && doubaoReferenceImages.length + selectedProjectImageAssets.length < 4
    }

    if (isWanxVideo) {
      if (asset.kind === 'video' && !wanxAllowsReferenceVideoInputs) {
        return false
      }

      if (wanxResolvedModelKind === 'i2v') {
        if (asset.kind === 'image') {
          return selectedProjectImageAssets.length < 1 && wanxReferenceImages.length === 0 && wanxFirstFrameImages.length === 0
        }
        if (asset.kind === 'video') {
          return selectedProjectVideoAssets.length < 1 && wanxReferenceVideos.length === 0
        }
        return false
      }

      if (isWanxHappyhorseVideo && asset.kind === 'video') {
        return selectedProjectVideoAssets.length < 1 && wanxReferenceVideos.length === 0
      }

      if (asset.kind !== 'image' && asset.kind !== 'video') return false
      return (
        wanxReferenceImages.length +
          wanxReferenceVideos.length +
          selectedProjectImageAssets.length +
          selectedProjectVideoAssets.length <
        5
      )
    }

    return asset.kind === 'image' && videoInputImages.length + selectedProjectImageAssets.length < maxInputImages
  }

  const disabledProjectAssetIds = useMemo(() => {
    return usableProjectAssets
      .filter((asset) => !selectedProjectAssetIds.includes(asset.id) && !canAddProjectAsset(asset))
      .map((asset) => asset.id)
  }, [
    usableProjectAssets,
    selectedProjectAssetIds,
    activeTab,
    inputImages.length,
    videoInputImages.length,
    doubaoReferenceImages.length,
    doubaoReferenceVideos.length,
    doubaoFrameImages.length,
    selectedProjectImageAssets.length,
    selectedProjectVideoAssets.length,
    supportsImageInput,
    isDoubaoVideo,
    isDoubaoSeedance20,
    isWanxVideo,
    isWanxHappyhorseVideo,
    wanxResolvedModelKind,
    wanxAllowsReferenceVideoInputs,
    maxInputImages,
    wanxReferenceImages.length,
    wanxReferenceVideos.length,
    wanxFirstFrameImages.length,
  ])

  const handleToggleProjectAsset = (assetId: string) => {
    const asset = usableProjectAssets.find((item) => item.id === assetId)
    if (!asset) return

    if (selectedProjectAssetIds.includes(assetId)) {
      setSelectedProjectAssetIds((prev) => prev.filter((id) => id !== assetId))
      return
    }

    if (!canAddProjectAsset(asset)) {
      if (isDoubaoVideo && doubaoFrameImages.length > 0) {
        toast.error(isDoubaoSeedance20 ? t('errors.doubaoModesExclusive') : t('errors.referenceAssetsMutuallyExclusive'))
        return
      }

      const max =
        activeTab === 'image'
          ? maxInputImages
          : isDoubaoVideo
            ? isDoubaoSeedance20
              ? asset.kind === 'video' ? 3 : 9
              : 4
            : isWanxVideo
              ? wanxResolvedModelKind === 'i2v' || (isWanxHappyhorseVideo && asset.kind === 'video') ? 1 : 5
              : maxInputImages

      toast.error(t('errors.referenceLimitReached', { max }))
      return
    }

    setSelectedProjectAssetIds((prev) => [...prev, assetId])
  }

  // 提示词 @ 引用可选的素材（按当前创作模式选择有效集合）
  const mentionableMedia = useMemo(() => {
    if (!supportsImageInput) return []

    if (activeTab === 'image') {
      return assignMentionOrdinals([
        ...createUploadMentionableMediaItems(inputImages, 'image'),
        ...createProjectMentionableMediaItems(selectedProjectImageAssets),
      ])
    }

    if (isDoubaoVideo) {
      if (isDoubaoSeedance20) {
        if (doubaoFrameImages.length > 0) {
          return assignMentionOrdinals(createUploadMentionableMediaItems(doubaoFrameImages, 'image'))
        }

        return assignMentionOrdinals([
          ...createUploadMentionableMediaItems(doubaoReferenceImages, 'image'),
          ...createUploadMentionableMediaItems(doubaoReferenceVideos, 'video'),
          ...createUploadMentionableMediaItems(doubaoReferenceAudios, 'audio'),
          ...createProjectMentionableMediaItems(selectedProjectAssets),
        ])
      }

      if (doubaoReferenceImages.length > 0 || selectedProjectImageAssets.length > 0) {
        return assignMentionOrdinals([
          ...createUploadMentionableMediaItems(doubaoReferenceImages, 'image'),
          ...createProjectMentionableMediaItems(selectedProjectImageAssets),
        ])
      }
      if (doubaoFrameImages.length > 0) {
        return assignMentionOrdinals(createUploadMentionableMediaItems(doubaoFrameImages, 'image'))
      }
      return []
    }

    if (isWanxVideo) {
      return assignMentionOrdinals([
        ...createUploadMentionableMediaItems(wanxReferenceImages, 'image'),
        ...(wanxAllowsReferenceVideoInputs ? createUploadMentionableMediaItems(wanxReferenceVideos, 'video') : []),
        ...createProjectMentionableMediaItems(
          selectedProjectAssets.filter((asset) => asset.kind === 'image' || (wanxAllowsReferenceVideoInputs && asset.kind === 'video'))
        ),
      ])
    }

    return assignMentionOrdinals([
      ...createUploadMentionableMediaItems(videoInputImages, 'image'),
      ...createProjectMentionableMediaItems(selectedProjectImageAssets),
    ])
  }, [
    activeTab,
    inputImages,
    videoInputImages,
    doubaoReferenceImages,
    doubaoReferenceVideos,
    doubaoReferenceAudios,
    doubaoFrameImages,
    wanxReferenceImages,
    wanxReferenceVideos,
    selectedProjectAssets,
    selectedProjectImageAssets,
    isDoubaoVideo,
    isDoubaoSeedance20,
    isWanxVideo,
    wanxAllowsReferenceVideoInputs,
    supportsImageInput,
  ])

  // 模型不支持垫图时，清理已上传图片与引用标记，避免隐藏参数被提交
  useEffect(() => {
    if (supportsImageInput) return
    setInputImages([])
    setVideoInputImages([])
    setDoubaoReferenceImages([])
    setDoubaoReferenceVideos([])
    setDoubaoReferenceAudios([])
    setDoubaoFrameImages([])
    setWanxReferenceImages([])
    setWanxReferenceVideos([])
    if (!(isWanxVideo && wanxSupportsAudioInput)) {
      setWanxReferenceAudios([])
    }
    setWanxFirstFrameImages([])
    setWanxLastFrameImages([])
    setWanxVideoContinuationEnabled(false)
    setMentionTokens([])
    setSelectedProjectAssetIds([])
  }, [isWanxVideo, selectedModelId, supportsImageInput, wanxSupportsAudioInput])

  useEffect(() => {
    if (isDoubaoSeedance20) return
    setDoubaoReferenceImages((prev) => (
      prev.length > doubaoReferenceUploadMaxFiles ? prev.slice(0, doubaoReferenceUploadMaxFiles) : prev
    ))
    setDoubaoFrameImages((prev) => prev.slice(0, 2))
    setDoubaoReferenceVideos([])
    setDoubaoReferenceAudios([])
    setDoubaoGenerateAudio(true)
  }, [isDoubaoSeedance20, selectedModelId, doubaoReferenceUploadMaxFiles])

  useEffect(() => {
    if (!isWanxVideo) {
      setWanxReferenceImages([])
      setWanxReferenceVideos([])
      setWanxReferenceAudios([])
      setWanxFirstFrameImages([])
      setWanxLastFrameImages([])
      setWanxVideoContinuationEnabled(false)
      return
    }

    setWanxReferenceImages((prev) => (
      prev.length > wanxReferenceImageUploadMaxFiles ? prev.slice(0, wanxReferenceImageUploadMaxFiles) : prev
    ))
    setWanxReferenceVideos((prev) => (
      prev.length > wanxReferenceVideoUploadMaxFiles ? prev.slice(0, wanxReferenceVideoUploadMaxFiles) : prev
    ))
    if (!wanxAllowsReferenceVideoInputs) {
      setWanxReferenceVideos([])
    }
    setWanxReferenceAudios((prev) => {
      if (!wanxSupportsAudioInput) return []
      return prev.length > wanxReferenceAudioUploadMaxFiles
        ? prev.slice(0, wanxReferenceAudioUploadMaxFiles)
        : prev
    })
    setWanxFirstFrameImages((prev) => {
      if (!wanxSupportsFirstFrameInput) return []
      return prev.slice(0, 1)
    })
    setWanxLastFrameImages((prev) => {
      if (!wanxSupportsLastFrameInput) return []
      return prev.slice(0, 1)
    })
    if (!wanxSupportsLastFrameInput) {
      setWanxVideoContinuationEnabled(false)
    }
  }, [
    isWanxVideo,
    selectedModelId,
    wanxAllowsReferenceVideoInputs,
    wanxReferenceAudioUploadMaxFiles,
    wanxReferenceImageUploadMaxFiles,
    wanxReferenceVideoUploadMaxFiles,
    wanxSupportsFirstFrameInput,
    wanxSupportsLastFrameInput,
    wanxSupportsAudioInput,
  ])

  useEffect(() => {
    if (!isWanxMergedVideo) return
    if (wanxHasReferenceVideoInputs) return
    setWanxVideoContinuationEnabled(false)
  }, [isWanxMergedVideo, wanxHasReferenceVideoInputs])

  useEffect(() => {
    setSelectedProjectAssetIds((prev) => {
      const usableAssetMap = new Map<string, ProjectAsset>(
        usableProjectAssets.map((asset) => [asset.id, asset] as const)
      )
      const next: string[] = []
      let keptImageCount = 0
      let keptVideoCount = 0

      for (const assetId of prev) {
        const asset = usableAssetMap.get(assetId)
        if (!asset) continue

        if (activeTab === 'image') {
          if (asset.kind !== 'image') continue
          if (inputImages.length + keptImageCount >= maxInputImages) continue
          keptImageCount += 1
          next.push(assetId)
          continue
        }

        if (isDoubaoVideo) {
          if (doubaoFrameImages.length > 0) continue

          if (isDoubaoSeedance20) {
            if (asset.kind === 'image') {
              if (doubaoReferenceImages.length + keptImageCount >= 9) continue
              keptImageCount += 1
              next.push(assetId)
              continue
            }

            if (asset.kind === 'video') {
              if (doubaoReferenceVideos.length + keptVideoCount >= 3) continue
              keptVideoCount += 1
              next.push(assetId)
            }
            continue
          }

          if (asset.kind !== 'image') continue
          if (doubaoReferenceImages.length + keptImageCount >= 4) continue
          keptImageCount += 1
          next.push(assetId)
          continue
        }

        if (isWanxVideo) {
          if (asset.kind === 'video' && !wanxAllowsReferenceVideoInputs) continue

          if (wanxResolvedModelKind === 'i2v') {
            if (asset.kind === 'image') {
              if (keptImageCount >= 1 || wanxReferenceImages.length > 0 || wanxFirstFrameImages.length > 0) continue
              keptImageCount += 1
              next.push(assetId)
              continue
            }
            if (asset.kind === 'video') {
              if (keptVideoCount >= 1 || wanxReferenceVideos.length > 0) continue
              keptVideoCount += 1
              next.push(assetId)
            }
            continue
          }

          if (isWanxHappyhorseVideo && asset.kind === 'video') {
            if (keptVideoCount >= 1 || wanxReferenceVideos.length > 0) continue
            keptVideoCount += 1
            next.push(assetId)
            continue
          }

          if (asset.kind !== 'image' && asset.kind !== 'video') continue
          if (wanxReferenceImages.length + wanxReferenceVideos.length + keptImageCount + keptVideoCount >= 5) continue
          if (asset.kind === 'image') {
            keptImageCount += 1
          } else {
            keptVideoCount += 1
          }
          next.push(assetId)
          continue
        }

        if (asset.kind !== 'image') continue
        if (videoInputImages.length + keptImageCount >= maxInputImages) continue
        keptImageCount += 1
        next.push(assetId)
      }

      if (next.length === prev.length && next.every((assetId, index) => assetId === prev[index])) {
        return prev
      }

      return next
    })
  }, [
    usableProjectAssets,
    activeTab,
    inputImages.length,
    videoInputImages.length,
    doubaoReferenceImages.length,
    doubaoReferenceVideos.length,
    doubaoFrameImages.length,
    isDoubaoVideo,
    isDoubaoSeedance20,
    isWanxVideo,
    isWanxHappyhorseVideo,
    wanxResolvedModelKind,
    wanxAllowsReferenceVideoInputs,
    wanxReferenceImages.length,
    wanxReferenceVideos.length,
    wanxFirstFrameImages.length,
    maxInputImages,
  ])

  useEffect(() => {
    setInputImages((prev) => (
      prev.length > imageReferenceUploadMaxFiles ? prev.slice(0, imageReferenceUploadMaxFiles) : prev
    ))
  }, [imageReferenceUploadMaxFiles])

  useEffect(() => {
    setVideoInputImages((prev) => (
      prev.length > standardVideoReferenceUploadMaxFiles
        ? prev.slice(0, standardVideoReferenceUploadMaxFiles)
        : prev
    ))
  }, [standardVideoReferenceUploadMaxFiles])

  useEffect(() => {
    if (!isDoubaoVideo || !isDoubaoSeedance20) return

    setDoubaoReferenceImages((prev) => (
      prev.length > seedanceReferenceImageUploadMaxFiles
        ? prev.slice(0, seedanceReferenceImageUploadMaxFiles)
        : prev
    ))
    setDoubaoReferenceVideos((prev) => (
      prev.length > seedanceReferenceVideoUploadMaxFiles
        ? prev.slice(0, seedanceReferenceVideoUploadMaxFiles)
        : prev
    ))
  }, [
    isDoubaoVideo,
    isDoubaoSeedance20,
    seedanceReferenceImageUploadMaxFiles,
    seedanceReferenceVideoUploadMaxFiles,
  ])

  // 为 @ 引用弹层生成本地预览图（图片展示缩略图，视频/音频展示类型徽标）
  useEffect(() => {
    const urls = mentionableMedia.map((item) => {
      if (item.kind !== 'image') return null
      if (item.source === 'project') {
        return item.asset?.thumbnailUrl || item.asset?.url || null
      }
      if (!item.file) return null
      return URL.createObjectURL(item.file)
    })
    setMentionPreviewUrls(urls)
    return () => {
      urls.forEach((url, index) => {
        if (url && mentionableMedia[index]?.source === 'upload') {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [mentionableMedia])

  // 没有可引用素材时，自动关闭 @ 选择弹层
  useEffect(() => {
    if (mentionableMedia.length > 0) return
    setShowMentionPicker(false)
  }, [mentionableMedia.length])

  // 如果上传素材变化导致某些 @ 引用不存在，自动移除对应引用
  useEffect(() => {
    setMentionTokens((prev) =>
      prev.filter((token) =>
        mentionableMedia.some((item) => doesMentionItemMatchToken(item, token))
      )
    )
  }, [mentionableMedia])

  // 点击外部关闭 @ 选择弹层
  useEffect(() => {
    if (!showMentionPicker) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (promptEditorRef.current?.contains(target)) return
      setShowMentionPicker(false)
    }

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setShowMentionPicker(false)
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [showMentionPicker])

  // 外部设置提示词（网络提示词、优化结果）时同步到编辑器，并清空旧的图片引用
  useEffect(() => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const currentPlainText = readPlainPromptFromEditor()
    if (currentPlainText === prompt) return

    editor.innerHTML = ''
    if (prompt) {
      editor.appendChild(document.createTextNode(prompt))
    }
    setMentionTokens([])
  }, [prompt])

  // 上传素材顺序变化后，刷新行内引用文案与缩略图
  useEffect(() => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const removedTokenIds: string[] = []
    for (const token of mentionTokens) {
      const mentionNode = editor.querySelector<HTMLElement>(`[data-mention-id="${token.id}"]`)
      if (!mentionNode) continue

      const mentionReference = getMentionReferenceByTokenId(token.id)
      if (!mentionReference) {
        mentionNode.remove()
        removedTokenIds.push(token.id)
        continue
      }

      const labelNode = mentionNode.querySelector<HTMLElement>('[data-mention-label]')
      if (labelNode) {
        labelNode.textContent = mentionReference.label
      }

      const thumbNode = mentionNode.querySelector<HTMLImageElement>('[data-mention-thumb]')
      const previewUrl = mentionPreviewUrls[mentionReference.mediaIndex]
      if (thumbNode && previewUrl) {
        thumbNode.src = previewUrl
      }
    }

    if (removedTokenIds.length > 0) {
      setMentionTokens((prev) => prev.filter((token) => !removedTokenIds.includes(token.id)))
      syncPromptWithEditor()
    }
  }, [mentionTokens, mentionableMedia, mentionPreviewUrls])

  // 当切换模型时，重置尺寸选项为第一个
  useEffect(() => {
    if (aspectRatioOptions.length > 0) {
      setAspectRatio(aspectRatioOptions[0].value)
    }
  }, [aspectRatioOptions])

  // 当切换到豆包视频模型时，重置参数为默认值
  useEffect(() => {
    if (isDoubaoVideo && doubaoVideoResolutionOptions && doubaoVideoRatioOptions && doubaoVideoDurationOptions) {
      const defaultResolution = doubaoVideoResolutionOptions.find((option) => option.value === '720p') ?? doubaoVideoResolutionOptions[0]
      const defaultRatio = doubaoVideoRatioOptions.find((option) => option.value === '16:9') ?? doubaoVideoRatioOptions[0]
      const defaultDuration = doubaoVideoDurationOptions.find((option) => option.value === '5') ?? doubaoVideoDurationOptions[0]

      if (defaultResolution) setVideoResolution(defaultResolution.value)
      if (defaultRatio) setAspectRatio(defaultRatio.value)
      if (defaultDuration) setVideoDuration(defaultDuration.value)
    }
  }, [isDoubaoVideo, doubaoVideoResolutionOptions, doubaoVideoRatioOptions, doubaoVideoDurationOptions])

  useEffect(() => {
    if (!isWanxVideo || !wanxVideoResolutionOptions || !wanxVideoRatioOptions || !wanxVideoDurationOptions) return

    const defaultResolution = wanxVideoResolutionOptions.find((option) => option.value === '720P') ?? wanxVideoResolutionOptions[0]
    const defaultRatio = wanxVideoRatioOptions.find((option) => option.value === '16:9') ?? wanxVideoRatioOptions[0]

    if (defaultResolution) setVideoResolution(defaultResolution.value)
    if (defaultRatio) setAspectRatio(defaultRatio.value)
  }, [isWanxVideo, selectedModelId, wanxVideoResolutionOptions, wanxVideoRatioOptions, wanxVideoDurationOptions])

  useEffect(() => {
    if (!isWanxVideo || !wanxVideoDurationOptions || wanxVideoDurationOptions.length === 0) return
    if (wanxVideoDurationOptions.some((option) => option.value === videoDuration)) return

    const fallbackDuration =
      wanxVideoDurationOptions.find((option) => option.value === '5') ??
      wanxVideoDurationOptions[0]

    if (fallbackDuration) {
      setVideoDuration(fallbackDuration.value)
    }
  }, [isWanxVideo, videoDuration, wanxVideoDurationOptions])

  // 文件转 base64 工具函数
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result as string
        resolve(base64)
      }
      reader.onerror = reject
    })
  }

  const toBase64FromUrl = async (url: string): Promise<string> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch project asset: ${response.status}`)
    }

    const blob = await response.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onload = () => {
        resolve(reader.result as string)
      }
      reader.onerror = reject
    })
  }

  const uploadReferenceInputs = async (
    kind: 'image' | 'video' | 'audio',
    files: File[],
    provider?: 'seedance' | 'wanx',
  ) => {
    if (files.length === 0) return []
    const result = await videoService.uploadSeedanceInputs(kind, files, provider)
    return result.files.map((item) => item.url)
  }

  const getMentionReferenceByTokenId = (tokenId: string) => {
    const token = mentionTokens.find((item) => item.id === tokenId)
    if (!token) return null
    const mediaIndex = mentionableMedia.findIndex((item) => doesMentionItemMatchToken(item, token))
    if (mediaIndex < 0) return null
    const media = mentionableMedia[mediaIndex]
    return {
      mediaIndex,
      kind: media.kind,
      ordinal: media.ordinal,
      label: getMentionReferenceLabel(media.kind, media.ordinal),
    }
  }

  const readPlainPromptFromEditor = () => {
    const editor = promptTextareaRef.current
    if (!editor) return prompt

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const element = node as HTMLElement
      if (element.dataset.mentionId) return ''
      if (element.tagName === 'BR') return '\n'

      const content = (Array.from(element.childNodes) as Node[]).map((child) => walk(child)).join('')
      if (element.tagName === 'DIV' || element.tagName === 'P') return `${content}\n`
      return content
    }

    return (Array.from(editor.childNodes) as Node[])
      .map((node) => walk(node))
      .join('')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  const syncMentionTokensWithEditor = () => {
    const editor = promptTextareaRef.current
    if (!editor) return

    const idsInEditor = new Set(
      Array.from(editor.querySelectorAll<HTMLElement>('[data-mention-id]'))
        .map((node) => node.dataset.mentionId)
        .filter((id): id is string => Boolean(id))
    )

    setMentionTokens((prev) => prev.filter((token) => idsInEditor.has(token.id)))
  }

  const syncPromptWithEditor = () => {
    setPrompt(readPlainPromptFromEditor())
  }

  const createMentionInlineNode = (
    tokenId: string,
    kind: MentionMediaKind,
    referenceLabel: string,
    previewUrl?: string | null
  ) => {
    const mentionNode = document.createElement('span')
    mentionNode.setAttribute('data-mention-id', tokenId)
    mentionNode.setAttribute('contenteditable', 'false')
    mentionNode.className =
      'relative mx-1 inline-flex items-center gap-2 rounded-xl border border-aurora-purple/30 bg-aurora-purple/5 px-2.5 py-1.5 pr-6 align-middle shadow-sm'

    const thumbWrap = document.createElement('span')
    thumbWrap.className = `flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border ${getMentionMediaTone(kind)}`

    if (kind === 'image' && previewUrl) {
      const img = document.createElement('img')
      img.src = previewUrl
      img.alt = referenceLabel
      img.setAttribute('data-mention-thumb', 'true')
      img.className = 'h-full w-full object-cover'
      thumbWrap.appendChild(img)
    } else {
      const badge = document.createElement('span')
      badge.className = 'text-[9px] font-semibold tracking-[0.18em]'
      badge.textContent = getMentionMediaBadge(kind)
      thumbWrap.appendChild(badge)
    }

    const label = document.createElement('span')
    label.setAttribute('data-mention-label', 'true')
    label.className = 'text-xs font-medium text-stone-700 dark:text-stone-200'
    label.textContent = referenceLabel

    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.setAttribute('data-remove-mention', tokenId)
    removeBtn.className =
      'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-stone-700/80 text-[10px] leading-none text-white transition-colors hover:bg-red-500'
    removeBtn.title = '删除引用'
    removeBtn.textContent = '×'

    mentionNode.appendChild(thumbWrap)
    mentionNode.appendChild(label)
    mentionNode.appendChild(removeBtn)
    return mentionNode
  }

  const handlePromptEditorInput = () => {
    syncMentionTokensWithEditor()
    syncPromptWithEditor()
  }

  const handlePromptEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== '@') return

    if (mentionableMedia.length === 0) {
      event.preventDefault()
      toast.error(t('form.prompt.mentionUnavailable'))
      return
    }

    event.preventDefault()

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      mentionInsertRangeRef.current = selection.getRangeAt(0).cloneRange()
    }

    setShowMentionPicker(true)
  }

  const handleOpenMentionPicker = () => {
    if (mentionableMedia.length === 0) {
      toast.error(t('form.prompt.mentionUnavailable'))
      return
    }

    const editor = promptTextareaRef.current
    if (editor) {
      editor.focus()

      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
        mentionInsertRangeRef.current = selection.getRangeAt(0).cloneRange()
      } else {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        mentionInsertRangeRef.current = range
        if (selection) {
          selection.removeAllRanges()
          selection.addRange(range)
        }
      }
    }

    setShowMentionPicker(true)
  }

  const handleSelectMentionMedia = (mediaIndex: number) => {
    const selectedMedia = mentionableMedia[mediaIndex]
    if (!selectedMedia) return

    const token: MentionToken = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: selectedMedia.source,
      file: selectedMedia.file,
      assetId: selectedMedia.asset?.id || null,
      kind: selectedMedia.kind,
    }

    const editor = promptTextareaRef.current
    if (!editor) return

    const selection = window.getSelection()
    let range = mentionInsertRangeRef.current?.cloneRange() ?? null

    if (!range || !editor.contains(range.startContainer)) {
      range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
    }

    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }

    const mentionNode = createMentionInlineNode(
      token.id,
      selectedMedia.kind,
      getMentionReferenceLabel(selectedMedia.kind, selectedMedia.ordinal),
      mentionPreviewUrls[mediaIndex]
    )
    const spacer = document.createTextNode(' ')

    range.deleteContents()
    range.insertNode(spacer)
    range.insertNode(mentionNode)

    const caretRange = document.createRange()
    caretRange.setStartAfter(spacer)
    caretRange.collapse(true)
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(caretRange)
    }

    setMentionTokens((prev) => [...prev, token])
    setShowMentionPicker(false)
    mentionInsertRangeRef.current = null
    editor.focus()
    syncPromptWithEditor()
  }

  const handleRemoveMentionToken = (tokenId: string) => {
    const editor = promptTextareaRef.current
    if (editor) {
      const mentionNode = editor.querySelector<HTMLElement>(`[data-mention-id="${tokenId}"]`)
      mentionNode?.remove()
    }
    setMentionTokens((prev) => prev.filter((token) => token.id !== tokenId))
    syncPromptWithEditor()
  }

  const handlePromptEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const removeButton = target.closest('[data-remove-mention]') as HTMLElement | null
    if (!removeButton) return

    event.preventDefault()
    event.stopPropagation()
    const tokenId = removeButton.getAttribute('data-remove-mention')
    if (!tokenId) return
    handleRemoveMentionToken(tokenId)
  }

  const buildRequestPrompt = () => {
    const editor = promptTextareaRef.current
    if (!editor) return normalizePromptForRequest(prompt).trim()

    const walk = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? ''
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return ''

      const element = node as HTMLElement
      const mentionId = element.dataset.mentionId
      if (mentionId) {
        const mentionReference = getMentionReferenceByTokenId(mentionId)
        return mentionReference ? mentionReference.label : ''
      }
      if (element.tagName === 'BR') return '\n'

      const content = (Array.from(element.childNodes) as Node[]).map((child) => walk(child)).join('')
      if (element.tagName === 'DIV' || element.tagName === 'P') return `${content}\n`
      return content
    }

    return normalizePromptForRequest(
      (Array.from(editor.childNodes) as Node[])
        .map((node) => walk(node))
        .join('')
    )
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // AI 提示词优化
  const handleOptimizePrompt = async () => {
    const requestPrompt = buildRequestPrompt()
    if (!requestPrompt) {
      toast.error(t('errors.promptRequired'))
      return
    }

    setIsOptimizing(true)
    setOptimizedPrompts([])
    setShowOptimizeResult(true)
    setoptimizeText('')

    try {
      // Build request body
      const body: { prompt: string; images?: string[]; modelType?: string } = {
        prompt: requestPrompt,
      }
      if (includeImagesInOptimize && inputImages.length > 0) {
        body.images = await Promise.all(inputImages.map(toBase64))
      }
      // 传递当前选择的模型 provider，用于选择不同的优化策略
      if (selectedModel?.provider) {
        body.modelType = selectedModel.provider
      }

      const result = await promptOptimizeService.optimizePrompt(body)
      const fullText = typeof result.content === 'string' ? result.content.trim() : ''
      if (!fullText) {
        throw new Error(t('form.prompt.optimizeError'))
      }
      setoptimizeText(fullText)

      // Parse 3 versions from the full text
      const versions: string[] = []
      const parts = fullText.split(/---[123]---/)
      for (const part of parts) {
        const trimmed = part.trim()
        if (trimmed) versions.push(trimmed)
      }

      if (versions.length > 0) {
        setOptimizedPrompts(versions.slice(0, 3))
      } else {
        // Fallback: treat entire text as one version
        setOptimizedPrompts([fullText.trim()])
      }
    } catch (error) {
      console.error('Prompt optimization failed:', error)
      const message = error instanceof Error ? error.message : ''
      toast.error(message || t('form.prompt.optimizeError'))
      setShowOptimizeResult(false)
    } finally {
      setIsOptimizing(false)
    }
  }

  // 处理提交
  const handleSubmit = async () => {
    const requestPrompt = buildRequestPrompt()
    const hasImageReferenceInputs = inputImages.length > 0 || selectedProjectImageAssets.length > 0
    const totalImageReferenceCount = inputImages.length + selectedProjectImageAssets.length
    const totalVideoReferenceImageCount = videoInputImages.length + selectedProjectImageAssets.length
    const totalDoubaoReferenceImageCount = doubaoReferenceImages.length + selectedProjectImageAssets.length
    const totalDoubaoReferenceVideoCount = doubaoReferenceVideos.length + selectedProjectVideoAssets.length
    const totalWanxReferenceImageCount = wanxReferenceImages.length + selectedProjectImageAssets.length
    const totalWanxReferenceVideoCount = wanxReferenceVideos.length + selectedProjectVideoAssets.length
    const totalWanxReferenceVisualCount = totalWanxReferenceImageCount + totalWanxReferenceVideoCount
    const totalWanxFirstFrameCount = wanxFirstFrameImages.length
    const totalWanxLastFrameCount = wanxLastFrameImages.length
    const totalWanxAudioCount = wanxReferenceAudios.length

    if (!selectedModelId) {
      toast.error(t('errors.selectModel'))
      return
    }

    if (activeTab === 'video' && !selectedExecutionModel) {
      toast.error(t('errors.selectModel'))
      return
    }

    if (!requestPrompt) {
      toast.error(t('errors.promptRequired'))
      return
    }

    if (activeTab === 'image' && supportsImageInput && totalImageReferenceCount > maxInputImages) {
      toast.error(t('errors.referenceLimitReached', { max: maxInputImages }))
      return
    }

    if (activeTab === 'video' && isWanxVideo) {
      if (isWanxHappyhorseVideo && wanxResolvedModelKind !== 't2v' && totalWanxAudioCount > 0) {
        toast.error(t('errors.wanxReferenceAudioLimit'))
        return
      }

      if (isWanxHappyhorseVideo && totalWanxLastFrameCount > 0) {
        toast.error(t('errors.wanxLastFrameUnsupported'))
        return
      }

      if (isWanxHappyhorseVideo && wanxResolvedModelKind === 'r2v' && totalWanxReferenceVideoCount > 0) {
        toast.error(t('errors.wanxReferenceVideoUnsupported'))
        return
      }

      if (wanxResolvedModelKind === 'r2v') {
        if (totalWanxReferenceVisualCount < 1) {
          toast.error(t('errors.wanxReferenceRequired'))
          return
        }

        if (totalWanxReferenceVisualCount > 5) {
          toast.error(t('errors.wanxReferenceVisualLimit'))
          return
        }

        if (totalWanxAudioCount > 0 && !wanxSupportsAudioInput) {
          toast.error(t('errors.wanxReferenceAudioLimit'))
          return
        }

        if (totalWanxAudioCount > totalWanxReferenceVisualCount) {
          toast.error(t('errors.wanxAudioNeedsVisual'))
          return
        }
      }

      if (wanxResolvedModelKind === 'i2v') {
        if (totalWanxLastFrameCount > 1) {
          toast.error(t('errors.wanxI2vSingleLastFrame'))
          return
        }

        if (totalWanxAudioCount > 1) {
          toast.error(t('errors.wanxSingleAudioOnly'))
          return
        }

        if (totalWanxFirstFrameCount > 1) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxFirstFrameCount > 0 && totalWanxReferenceImageCount > 0) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxReferenceImageCount > 1) {
          toast.error(t('errors.wanxI2vSingleFirstFrame'))
          return
        }

        if (totalWanxReferenceVideoCount > 1) {
          toast.error(t('errors.wanxI2vSingleVideo'))
          return
        }

        if (wanxVideoContinuationEnabled && totalWanxReferenceVideoCount < 1) {
          toast.error(t('errors.wanxContinuationVideoRequired'))
          return
        }
      }

      if (wanxResolvedModelKind === 't2v' && totalWanxAudioCount > 1) {
        toast.error(t('errors.wanxSingleAudioOnly'))
        return
      }
    }

    if (activeTab === 'video' && !isDoubaoSeedance20) {
      if (isDoubaoVideo && totalDoubaoReferenceImageCount > 4) {
        toast.error(t('errors.referenceLimitReached', { max: 4 }))
        return
      }

      if (!isDoubaoVideo && !isWanxVideo && supportsImageInput && totalVideoReferenceImageCount > maxInputImages) {
        toast.error(t('errors.referenceLimitReached', { max: maxInputImages }))
        return
      }
    }

    if (activeTab === 'video' && isDoubaoSeedance20) {
      if (hasDoubaoSeedance20ReferenceInputs && hasDoubaoSeedance20FrameInputs) {
        toast.error(t('errors.doubaoModesExclusive'))
        return
      }

      if (totalDoubaoReferenceImageCount > 9) {
        toast.error(t('errors.doubaoReferenceImageLimit'))
        return
      }

      if (totalDoubaoReferenceVideoCount > 3) {
        toast.error(t('errors.doubaoReferenceVideoLimit'))
        return
      }

      if (doubaoReferenceAudios.length > 3) {
        toast.error(t('errors.doubaoReferenceAudioLimit'))
        return
      }

      if (doubaoReferenceAudios.length > 0 && totalDoubaoReferenceImageCount === 0 && totalDoubaoReferenceVideoCount === 0) {
        toast.error(t('errors.doubaoAudioNeedsMedia'))
        return
      }
    }

    setLoading(true)

    try {
      const requestModel = activeTab === 'video' ? selectedExecutionModel : selectedModel

      // 构建参数对象（根据API文档，不同provider需要不同的参数格式）
      const parameters: Record<string, unknown> = {}

      if (activeTab === 'image') {
        // 图片生成参数 - 根据不同provider使用不同的参数名和格式
        if (isQwenImage) {
          // Qwen / 通义千问：使用 DashScope multimodal-generation，同步返回图片 URL
          parameters.size = aspectRatio
          parameters.n = 1
          parameters.watermark = false
          if (selectedModel?.capabilities?.remoteModel) {
            parameters.model = selectedModel.capabilities.remoteModel
          }
        } else if (isGptImage) {
          // GPT Image: 使用 size 参数（如 "1024x1024", "1536x1024", "auto"）
          parameters.size = aspectRatio
          // 根据是否有输入图片决定使用 generations 或 edits 接口
          parameters.gptImageOperation = hasImageReferenceInputs ? 'edits' : 'generations'
          parameters.model = selectedModel?.capabilities?.remoteModel || 'gpt-image-1.5'
        } else if (isNanoBananaPro) {
          // Nano Banana Pro / Gemini Pro: 使用 aspectRatio 和 imageSize
          if (supportsSizeSelect) {
            parameters.aspectRatio = aspectRatio
          }
          parameters.responseModalities = ['IMAGE']
          if (supportsResolutionSelect) {
            parameters.imageSize = imageSize
          }
        } else if (isNanoBanana) {
          // Nano Banana / Gemini: 使用 aspectRatio
          if (supportsSizeSelect) {
            parameters.aspectRatio = aspectRatio
          }
          if (supportsResolutionSelect) {
            parameters.imageSize = imageSize
          }
          parameters.responseModalities = ['IMAGE']
        } else if (isDoubao) {
          // 豆包: 使用 size 参数（"2K"/"4K"）
          parameters.size = imageSize
          parameters.response_format = 'url'
          parameters.watermark = false // 默认不显示水印
          if (selectedModel?.capabilities?.remoteModel) {
            parameters.model = selectedModel.capabilities.remoteModel
          }
        } else if (isMidjourney) {
          // Midjourney: botType 通过 API 请求体传递，其他参数后端会拼接到 prompt
          parameters.botType = mjBotType
          parameters.aspectRatio = aspectRatio
          if (mjVersion) parameters.version = mjVersion
          if (mjStylize) parameters.stylize = mjStylize
          if (mjChaos) parameters.chaos = mjChaos
          if (mjQuality) parameters.quality = mjQuality
          if (mjWeird) parameters.weird = mjWeird
          if (mjIw) parameters.iw = mjIw
          if (mjNo) parameters.no = mjNo
          if (mjStyle) parameters.style = mjStyle
          if (mjSeed) parameters.seed = mjSeed
          if (mjTile) parameters.tile = true
          if (mjPersonalize) parameters.personalize = true
        } else {
          // 其他provider：使用 aspectRatio
          parameters.aspectRatio = aspectRatio
        }
      } else {
        if (isWanxVideo) {
          parameters.resolution = videoResolution || '720P'
          parameters.duration = parseInt(videoDuration) || 5
          if (wanxCanCustomizeRatio) {
            parameters.ratio = aspectRatio
          }
          if (requestModel?.capabilities?.remoteModel) {
            parameters.model = requestModel.capabilities.remoteModel
          }
        } else if (isDoubaoVideo) {
          // 豆包 - resolution, ratio, duration, watermark
          parameters.resolution = videoResolution || '720p'
          parameters.ratio = aspectRatio
          parameters.duration = parseInt(videoDuration) || 5
          parameters.watermark = false // 默认无水印
          if (requestModel?.capabilities?.remoteModel) {
            parameters.model = requestModel.capabilities.remoteModel
          }
          if (isDoubaoSeedance20) {
            parameters.generate_audio = doubaoGenerateAudio
          }
        }
      }

      // 处理输入图片（转base64，根据API文档不同provider有不同的参数名）
      if (activeTab === 'image' && (inputImages.length > 0 || selectedProjectImageAssets.length > 0)) {
        const [localBase64Array, projectBase64Array] = await Promise.all([
          Promise.all(inputImages.map(toBase64)),
          Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
        ])
        const base64Array = [...localBase64Array, ...projectBase64Array]

        // 图片生成 - 根据provider使用不同的参数名
        if (selectedModel?.provider?.toLowerCase().includes('midjourney') || selectedModel?.provider?.toLowerCase().includes('mj')) {
          // Midjourney支持多图垫图（base64Array）
          // 注意：Midjourney 的 base64Array 需要去掉 data:image/...;base64, 前缀
          parameters.base64Array = base64Array.map((x) => (x.includes(',') ? x.split(',')[1] : x))
        } else if (isQwenImage) {
          // Qwen / 通义千问：直接传 images 数组，后端会转换为 messages[].content[].image
          parameters.images = base64Array
        } else if (isGptImage) {
          // GPT Image：单张用 image (string)，多张用 images (array)
          if (base64Array.length === 1) {
            parameters.image = base64Array[0]
          } else {
            parameters.images = base64Array
          }
        } else if (isDoubao) {
          // 豆包：使用 image 参数（单张为 string，多张为 array）
          parameters.image = base64Array.length === 1 ? base64Array[0] : base64Array
        } else if (isNanoBanana || isNanoBananaPro) {
          // Nano Banana / Gemini：使用 images 数组（支持多图垫图/多图生图）
          parameters.images = base64Array
          parameters.imageFirst = true
        } else {
          // 其他provider通常使用单图（imageBase64 或 imageUrl）
          parameters.imageBase64 = base64Array[0]
        }
      }

      if (activeTab === 'video') {
        // 视频参考素材参数按当前保留的视频提供商格式生成
        if (isWanxVideo) {
          const [
            uploadedReferenceImageUrls,
            uploadedReferenceVideoUrls,
            uploadedReferenceAudioUrls,
            uploadedFirstFrameUrls,
            uploadedLastFrameUrls,
          ] = await Promise.all([
            uploadReferenceInputs('image', wanxReferenceImages, 'wanx'),
            wanxAllowsReferenceVideoInputs
              ? uploadReferenceInputs('video', wanxReferenceVideos, 'wanx')
              : Promise.resolve([]),
            wanxSupportsAudioInput
              ? uploadReferenceInputs('audio', wanxReferenceAudios, 'wanx')
              : Promise.resolve([]),
            wanxSupportsFirstFrameInput
              ? uploadReferenceInputs('image', wanxFirstFrameImages, 'wanx')
              : Promise.resolve([]),
            wanxSupportsLastFrameInput
              ? uploadReferenceInputs('image', wanxLastFrameImages, 'wanx')
              : Promise.resolve([]),
          ])

          const referenceImageUrls = [...uploadedReferenceImageUrls, ...selectedProjectImageAssets.map((asset) => asset.url)]
          const referenceVideoUrls = [...uploadedReferenceVideoUrls, ...selectedProjectVideoAssets.map((asset) => asset.url)]
          const explicitFirstFrameUrl = uploadedFirstFrameUrls[0]
          const explicitLastFrameUrl = uploadedLastFrameUrls[0]

          if (wanxResolvedModelKind === 't2v') {
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls[0]) {
              parameters.audioUrl = uploadedReferenceAudioUrls[0]
            }
          } else if (wanxResolvedModelKind === 'i2v') {
            const firstFrameUrl = explicitFirstFrameUrl || referenceImageUrls[0]

            if (firstFrameUrl) {
              parameters.firstFrame = firstFrameUrl
            }
            if (referenceVideoUrls[0]) {
              parameters.firstClip = referenceVideoUrls[0]
            }
            if (wanxSupportsLastFrameInput && explicitLastFrameUrl) {
              parameters.lastFrame = explicitLastFrameUrl
            }
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls[0]) {
              parameters.drivingAudio = uploadedReferenceAudioUrls[0]
            }
          } else {
            if (referenceImageUrls.length > 0) {
              parameters.referenceImages = referenceImageUrls
            }
            if (!isWanxHappyhorseVideo && referenceVideoUrls.length > 0) {
              parameters.referenceVideos = referenceVideoUrls
            }
            if (wanxSupportsAudioInput && uploadedReferenceAudioUrls.length > 0) {
              parameters.referenceAudios = uploadedReferenceAudioUrls
            }
            if (!isWanxHappyhorseVideo && explicitFirstFrameUrl) {
              parameters.firstFrame = explicitFirstFrameUrl
            }
          }
        } else if (isDoubaoVideo) {
          if (isDoubaoSeedance20) {
            if (hasDoubaoSeedance20FrameInputs) {
              const frameUrls = await uploadReferenceInputs('image', doubaoFrameImages)
              parameters.firstFrame = frameUrls[0]
              if (frameUrls[1]) {
                parameters.lastFrame = frameUrls[1]
              }
            } else {
              const [uploadedReferenceImageUrls, uploadedReferenceVideoUrls, referenceAudioUrls] = await Promise.all([
                uploadReferenceInputs('image', doubaoReferenceImages),
                uploadReferenceInputs('video', doubaoReferenceVideos),
                uploadReferenceInputs('audio', doubaoReferenceAudios),
              ])
              const referenceImageUrls = [...uploadedReferenceImageUrls, ...selectedProjectImageAssets.map((asset) => asset.url)]
              const referenceVideoUrls = [...uploadedReferenceVideoUrls, ...selectedProjectVideoAssets.map((asset) => asset.url)]

              if (referenceImageUrls.length > 0) {
                parameters.referenceImages = referenceImageUrls
              }
              if (referenceVideoUrls.length > 0) {
                parameters.referenceVideos = referenceVideoUrls
              }
              if (referenceAudioUrls.length > 0) {
                parameters.referenceAudios = referenceAudioUrls
              }
            }
          } else if (doubaoReferenceImages.length > 0 || selectedProjectImageAssets.length > 0) {
            const [localBase64Array, projectBase64Array] = await Promise.all([
              Promise.all(doubaoReferenceImages.map(toBase64)),
              Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
            ])
            const base64Array = [...localBase64Array, ...projectBase64Array]
            parameters.referenceImages = base64Array
          } else if (doubaoFrameImages.length > 0) {
            const base64Array = await Promise.all(doubaoFrameImages.map(toBase64))
            parameters.firstFrame = base64Array[0]
            if (base64Array.length > 1) {
              parameters.lastFrame = base64Array[1]
            }
          }
        } else if (videoInputImages.length > 0 || selectedProjectImageAssets.length > 0) {
          const [localBase64Array, projectBase64Array] = await Promise.all([
            Promise.all(videoInputImages.map(toBase64)),
            Promise.all(selectedProjectImageAssets.map((asset) => toBase64FromUrl(asset.url))),
          ])
          const base64Array = [...localBase64Array, ...projectBase64Array]
          parameters.referenceImages = base64Array
        }
      }

      const requestData = {
        modelId: activeTab === 'video' ? (selectedExecutionModel?.id || selectedModelId) : selectedModelId,
        prompt: requestPrompt,
        negativePrompt: negativePrompt.trim() || undefined,
        projectId: selectedProjectId || undefined,
        ...(activeTab === 'image' && selectedProjectId
          ? { skipProjectPromptTransform: true }
          : {}),
        parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      }

      // 调用对应的生成服务
      const createdTask =
        activeTab === 'image'
          ? await imageService.generate(requestData)
          : await videoService.generate(requestData)

      upsertTaskInTasksViewCache(user?.id ?? null, createdTask)

      toast.success(t('success.title'))

      // 跳转到任务列表
      router.push(`/${locale}/tasks`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''

      console.error('Failed to create task:', error)
      toast.error(message || t('errors.submit'))
    } finally {
      setLoading(false)
    }
  }

  const requestPromptPreview = buildRequestPrompt()
  const hasRequestPrompt = Boolean(requestPromptPreview)
  const applyPromptDraft = (nextPrompt: string) => {
    setPrompt(nextPrompt)
    setShowOptimizeResult(false)
    setOptimizedPrompts([])
  }
  const seedanceSwitchClassName =
    'h-6 w-11 rounded-full border border-stone-300 shadow-sm data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-stone-300 dark:border-stone-500 dark:data-[state=unchecked]:bg-stone-600'
  const modeBadgeLabel = activeTab === 'image'
    ? t(`form.uploadReference.mode.${creationMode === 'image-to-image' ? 'imageToImage' : 'textToImage'}`)
    : t('tabs.video')
  const projectSummaryText = (projectsLoading || projectAssetsLoading)
    ? t('projectContext.loading')
    : selectedProject
      ? selectedProject.name
      : t('projectContext.none')
  const quickStartPrompts = useMemo(() => networkPrompts, [networkPrompts])
  const quickStartSourceLabel = t('featuredTemplates.sources.system')
  const quickStartCategories = useMemo(() => {
    return ['all', ...new Set(quickStartPrompts.map((item) => item.category).filter(Boolean) as string[])]
  }, [quickStartPrompts])
  const filteredQuickStartPrompts = useMemo(() => {
    return quickStartPrompts.filter((item) => {
      if (quickStartCategory === 'all') return true
      return item.category === quickStartCategory
    })
  }, [quickStartCategory, quickStartPrompts])
  const quickStartEmptyTitle = t('featuredTemplates.emptySystem')
  const quickStartEmptyDescription = t('featuredTemplates.emptySystemDesc')
  const quickStartChipBase =
    'flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'

  const syncQuickStartScrollState = () => {
    const scroller = quickStartScrollerRef.current
    if (!scroller || filteredQuickStartPrompts.length === 0) {
      setQuickStartCanScrollPrev(false)
      setQuickStartCanScrollNext(false)
      return
    }

    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth - 4)
    setQuickStartCanScrollPrev(scroller.scrollLeft > 4)
    setQuickStartCanScrollNext(scroller.scrollLeft < maxScrollLeft)
  }

  const getQuickStartCardDescription = (item: Prompt) => {
    return item.prompt.trim().replace(/\s+/g, ' ')
  }

  const scrollQuickStartBy = (direction: 'prev' | 'next') => {
    const scroller = quickStartScrollerRef.current
    if (!scroller) return

    scroller.scrollBy({
      left: direction === 'prev' ? -280 : 280,
      behavior: 'smooth',
    })
  }

  const handleQuickStartCardClick = (event: ReactMouseEvent<HTMLButtonElement>, item: Prompt) => {
    if (quickStartSuppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    applyNetworkPrompt(item)
  }

  const handleQuickStartPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = quickStartScrollerRef.current
    if (!scroller) return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    quickStartSuppressClickRef.current = false
    quickStartDragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: scroller.scrollLeft,
      hasMoved: false,
    }
    if (event.pointerType !== 'mouse') {
      scroller.setPointerCapture?.(event.pointerId)
    }
  }

  const handleQuickStartPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = quickStartScrollerRef.current
    const dragState = quickStartDragStateRef.current
    if (!scroller || !dragState.active || dragState.pointerId !== event.pointerId) return

    const deltaX = event.clientX - dragState.startX
    const dragThreshold = event.pointerType === 'mouse' ? 12 : 6

    if (!dragState.hasMoved && Math.abs(deltaX) <= dragThreshold) {
      return
    }

    if (!dragState.hasMoved) {
      dragState.hasMoved = true
      setQuickStartIsDragging(true)
    }

    scroller.scrollLeft = dragState.scrollLeft - deltaX
    syncQuickStartScrollState()
  }

  const endQuickStartDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = quickStartScrollerRef.current
    const dragState = quickStartDragStateRef.current
    if (!dragState.active) return

    if (event && scroller && dragState.pointerId === event.pointerId && event.pointerType !== 'mouse') {
      scroller.releasePointerCapture?.(event.pointerId)
    }

    const didDrag = dragState.hasMoved
    quickStartDragStateRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      scrollLeft: scroller?.scrollLeft ?? 0,
      hasMoved: false,
    }
    setQuickStartIsDragging(false)

    if (didDrag) {
      quickStartSuppressClickRef.current = true
      window.setTimeout(() => {
        quickStartSuppressClickRef.current = false
      }, 120)
    }

    syncQuickStartScrollState()
  }

  useEffect(() => {
    const scroller = quickStartScrollerRef.current
    if (scroller) {
      scroller.scrollTo({ left: 0, behavior: 'auto' })
    }

    const frameId = window.requestAnimationFrame(syncQuickStartScrollState)
    const handleResize = () => syncQuickStartScrollState()
    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [activeTab, quickStartCategory, quickStartLoading, filteredQuickStartPrompts.length])

  const renderPrimaryActionBar = (className?: string) => (
    <section
      className={cn(
        'relative min-w-0 overflow-hidden rounded-[24px] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-stone-700/80 dark:bg-[linear-gradient(180deg,rgba(10,12,18,0.98),rgba(17,24,39,0.98))] dark:shadow-[0_18px_40px_-28px_rgba(2,6,23,0.8)] sm:p-3.5',
        className,
      )}
    >
      <div className="absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.12),_transparent_72%)] dark:bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.18),_transparent_74%)]" />
      <div className="relative flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-aurora-purple px-1.5 text-[10px] font-semibold text-white">
              1
            </span>
            <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
              {t('steps.step1')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex max-w-full truncate rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                {modeBadgeLabel}
              </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <SimplifiedModelSelector
              models={models}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              type={activeTab}
              label={undefined}
              compact
            />
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedModelId || !hasRequestPrompt}
            className="h-11 w-full shrink-0 gap-1.5 rounded-[16px] bg-gradient-to-r from-aurora-purple to-aurora-pink px-4 text-white hover:opacity-90 lg:w-auto lg:min-w-[168px]"
          >
            {loading ? (
              <>
                <Clock className="h-4 w-4 animate-spin" />
                {t('actions.generating')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t('actions.generate')}
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  )

  return (
    <PageTransition className="create-page-no-edge-glow mx-auto w-full max-w-[1680px] space-y-5 bg-canvas px-4 py-5 pb-[9.75rem] text-stone-900 sm:space-y-6 sm:px-5 sm:py-6 sm:pb-[10.25rem] md:px-6 md:pb-6 lg:px-7 lg:pb-6 xl:px-8 dark:bg-canvas-dark dark:text-stone-100">
      <Tabs className="block w-full min-w-0" value={activeTab} onValueChange={(v) => setActiveTab(v as CreationType)}>
        <FadeIn variant="slide">
          <section id="create-workbench" className="scroll-mt-28 mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white md:text-4xl">
                {t('title')}
              </h1>
            </div>

            <div className="w-full md:max-w-md">
              <div className="rounded-[22px] border border-stone-200/80 bg-white/92 p-1 shadow-canvas dark:border-stone-700 dark:bg-stone-900/92">
                <TabsList className="grid h-auto min-w-0 w-full grid-cols-2 rounded-[18px] bg-transparent p-0">
                  <TabsTrigger
                    value="image"
                    className="theme-tab-trigger min-w-0 gap-2 rounded-[18px] px-4 py-2.5 text-sm font-medium data-[state=active]:shadow-none"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {t('tabs.image')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="video"
                    className="theme-tab-trigger min-w-0 gap-2 rounded-[18px] px-4 py-2.5 text-sm font-medium data-[state=active]:shadow-none"
                  >
                    <VideoIcon className="h-4 w-4" />
                    {t('tabs.video')}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </section>
        </FadeIn>

        <div className="space-y-5 sm:space-y-6">
          {activeTab === 'image' ? (
          <FadeIn variant="fade" delay={0.15}>
            <section className="w-full min-w-0 rounded-[28px] border border-stone-200/80 bg-white/92 p-4 shadow-canvas backdrop-blur-sm sm:p-5 dark:border-stone-700 dark:bg-stone-900/92">
              <div className="flex flex-col gap-4">
                <div className="sm:hidden">
                  <div className="flex min-w-0 items-center gap-2 pb-1 whitespace-nowrap">
                    <span className="shrink-0 text-sm font-semibold text-stone-800 dark:text-stone-100">
                      {t('featuredTemplates.quickStart')}
                    </span>

                    <span
                      title={quickStartSourceLabel}
                      className="min-w-0 flex-1 truncate rounded-full border border-aurora-purple/20 bg-aurora-purple/10 px-2.5 py-1 text-[11px] font-medium text-aurora-purple"
                    >
                      {quickStartSourceLabel}
                    </span>
                  </div>
                </div>

                <div className="hidden flex-col gap-3 sm:flex lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <span className="text-sm font-semibold text-stone-800 dark:text-stone-100">
                        {t('featuredTemplates.quickStart')}
                      </span>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {t('tabs.image')}
                      </p>
                    </div>

                    <span
                      title={quickStartSourceLabel}
                      className="inline-flex min-w-0 max-w-full rounded-full border border-aurora-purple/20 bg-aurora-purple/10 px-3 py-1.5 text-xs font-medium text-aurora-purple"
                    >
                      <span className="truncate">{quickStartSourceLabel}</span>
                    </span>
                  </div>
                </div>

                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('featuredTemplates.dragHint')}
                </p>

                {quickStartCategories.length > 1 && (
                  <div className="overflow-x-auto scrollbar-hide pb-1">
                    <div className="flex w-max items-center gap-2">
                      {quickStartCategories.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setQuickStartCategory(category)}
                          className={cn(
                            quickStartChipBase,
                            quickStartCategory === category
                              ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                              : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100'
                          )}
                        >
                          {category === 'all' ? t('featuredTemplates.categoryAll') : category}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {quickStartLoading ? (
                  <div className="overflow-x-auto scrollbar-hide pb-1">
                    <div className="flex w-max gap-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`quick-start-skeleton-${index}`}
                          className="h-[208px] w-[240px] shrink-0 animate-pulse rounded-[24px] border border-stone-200 bg-stone-100 dark:border-stone-700 dark:bg-stone-800"
                        />
                      ))}
                    </div>
                  </div>
                ) : filteredQuickStartPrompts.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-10 text-center dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                      {quickStartEmptyTitle}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-stone-500 dark:text-stone-400">
                      {quickStartEmptyDescription}
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    {quickStartCanScrollPrev && (
                      <button
                        type="button"
                        onClick={() => scrollQuickStartBy('prev')}
                        className="absolute left-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/80 bg-white/92 text-stone-700 shadow-lg backdrop-blur transition-colors hover:bg-white dark:border-stone-700 dark:bg-stone-950/88 dark:text-stone-100"
                        aria-label={t('featuredTemplates.scrollPrev')}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    )}

                    {quickStartCanScrollNext && (
                      <button
                        type="button"
                        onClick={() => scrollQuickStartBy('next')}
                        className="absolute right-2 top-1/2 z-20 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-stone-200/80 bg-white/92 text-stone-700 shadow-lg backdrop-blur transition-colors hover:bg-white dark:border-stone-700 dark:bg-stone-950/88 dark:text-stone-100"
                        aria-label={t('featuredTemplates.scrollNext')}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}

                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 bg-gradient-to-r from-white/95 to-transparent dark:from-stone-900/95 md:block" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-12 bg-gradient-to-l from-white/95 to-transparent dark:from-stone-900/95 md:block" />

                    <div
                      ref={quickStartScrollerRef}
                      onScroll={syncQuickStartScrollState}
                      onPointerDown={handleQuickStartPointerDown}
                      onPointerMove={handleQuickStartPointerMove}
                      onPointerUp={endQuickStartDrag}
                      onPointerCancel={endQuickStartDrag}
                      className={cn(
                        'overflow-x-auto scrollbar-hide pb-2 [-ms-overflow-style:none] [scrollbar-width:none] touch-pan-x overscroll-x-contain scroll-smooth select-none',
                        quickStartIsDragging ? 'cursor-grabbing' : 'cursor-grab'
                      )}
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      <div className="flex w-max snap-x snap-mandatory gap-3 px-1">
                      {filteredQuickStartPrompts.map((tpl) => (
                        <button
                          key={`${tpl.title}-${tpl.created}-${tpl.link}`}
                          type="button"
                          onClick={(event) => handleQuickStartCardClick(event, tpl)}
                          className="group relative h-[220px] w-[min(76vw,248px)] shrink-0 snap-start overflow-hidden rounded-[24px] border border-stone-200/80 bg-stone-100 text-left transition duration-300 active:scale-[0.985] sm:w-[240px] hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-xl dark:border-stone-700 dark:bg-stone-800 dark:hover:border-stone-500"
                        >
                          {tpl.preview ? (
                            <img
                              src={tpl.preview}
                              alt={tpl.title}
                              draggable={false}
                              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-800">
                              <ImageIconSolid className="h-14 w-14 text-stone-300 dark:text-stone-600" />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-black/10 transition-colors duration-300 group-hover:bg-black/20" />
                          <div className="absolute inset-0 hidden flex-col justify-between bg-black/60 p-4 opacity-0 transition-opacity duration-300 md:flex md:group-hover:opacity-100">
                            <div className="flex items-start justify-between gap-2">
                              {tpl.category ? (
                                <span className="rounded-full bg-white/92 px-2.5 py-1 text-[11px] font-medium text-stone-700 backdrop-blur dark:bg-stone-950/88 dark:text-stone-100">
                                  {tpl.category}
                                </span>
                              ) : (
                                <span />
                              )}
                              <span
                                title={tpl.link || quickStartSourceLabel}
                                className="max-w-[178px] truncate rounded-full border border-white/20 bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/92 backdrop-blur"
                              >
                                {quickStartSourceLabel}
                              </span>
                            </div>

                            <div className="space-y-3">
                              <p className="line-clamp-4 text-xs leading-5 text-white/90">
                                {getQuickStartCardDescription(tpl)}
                              </p>
                            </div>
                          </div>

                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-4 pt-12">
                            <div className="flex items-end justify-between gap-3">
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-semibold leading-6 text-white">
                                  {tpl.title}
                                </p>
                                {tpl.category && (
                                  <p className="mt-1 text-[11px] font-medium text-white/70 md:hidden">
                                    {tpl.category}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
                                {t('featuredTemplates.applyTemplate')}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  </div>
                )}
              </div>
            </section>
          </FadeIn>
          ) : null}

          <div className="mx-auto grid w-full max-w-[1520px] min-w-0 gap-5">
            {activeTab === 'video' ? (
              <VideoCreateWorkspace
                locale={locale}
                prompt={prompt}
                applyPromptDraft={applyPromptDraft}
                promptEditorRef={promptEditorRef}
                promptTextareaRef={promptTextareaRef}
                mentionableMedia={mentionableMedia}
                mentionPreviewUrls={mentionPreviewUrls}
                showMentionPicker={showMentionPicker}
                onPromptEditorInput={handlePromptEditorInput}
                onPromptEditorKeyDown={handlePromptEditorKeyDown}
                onPromptEditorClick={handlePromptEditorClick}
                onOpenMentionPicker={handleOpenMentionPicker}
                onSelectMentionMedia={handleSelectMentionMedia}
                projectContextLoading={projectsLoading || projectAssetsLoading}
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectProjectId={setSelectedProjectId}
                selectedProject={selectedProject}
                projectAssets={projectAssets}
                usableProjectAssets={usableProjectAssets}
                selectedProjectAssetIds={selectedProjectAssetIds}
                disabledProjectAssetIds={disabledProjectAssetIds}
                onToggleProjectAsset={handleToggleProjectAsset}
                supportsImageInput={supportsImageInput}
                selectedModel={selectedModel}
                isWanxVideo={isWanxVideo}
                isWanxMergedVideo={isWanxMergedVideo}
                isWanx27Video={isWanx27Video}
                wanxResolvedModelKind={wanxResolvedModelKind}
                wanxSupportsAudioInput={wanxSupportsAudioInput}
                wanxAllowsReferenceVideoInputs={wanxAllowsReferenceVideoInputs}
                wanxSupportsFirstFrameInput={wanxSupportsFirstFrameInput}
                wanxSupportsLastFrameInput={wanxSupportsLastFrameInput}
                wanxReferenceVideosAreContinuationOnly={isWanxHappyhorseVideo}
                wanxCanCustomizeRatio={wanxCanCustomizeRatio}
                wanxHasReferenceVideoInputs={wanxHasReferenceVideoInputs}
                wanxVideoContinuationEnabled={wanxVideoContinuationEnabled}
                setWanxVideoContinuationEnabled={setWanxVideoContinuationEnabled}
                isDoubaoVideo={isDoubaoVideo}
                isDoubaoSeedance20={isDoubaoSeedance20}
                hasDoubaoSeedance20ReferenceInputs={hasDoubaoSeedance20ReferenceInputs}
                hasDoubaoSeedance20FrameInputs={hasDoubaoSeedance20FrameInputs}
                videoInputImages={videoInputImages}
                setVideoInputImages={setVideoInputImages}
                doubaoReferenceImages={doubaoReferenceImages}
                setDoubaoReferenceImages={setDoubaoReferenceImages}
                doubaoReferenceVideos={doubaoReferenceVideos}
                setDoubaoReferenceVideos={setDoubaoReferenceVideos}
                doubaoReferenceAudios={doubaoReferenceAudios}
                setDoubaoReferenceAudios={setDoubaoReferenceAudios}
                doubaoFrameImages={doubaoFrameImages}
                setDoubaoFrameImages={setDoubaoFrameImages}
                wanxReferenceImages={wanxReferenceImages}
                setWanxReferenceImages={setWanxReferenceImages}
                wanxReferenceVideos={wanxReferenceVideos}
                setWanxReferenceVideos={setWanxReferenceVideos}
                wanxReferenceAudios={wanxReferenceAudios}
                setWanxReferenceAudios={setWanxReferenceAudios}
                wanxFirstFrameImages={wanxFirstFrameImages}
                setWanxFirstFrameImages={setWanxFirstFrameImages}
                wanxLastFrameImages={wanxLastFrameImages}
                setWanxLastFrameImages={setWanxLastFrameImages}
                doubaoGenerateAudio={doubaoGenerateAudio}
                setDoubaoGenerateAudio={setDoubaoGenerateAudio}
                seedanceSwitchClassName={seedanceSwitchClassName}
                videoDuration={videoDuration}
                setVideoDuration={setVideoDuration}
                videoResolution={videoResolution}
                setVideoResolution={setVideoResolution}
                aspectRatio={aspectRatio}
                setAspectRatio={setAspectRatio}
                wanxVideoResolutionOptions={wanxVideoResolutionOptions}
                wanxVideoRatioOptions={wanxVideoRatioOptions}
                wanxVideoDurationOptions={wanxVideoDurationOptions}
                doubaoVideoResolutionOptions={doubaoVideoResolutionOptions}
                doubaoVideoRatioOptions={doubaoVideoRatioOptions}
                doubaoVideoDurationOptions={doubaoVideoDurationOptions}
                standardVideoReferenceUploadMaxFiles={standardVideoReferenceUploadMaxFiles}
                wanxReferenceImageUploadMaxFiles={wanxReferenceImageUploadMaxFiles}
                wanxReferenceVideoUploadMaxFiles={wanxReferenceVideoUploadMaxFiles}
                wanxReferenceAudioUploadMaxFiles={wanxReferenceAudioUploadMaxFiles}
                doubaoReferenceUploadMaxFiles={doubaoReferenceUploadMaxFiles}
                seedanceReferenceImageUploadMaxFiles={seedanceReferenceImageUploadMaxFiles}
                seedanceReferenceVideoUploadMaxFiles={seedanceReferenceVideoUploadMaxFiles}
              />
            ) : (
              <div className="min-w-0 space-y-5">
                <FadeIn variant="slide" delay={0.3}>
                  <Card className="relative min-w-0 overflow-x-hidden overflow-y-visible border border-stone-200/80 bg-white/92 p-0 shadow-canvas dark:border-stone-700 dark:bg-stone-900/92">
                    <CardHeader className="mb-0 border-b border-stone-100 px-5 pb-4 pt-5 dark:border-stone-800 sm:px-6">
                      <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-aurora-purple text-sm font-semibold text-white">
                          2
                        </span>
                        <span>{t('steps.step2')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                      <div className="space-y-2">
                        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {t('form.prompt.label')}
                          <Info className="h-3 w-3 text-muted-foreground" />
                        </label>
                        <div ref={promptEditorRef} className="relative min-w-0">
                          <div
                            ref={promptTextareaRef}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={handlePromptEditorInput}
                            onKeyDown={handlePromptEditorKeyDown}
                            onClick={handlePromptEditorClick}
                            data-placeholder={t('form.prompt.placeholder')}
                            className="min-h-[120px] w-full overflow-x-hidden break-words rounded-[24px] border-2 border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-3 pr-14 font-ui text-[15px] text-stone-900 shadow-canvas transition-all duration-300 hover:border-stone-300 hover:shadow-canvas-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-aurora-purple sm:min-h-[112px] sm:px-6 sm:pr-16 sm:text-base dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(28,32,44,0.92),rgba(17,24,39,0.96))] dark:text-stone-100 dark:hover:border-stone-500 empty:before:pointer-events-none empty:before:text-stone-400 dark:empty:before:text-stone-500 empty:before:content-[attr(data-placeholder)]"
                          />

                          <button
                            type="button"
                            onClick={handleOpenMentionPicker}
                            className="absolute right-2.5 top-2.5 inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-aurora-purple/30 bg-white/90 px-2 font-ui text-sm font-semibold text-aurora-purple shadow-sm transition-colors hover:bg-aurora-purple/10 sm:right-3 sm:top-3 sm:h-9 sm:min-w-9 sm:rounded-xl dark:border-aurora-purple/40 dark:bg-stone-800/90 dark:text-aurora-pink dark:hover:bg-aurora-purple/15"
                            title={t('form.prompt.mentionButtonTitle')}
                          >
                            @
                          </button>

                          {showMentionPicker && mentionableMedia.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-2xl border border-stone-200 bg-white p-2.5 shadow-canvas-lg sm:p-3 dark:border-stone-700 dark:bg-stone-900">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                                  {t('form.prompt.mentionPickerTitle')}
                                </p>
                                <span className="text-xs text-stone-500 dark:text-stone-400">
                                  {t('form.prompt.mentionPickerCount', { count: mentionableMedia.length })}
                                </span>
                              </div>
                              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                                {mentionableMedia.map((media, index) => {
                                  const mentionLabel = getMentionReferenceLabel(media.kind, media.ordinal)
                                  const previewUrl = mentionPreviewUrls[index]
                                  const mediaName = getMentionMediaDisplayName(media)

                                  return (
                                    <button
                                      key={`${media.source}-${media.kind}-${mediaName}-${index}`}
                                      type="button"
                                      onClick={() => handleSelectMentionMedia(index)}
                                      className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-left transition-colors hover:border-aurora-purple/40 hover:bg-aurora-purple/5 sm:gap-3 sm:px-3 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-aurora-purple/40 dark:hover:bg-aurora-purple/10"
                                    >
                                      <div
                                        className={cn(
                                          'relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg border sm:h-14 sm:w-14',
                                          getMentionMediaTone(media.kind)
                                        )}
                                      >
                                        {media.kind === 'image' && previewUrl ? (
                                          <img
                                            src={previewUrl}
                                            alt={mediaName}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <span className="text-[10px] font-semibold tracking-[0.2em]">
                                            {getMentionMediaBadge(media.kind)}
                                          </span>
                                        )}
                                        <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                                          {mentionLabel}
                                        </span>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                                          {mentionLabel}
                                        </p>
                                        <p className="truncate text-xs text-stone-500 dark:text-stone-400">
                                          {getMentionMediaTypeLabel(media.kind)} · {mediaName}
                                        </p>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Lightbulb className="h-3 w-3" />
                          {t('form.prompt.hint')}
                        </p>

                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] transition-all hover:border-aurora-purple/35 hover:shadow-[0_20px_48px_-30px_rgba(124,58,237,0.24)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_20px_48px_-34px_rgba(2,6,23,0.84)] dark:hover:border-aurora-purple/35 dark:hover:bg-stone-900 sm:w-auto sm:min-w-[236px]"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-aurora-purple/12 text-aurora-purple dark:bg-aurora-purple/18 dark:text-aurora-pink">
                                  <Wand2 className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                                    {t('form.prompt.optimize')}
                                  </span>
                                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                                    {isOptimizing
                                      ? t('form.prompt.optimizing')
                                      : showOptimizeResult && optimizedPrompts.length > 0
                                        ? t('form.prompt.optimizedResult')
                                        : t('form.prompt.optimize')}
                                  </span>
                                </span>
                                {showOptimizeResult && optimizedPrompts.length > 0 ? (
                                  <span className="rounded-full bg-aurora-purple/10 px-2 py-1 text-[11px] font-medium text-aurora-purple">
                                    {optimizedPrompts.length}
                                  </span>
                                ) : null}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={10}
                              className="z-[70] !w-[min(96vw,680px)] rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_32px_90px_-38px_rgba(15,23,42,0.42)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_36px_96px_-38px_rgba(2,6,23,0.88)]"
                            >
                              <div className="space-y-3">
                                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                                  {t('form.prompt.optimize')}
                                </p>
                                <PromptOptimizePanel
                                  isOptimizing={isOptimizing}
                                  showOptimizeResult={showOptimizeResult}
                                  optimizeText={optimizeText}
                                  optimizedPrompts={optimizedPrompts}
                                  hasRequestPrompt={hasRequestPrompt}
                                  onOptimizePrompt={handleOptimizePrompt}
                                  onUsePrompt={(optimizedPrompt) => {
                                    applyPromptDraft(optimizedPrompt)
                                    toast.success(t('form.prompt.useOptimized'))
                                  }}
                                  canIncludeImages={inputImages.length > 0}
                                  includeImages={includeImagesInOptimize}
                                  onToggleIncludeImages={setIncludeImagesInOptimize}
                                />
                              </div>
                            </PopoverContent>
                          </Popover>

                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="flex w-full items-center gap-3 rounded-2xl border border-stone-200 bg-white px-3 py-3 text-left shadow-[0_18px_42px_-32px_rgba(15,23,42,0.38)] transition-all hover:border-aurora-purple/35 hover:shadow-[0_20px_48px_-30px_rgba(124,58,237,0.24)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_20px_48px_-34px_rgba(2,6,23,0.84)] dark:hover:border-aurora-purple/35 dark:hover:bg-stone-900 sm:w-auto sm:min-w-[236px]"
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-stone-900/8 text-stone-700 dark:bg-white/10 dark:text-stone-100">
                                  <FolderKanban className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                                    {t('projectContext.title')}
                                  </span>
                                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                                    {projectSummaryText}
                                  </span>
                                </span>
                                {selectedUsableProjectAssetCount > 0 ? (
                                  <span className="rounded-full bg-aurora-purple/10 px-2 py-1 text-[11px] font-medium text-aurora-purple">
                                    {selectedUsableProjectAssetCount}
                                  </span>
                                ) : null}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              side="bottom"
                              sideOffset={10}
                              className="z-[70] !w-[min(96vw,760px)] rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_32px_90px_-38px_rgba(15,23,42,0.42)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_36px_96px_-38px_rgba(2,6,23,0.88)]"
                            >
                              <ProjectContextPanel
                                locale={locale}
                                loading={projectsLoading || projectAssetsLoading}
                                projects={projects}
                                selectedProjectId={selectedProjectId}
                                onSelectProjectId={setSelectedProjectId}
                                selectedProject={selectedProject}
                                projectAssets={projectAssets}
                                usableAssets={usableProjectAssets}
                                selectedAssetIds={selectedProjectAssetIds}
                                disabledAssetIds={disabledProjectAssetIds}
                                onToggleAsset={handleToggleProjectAsset}
                                supportsReferenceAssets={supportsImageInput}
                              />
                            </PopoverContent>
                          </Popover>

                        </div>
                      </div>


                      <Separator />

                      {supportsImageInput && (
                        <div className="space-y-3">
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                            <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <ImageIconSolid className="h-4 w-4" />
                              {t('form.uploadReference.label')}
                              {(inputImages.length > 0 || selectedProjectImageAssets.length > 0) && (
                                <span className="text-xs text-primary">
                                  （{t(`form.uploadReference.mode.${creationMode === 'image-to-image' ? 'imageToImage' : 'textToImage'}`)}）
                                </span>
                              )}
                            </label>
                            {selectedModel?.capabilities?.limits?.maxInputImages && (
                              <span className="text-xs text-muted-foreground">
                                {t('form.uploadReference.maxFiles', {
                                  max: imageReferenceUploadMaxFiles,
                                })}
                              </span>
                            )}
                          </div>

                          <ImageDropzone
                            value={inputImages}
                            onChange={setInputImages}
                            maxFiles={imageReferenceUploadMaxFiles}
                            maxSize={10}
                            accept="image/png,image/jpeg"
                            disabled={imageReferenceUploadMaxFiles === 0}
                          />

                          {inputImages.length > 0 ? (
                            <p className="text-xs text-primary flex items-center gap-1">
                              <Lightbulb className="h-3 w-3" />
                              {t('form.uploadReference.hintWithImages', { count: inputImages.length })}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Info className="h-3 w-3" />
                              {t('form.uploadReference.hint')}
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </FadeIn>

                <FadeIn variant="slide" delay={0.4}>
                  <Card className="relative min-w-0 overflow-hidden border border-stone-200/80 bg-white/92 p-0 shadow-canvas dark:border-stone-700 dark:bg-stone-900/92">
                    <CardHeader className="mb-0 border-b border-stone-100 px-5 pb-4 pt-5 dark:border-stone-800 sm:px-6">
                      <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-aurora-purple text-sm font-semibold text-white">
                          3
                        </span>
                        <span>{t('steps.step3')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
                      <div className="space-y-4">
                        {(isNanoBanana || isNanoBananaPro) ? (
                          <>
                            {supportsSizeSelect && (
                              <AspectRatioSelect
                                label={t('form.parameters.aspectRatio')}
                                value={aspectRatio}
                                onChange={setAspectRatio}
                                options={aspectRatioOptions}
                                showPreview={true}
                              />
                            )}
                            {supportsResolutionSelect && (
                              <AspectRatioSelect
                                label={t('form.parameters.imageSize')}
                                value={imageSize}
                                onChange={setImageSize}
                                options={imageSizeOptions || NANO_BANANA_IMAGE_SIZE_OPTIONS}
                                showPreview={false}
                              />
                            )}
                          </>
                        ) : isDoubao && imageSizeOptions ? (
                          <AspectRatioSelect
                            label={t('form.parameters.imageSize')}
                            value={imageSize}
                            onChange={setImageSize}
                            options={imageSizeOptions}
                            showPreview={false}
                          />
                        ) : (isQwenImage || isGptImage) && aspectRatioOptions.length > 0 ? (
                          <AspectRatioSelect
                            label={t('form.parameters.imageResolution')}
                            value={aspectRatio}
                            onChange={setAspectRatio}
                            options={aspectRatioOptions}
                            showPreview={false}
                          />
                        ) : isMidjourney ? (
                          <>
                            <AspectRatioSelect
                              label={t('form.parameters.aspectRatio')}
                              value={aspectRatio}
                              onChange={setAspectRatio}
                              options={COMMON_ASPECT_RATIO_OPTIONS}
                              showPreview={true}
                            />
                            <AspectRatioSelect
                              label={t('form.parameters.mjBotType')}
                              value={mjBotType}
                              onChange={setMjBotType}
                              options={MIDJOURNEY_BOT_TYPE_OPTIONS}
                              showPreview={false}
                            />

                            <div className="border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setMjAdvancedOpen(!mjAdvancedOpen)}
                                className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                              >
                                <span>{t('form.parameters.mjAdvanced')}</span>
                                <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform duration-200 ${mjAdvancedOpen ? 'rotate-180' : ''}`} />
                              </button>

                              {mjAdvancedOpen && (
                                <div className="px-4 pb-4 space-y-4 border-t border-stone-100 dark:border-stone-700">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4">
                                    <AspectRatioSelect
                                      label={t('form.parameters.mjVersion')}
                                      value={mjVersion}
                                      onChange={setMjVersion}
                                      options={MIDJOURNEY_VERSION_OPTIONS}
                                      showPreview={false}
                                    />
                                    <AspectRatioSelect
                                      label={t('form.parameters.mjQuality')}
                                      value={mjQuality}
                                      onChange={setMjQuality}
                                      options={MIDJOURNEY_QUALITY_OPTIONS}
                                      showPreview={false}
                                    />
                                  </div>

                                  <AspectRatioSelect
                                    label={t('form.parameters.mjStyleRaw')}
                                    value={mjStyle}
                                    onChange={setMjStyle}
                                    options={MIDJOURNEY_STYLE_OPTIONS}
                                    showPreview={false}
                                  />

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjStylize')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="1000"
                                        value={mjStylize}
                                        onChange={(event: { target: { value: string } }) => setMjStylize(event.target.value)}
                                        placeholder="0-1000"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjChaos')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={mjChaos}
                                        onChange={(event: { target: { value: string } }) => setMjChaos(event.target.value)}
                                        placeholder="0-100"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjWeird')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="3000"
                                        value={mjWeird}
                                        onChange={(event: { target: { value: string } }) => setMjWeird(event.target.value)}
                                        placeholder="0-3000"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjIw')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="3"
                                        step="0.1"
                                        value={mjIw}
                                        onChange={(event: { target: { value: string } }) => setMjIw(event.target.value)}
                                        placeholder="0-3"
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.seed')}
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        max="4294967295"
                                        value={mjSeed}
                                        onChange={(event: { target: { value: string } }) => setMjSeed(event.target.value)}
                                        placeholder={t('form.parameters.mjSeedPlaceholder')}
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
                                        {t('form.parameters.mjNo')}
                                      </label>
                                      <input
                                        type="text"
                                        value={mjNo}
                                        onChange={(event: { target: { value: string } }) => setMjNo(event.target.value)}
                                        placeholder={t('form.parameters.mjNoPlaceholder')}
                                        className="w-full rounded-xl px-4 py-3 bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border-2 border-stone-200 dark:border-stone-600 text-stone-900 dark:text-stone-100 shadow-canvas transition-all duration-300 hover:border-stone-300 dark:hover:border-stone-500 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 outline-none text-sm"
                                      />
                                    </div>
                                  </div>

                                  <div className="flex flex-col items-start gap-3 pt-1 sm:flex-row sm:items-center sm:gap-6">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={mjTile}
                                        onChange={(event: { target: { checked: boolean } }) => setMjTile(event.target.checked)}
                                        className="rounded border-stone-300 bg-white text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800"
                                      />
                                      <span className="text-sm text-stone-700 dark:text-stone-300">{t('form.parameters.mjTile')}</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={mjPersonalize}
                                        onChange={(event: { target: { checked: boolean } }) => setMjPersonalize(event.target.checked)}
                                        className="rounded border-stone-300 bg-white text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800"
                                      />
                                      <span className="text-sm text-stone-700 dark:text-stone-300">{t('form.parameters.mjPersonalize')}</span>
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        ) : aspectRatioOptions.length > 0 ? (
                          <AspectRatioSelect
                            label={t('form.parameters.aspectRatio')}
                            value={aspectRatio}
                            onChange={setAspectRatio}
                            options={aspectRatioOptions}
                            showPreview={true}
                          />
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </FadeIn>
              </div>
            )}
          </div>
        </div>
      </Tabs>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 mt-5 md:bottom-4">
        <div className="mx-auto w-full max-w-[1520px]">
          {renderPrimaryActionBar('w-full')}
        </div>
      </div>
    </PageTransition>
  )
}
