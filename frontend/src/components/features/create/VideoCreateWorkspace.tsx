'use client'

import { useMemo, useState } from 'react'
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject,
  SetStateAction,
} from 'react'
import { useTranslations } from '@/i18n/client'
import { toast } from 'sonner'
import {
  Clapperboard,
  FolderKanban,
  Image as ImageIconSolid,
  Info,
  Lightbulb,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EnhancedSelect, type EnhancedSelectOption } from '@/components/ui/EnhancedSelect'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ImageDropzone } from '@/components/ui/ImageDropzone'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { Switch } from '@/components/ui/switch'
import { AspectRatioSelect } from '@/components/ui/AspectRatioSelect'
import { FadeIn } from '@/components/shared/FadeIn'
import { cn } from '@/lib/utils/cn'
import type { ProjectAsset, ProjectSummary } from '@/lib/api/types/projects'
import { promptOptimizeService } from '@/lib/api/services'
import type { AspectRatioOption } from './config/aspectRatioOptions'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import { ProjectContextPanel } from './ProjectContextPanel'

type MentionMediaKind = 'image' | 'video' | 'audio'
type MentionMediaSource = 'upload' | 'project'

type MentionableMediaItem = {
  kind: MentionMediaKind
  ordinal: number
  source: MentionMediaSource
  file: File | null
  asset: ProjectAsset | null
}

type PromptVariant = {
  id: string
  title: string
  description: string
  prompt: string
}

type VideoAssistantGoal = 'brand' | 'product' | 'portrait' | 'story' | 'travel'
type VideoAssistantStyle = 'cinematic' | 'premium' | 'realistic' | 'dreamy' | 'social'
type VideoAssistantCamera = 'static' | 'push' | 'tracking' | 'orbit' | 'aerial'
type VideoAssistantPace = 'gentle' | 'steady' | 'brisk'
type VideoAssistantAudio = 'immersive' | 'narration' | 'ambience' | 'silent'

export interface VideoCreateWorkspaceProps {
  locale: string
  prompt: string
  applyPromptDraft: (nextPrompt: string) => void
  promptEditorRef: RefObject<HTMLDivElement | null>
  promptTextareaRef: RefObject<HTMLDivElement | null>
  mentionableMedia: MentionableMediaItem[]
  mentionPreviewUrls: Array<string | null>
  showMentionPicker: boolean
  onPromptEditorInput: () => void
  onPromptEditorKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  onPromptEditorClick: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenMentionPicker: () => void
  onSelectMentionMedia: (index: number) => void
  projectContextLoading: boolean
  projects: ProjectSummary[]
  selectedProjectId: string
  onSelectProjectId: (projectId: string) => void
  selectedProject: ProjectSummary | null
  projectAssets: ProjectAsset[]
  usableProjectAssets: ProjectAsset[]
  selectedProjectAssetIds: string[]
  disabledProjectAssetIds: string[]
  onToggleProjectAsset: (assetId: string) => void
  supportsImageInput: boolean
  selectedModel: ModelWithCapabilities | null
  isWanxVideo: boolean
  isWanxMergedVideo: boolean
  isWanx27Video: boolean
  wanxResolvedModelKind: 't2v' | 'i2v' | 'r2v' | null
  wanxSupportsAudioInput: boolean
  wanxCanCustomizeRatio: boolean
  wanxHasReferenceVideoInputs: boolean
  wanxVideoContinuationEnabled: boolean
  setWanxVideoContinuationEnabled: Dispatch<SetStateAction<boolean>>
  isDoubaoVideo: boolean
  isDoubaoSeedance20: boolean
  hasDoubaoSeedance20ReferenceInputs: boolean
  hasDoubaoSeedance20FrameInputs: boolean
  videoInputImages: File[]
  setVideoInputImages: Dispatch<SetStateAction<File[]>>
  doubaoReferenceImages: File[]
  setDoubaoReferenceImages: Dispatch<SetStateAction<File[]>>
  doubaoReferenceVideos: File[]
  setDoubaoReferenceVideos: Dispatch<SetStateAction<File[]>>
  doubaoReferenceAudios: File[]
  setDoubaoReferenceAudios: Dispatch<SetStateAction<File[]>>
  doubaoFrameImages: File[]
  setDoubaoFrameImages: Dispatch<SetStateAction<File[]>>
  wanxReferenceImages: File[]
  setWanxReferenceImages: Dispatch<SetStateAction<File[]>>
  wanxReferenceVideos: File[]
  setWanxReferenceVideos: Dispatch<SetStateAction<File[]>>
  wanxReferenceAudios: File[]
  setWanxReferenceAudios: Dispatch<SetStateAction<File[]>>
  wanxFirstFrameImages: File[]
  setWanxFirstFrameImages: Dispatch<SetStateAction<File[]>>
  wanxLastFrameImages: File[]
  setWanxLastFrameImages: Dispatch<SetStateAction<File[]>>
  doubaoGenerateAudio: boolean
  setDoubaoGenerateAudio: Dispatch<SetStateAction<boolean>>
  seedanceSwitchClassName: string
  videoDuration: string
  setVideoDuration: Dispatch<SetStateAction<string>>
  videoResolution: string
  setVideoResolution: Dispatch<SetStateAction<string>>
  aspectRatio: string
  setAspectRatio: Dispatch<SetStateAction<string>>
  wanxVideoResolutionOptions: AspectRatioOption[] | null
  wanxVideoRatioOptions: AspectRatioOption[] | null
  wanxVideoDurationOptions: AspectRatioOption[] | null
  doubaoVideoResolutionOptions: AspectRatioOption[] | null
  doubaoVideoRatioOptions: AspectRatioOption[] | null
  doubaoVideoDurationOptions: AspectRatioOption[] | null
  standardVideoReferenceUploadMaxFiles: number
  wanxReferenceImageUploadMaxFiles: number
  wanxReferenceVideoUploadMaxFiles: number
  wanxReferenceAudioUploadMaxFiles: number
  doubaoReferenceUploadMaxFiles: number
  seedanceReferenceImageUploadMaxFiles: number
  seedanceReferenceVideoUploadMaxFiles: number
}

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

function getMentionMediaDisplayName(item: MentionableMediaItem) {
  if (item.source === 'project') {
    return item.asset?.title || item.asset?.fileName || `${getMentionMediaTypeLabel(item.kind)}素材`
  }

  return item.file?.name || `${getMentionMediaTypeLabel(item.kind)}素材`
}

function joinPromptParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join('，')
}

export function VideoCreateWorkspace({
  locale,
  prompt,
  applyPromptDraft,
  promptEditorRef,
  promptTextareaRef,
  mentionableMedia,
  mentionPreviewUrls,
  showMentionPicker,
  onPromptEditorInput,
  onPromptEditorKeyDown,
  onPromptEditorClick,
  onOpenMentionPicker,
  onSelectMentionMedia,
  projectContextLoading,
  projects,
  selectedProjectId,
  onSelectProjectId,
  selectedProject,
  projectAssets,
  usableProjectAssets,
  selectedProjectAssetIds,
  disabledProjectAssetIds,
  onToggleProjectAsset,
  supportsImageInput,
  selectedModel,
  isWanxVideo,
  isWanxMergedVideo,
  isWanx27Video,
  wanxResolvedModelKind,
  wanxSupportsAudioInput,
  wanxCanCustomizeRatio,
  wanxHasReferenceVideoInputs,
  wanxVideoContinuationEnabled,
  setWanxVideoContinuationEnabled,
  isDoubaoVideo,
  isDoubaoSeedance20,
  hasDoubaoSeedance20ReferenceInputs,
  hasDoubaoSeedance20FrameInputs,
  videoInputImages,
  setVideoInputImages,
  doubaoReferenceImages,
  setDoubaoReferenceImages,
  doubaoReferenceVideos,
  setDoubaoReferenceVideos,
  doubaoReferenceAudios,
  setDoubaoReferenceAudios,
  doubaoFrameImages,
  setDoubaoFrameImages,
  wanxReferenceImages,
  setWanxReferenceImages,
  wanxReferenceVideos,
  setWanxReferenceVideos,
  wanxReferenceAudios,
  setWanxReferenceAudios,
  wanxFirstFrameImages,
  setWanxFirstFrameImages,
  wanxLastFrameImages,
  setWanxLastFrameImages,
  doubaoGenerateAudio,
  setDoubaoGenerateAudio,
  seedanceSwitchClassName,
  videoDuration,
  setVideoDuration,
  videoResolution,
  setVideoResolution,
  aspectRatio,
  setAspectRatio,
  wanxVideoResolutionOptions,
  wanxVideoRatioOptions,
  wanxVideoDurationOptions,
  doubaoVideoResolutionOptions,
  doubaoVideoRatioOptions,
  doubaoVideoDurationOptions,
  standardVideoReferenceUploadMaxFiles,
  wanxReferenceImageUploadMaxFiles,
  wanxReferenceVideoUploadMaxFiles,
  wanxReferenceAudioUploadMaxFiles,
  doubaoReferenceUploadMaxFiles,
  seedanceReferenceImageUploadMaxFiles,
  seedanceReferenceVideoUploadMaxFiles,
}: VideoCreateWorkspaceProps) {
  const t = useTranslations('create')
  const isWanxI2v = wanxResolvedModelKind === 'i2v'
  const isWanxR2v = wanxResolvedModelKind === 'r2v'
  const wanxHasCustomRatio = aspectRatio !== '16:9'

  const handleWanxContinuationToggle = (checked: boolean) => {
    if (checked && wanxHasCustomRatio) {
      toast.error(t('errors.wanxI2vRatioUnsupported'))
      return
    }
    setWanxVideoContinuationEnabled(checked)
  }

  const handleWanxLastFrameChange = (files: File[]) => {
    if (files.length > 0 && wanxHasCustomRatio) {
      toast.error(t('errors.wanxI2vRatioUnsupported'))
      return
    }
    setWanxLastFrameImages(files)
  }

  const [briefIdea, setBriefIdea] = useState('')
  const [briefSubject, setBriefSubject] = useState('')
  const [briefScene, setBriefScene] = useState('')
  const [briefAction, setBriefAction] = useState('')
  const [briefMustKeep, setBriefMustKeep] = useState('')
  const [assistantGoal, setAssistantGoal] = useState<VideoAssistantGoal>('brand')
  const [assistantStyle, setAssistantStyle] = useState<VideoAssistantStyle>('cinematic')
  const [assistantCamera, setAssistantCamera] = useState<VideoAssistantCamera>('push')
  const [assistantPace, setAssistantPace] = useState<VideoAssistantPace>('steady')
  const [assistantAudio, setAssistantAudio] = useState<VideoAssistantAudio>('immersive')
  const [professionalPrompts, setProfessionalPrompts] = useState<PromptVariant[]>([])
  const [isGeneratingProfessionalPrompt, setIsGeneratingProfessionalPrompt] = useState(false)

  const hasAssistantInput = Boolean(
    [prompt, briefIdea, briefSubject, briefScene, briefAction, briefMustKeep].some((value) => value.trim())
  )

  const assistantGoalOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      { value: 'brand', label: t('videoAssistant.options.goals.brand') },
      { value: 'product', label: t('videoAssistant.options.goals.product') },
      { value: 'portrait', label: t('videoAssistant.options.goals.portrait') },
      { value: 'story', label: t('videoAssistant.options.goals.story') },
      { value: 'travel', label: t('videoAssistant.options.goals.travel') },
    ],
    [t]
  )

  const assistantStyleOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      { value: 'cinematic', label: t('videoAssistant.options.styles.cinematic') },
      { value: 'premium', label: t('videoAssistant.options.styles.premium') },
      { value: 'realistic', label: t('videoAssistant.options.styles.realistic') },
      { value: 'dreamy', label: t('videoAssistant.options.styles.dreamy') },
      { value: 'social', label: t('videoAssistant.options.styles.social') },
    ],
    [t]
  )

  const assistantCameraOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      { value: 'static', label: t('videoAssistant.options.cameras.static') },
      { value: 'push', label: t('videoAssistant.options.cameras.push') },
      { value: 'tracking', label: t('videoAssistant.options.cameras.tracking') },
      { value: 'orbit', label: t('videoAssistant.options.cameras.orbit') },
      { value: 'aerial', label: t('videoAssistant.options.cameras.aerial') },
    ],
    [t]
  )

  const assistantPaceOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      { value: 'gentle', label: t('videoAssistant.options.paces.gentle') },
      { value: 'steady', label: t('videoAssistant.options.paces.steady') },
      { value: 'brisk', label: t('videoAssistant.options.paces.brisk') },
    ],
    [t]
  )

  const assistantAudioOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      { value: 'immersive', label: t('videoAssistant.options.audios.immersive') },
      { value: 'narration', label: t('videoAssistant.options.audios.narration') },
      { value: 'ambience', label: t('videoAssistant.options.audios.ambience') },
      { value: 'silent', label: t('videoAssistant.options.audios.silent') },
    ],
    [t]
  )

  const quickRefineActions = useMemo(
    () => [
      {
        key: 'ad',
        label: t('videoAssistant.refines.ad'),
        patch: t('videoAssistant.refinePatches.ad'),
      },
      {
        key: 'cinematic',
        label: t('videoAssistant.refines.cinematic'),
        patch: t('videoAssistant.refinePatches.cinematic'),
      },
      {
        key: 'natural',
        label: t('videoAssistant.refines.natural'),
        patch: t('videoAssistant.refinePatches.natural'),
      },
      {
        key: 'stable',
        label: t('videoAssistant.refines.stable'),
        patch: t('videoAssistant.refinePatches.stable'),
      },
      {
        key: 'rhythm',
        label: t('videoAssistant.refines.rhythm'),
        patch: t('videoAssistant.refinePatches.rhythm'),
      },
    ],
    [t]
  )

  const createProfessionalPromptVariants = async () => {
    if (!hasAssistantInput) {
      toast.error(t('videoAssistant.emptyError'))
      return
    }

    const mediaHint = mentionableMedia.some((item) => item.source === 'upload')
      ? t('videoAssistant.mediaHint')
      : ''
    const assistantPrompt = [
      '请根据以下信息生成 1 个可直接用于 AI 视频模型的专业提示词。',
      '只输出最终提示词正文，不要输出标题、解释、编号、引号或多个版本。',
      '',
      joinPromptParts([
        prompt && `当前基础描述：${prompt}`,
        briefIdea && `${t('videoAssistant.prefix.idea')}${briefIdea}`,
        briefSubject && `${t('videoAssistant.prefix.subject')}${briefSubject}`,
        briefScene && `${t('videoAssistant.prefix.scene')}${briefScene}`,
        briefAction && `${t('videoAssistant.prefix.action')}${briefAction}`,
        briefMustKeep && `${t('videoAssistant.prefix.mustKeep')}${briefMustKeep}`,
      ]),
      `创作目标：${t(`videoAssistant.options.goals.${assistantGoal}`)}`,
      `视觉风格：${t(`videoAssistant.options.styles.${assistantStyle}`)}`,
      `镜头语言：${t(`videoAssistant.options.cameras.${assistantCamera}`)}`,
      `节奏：${t(`videoAssistant.options.paces.${assistantPace}`)}`,
      `声音策略：${t(`videoAssistant.options.audios.${assistantAudio}`)}`,
      `声音要求：${t(`videoAssistant.audioDirectives.${assistantAudio}`)}`,
      `${t('videoAssistant.prefix.duration')}${videoDuration}${t('videoAssistant.secondsSuffix')}`,
      `${t('videoAssistant.prefix.ratio')}${aspectRatio}`,
      selectedModel?.name ? `目标模型：${selectedModel.name}` : null,
      isDoubaoSeedance20 && doubaoGenerateAudio ? t('videoAssistant.audioGenerateHint') : null,
      mediaHint || null,
    ]
      .filter(Boolean)
      .join('\n')

    setIsGeneratingProfessionalPrompt(true)
    setProfessionalPrompts([])

    try {
      const body: {
        prompt: string
        modelType?: string
        task: 'video_director'
      } = {
        prompt: assistantPrompt,
        task: 'video_director',
      }

      if (selectedModel?.provider) {
        body.modelType = selectedModel.provider
      }

      const result = await promptOptimizeService.optimizePrompt(body)
      const finalPrompt = typeof result.content === 'string' ? result.content.trim() : ''
      if (!finalPrompt) {
        throw new Error(t('videoAssistant.generateError'))
      }

      setProfessionalPrompts([
        {
          id: 'professional',
          title: t('videoAssistant.variants.professional.title'),
          description: t('videoAssistant.variants.professional.description'),
          prompt: finalPrompt,
        },
      ])
    } catch (error) {
      console.error('Video assistant generation failed:', error)
      const message = error instanceof Error ? error.message : t('videoAssistant.generateError')
      toast.error(message || t('videoAssistant.generateError'))
    } finally {
      setIsGeneratingProfessionalPrompt(false)
    }
  }

  const applyRefinePatch = (patch: string) => {
    const basePrompt = prompt.trim()
    const nextPrompt = basePrompt ? `${basePrompt}\n${patch}` : patch
    applyPromptDraft(nextPrompt)
    toast.success(t('videoAssistant.refineApplied'))
  }

  const handleUsePromptDraft = (nextPrompt: string) => {
    applyPromptDraft(nextPrompt)
    toast.success(t('form.prompt.useOptimized'))
  }

  const selectedUsableProjectAssetCount = useMemo(
    () => usableProjectAssets.filter((asset) => selectedProjectAssetIds.includes(asset.id)).length,
    [usableProjectAssets, selectedProjectAssetIds]
  )

  const projectSummaryText = projectContextLoading
    ? t('projectContext.loading')
    : selectedProject
      ? selectedProject.name
      : t('projectContext.none')

  return (
    <div className="min-w-0 space-y-5">
      <FadeIn variant="slide" delay={0.2}>
        <Card className="relative min-w-0 overflow-x-hidden overflow-y-visible border border-stone-200/80 bg-white/92 p-0 shadow-canvas dark:border-stone-700 dark:bg-stone-900/92">
          <CardHeader className="mb-0 border-b border-stone-100 px-5 pb-4 pt-5 dark:border-stone-800 sm:px-6">
            <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-aurora-purple text-sm font-semibold text-white">
                2
              </span>
              <span>{t('steps.step2')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
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
                  onInput={onPromptEditorInput}
                  onKeyDown={onPromptEditorKeyDown}
                  onClick={onPromptEditorClick}
                  data-placeholder={t('form.prompt.placeholderVideo')}
                  className="min-h-[140px] w-full overflow-x-hidden break-words rounded-[24px] border-2 border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] px-4 py-3 pr-14 font-ui text-[15px] text-stone-900 shadow-canvas transition-all duration-300 hover:border-stone-300 hover:shadow-canvas-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-aurora-purple sm:min-h-[128px] sm:px-6 sm:pr-16 sm:text-base dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(28,32,44,0.92),rgba(17,24,39,0.96))] dark:text-stone-100 dark:hover:border-stone-500 empty:before:pointer-events-none empty:before:text-stone-400 dark:empty:before:text-stone-500 empty:before:content-[attr(data-placeholder)]"
                />

                <button
                  type="button"
                  onClick={onOpenMentionPicker}
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
                            onClick={() => onSelectMentionMedia(index)}
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
                        <Clapperboard className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                          {t('videoAssistant.badge')}
                        </span>
                        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                          {isGeneratingProfessionalPrompt
                            ? t('videoAssistant.generating')
                            : professionalPrompts.length > 0
                            ? t('videoAssistant.generatedCount', { count: professionalPrompts.length })
                            : t('videoAssistant.generate')}
                        </span>
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    sideOffset={10}
                    className="z-[70] !w-[min(96vw,980px)] rounded-[28px] border border-stone-200 bg-white p-5 shadow-[0_32px_90px_-38px_rgba(15,23,42,0.42)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_36px_96px_-38px_rgba(2,6,23,0.88)]"
                  >
                    <div className="max-h-[min(72vh,760px)] space-y-5 overflow-y-auto pr-1">
                      <div className="space-y-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-aurora-purple/20 bg-aurora-purple/8 px-3 py-1 text-xs font-semibold text-aurora-purple dark:border-aurora-purple/30 dark:bg-aurora-purple/10 dark:text-aurora-pink">
                          <Clapperboard className="h-3.5 w-3.5" />
                          {t('videoAssistant.badge')}
                        </span>
                        <div>
                          <p className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                            {t('videoAssistant.title')}
                          </p>
                          <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
                            {t('videoAssistant.subtitle')}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                              {t('videoAssistant.ideaLabel')}
                            </label>
                            <input
                              type="text"
                              value={briefIdea}
                              onChange={(event) => setBriefIdea(event.target.value)}
                              placeholder={t('videoAssistant.ideaPlaceholder')}
                              className="w-full rounded-2xl border-2 border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-canvas transition-all duration-300 outline-none hover:border-stone-300 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:border-stone-500"
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                                {t('videoAssistant.subjectLabel')}
                              </label>
                              <input
                                type="text"
                                value={briefSubject}
                                onChange={(event) => setBriefSubject(event.target.value)}
                                placeholder={t('videoAssistant.subjectPlaceholder')}
                                className="w-full rounded-2xl border-2 border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-canvas transition-all duration-300 outline-none hover:border-stone-300 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:border-stone-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                                {t('videoAssistant.sceneLabel')}
                              </label>
                              <input
                                type="text"
                                value={briefScene}
                                onChange={(event) => setBriefScene(event.target.value)}
                                placeholder={t('videoAssistant.scenePlaceholder')}
                                className="w-full rounded-2xl border-2 border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-canvas transition-all duration-300 outline-none hover:border-stone-300 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:border-stone-500"
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                                {t('videoAssistant.actionLabel')}
                              </label>
                              <input
                                type="text"
                                value={briefAction}
                                onChange={(event) => setBriefAction(event.target.value)}
                                placeholder={t('videoAssistant.actionPlaceholder')}
                                className="w-full rounded-2xl border-2 border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-canvas transition-all duration-300 outline-none hover:border-stone-300 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:border-stone-500"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                                {t('videoAssistant.mustKeepLabel')}
                              </label>
                              <input
                                type="text"
                                value={briefMustKeep}
                                onChange={(event) => setBriefMustKeep(event.target.value)}
                                placeholder={t('videoAssistant.mustKeepPlaceholder')}
                                className="w-full rounded-2xl border-2 border-stone-200 bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-canvas transition-all duration-300 outline-none hover:border-stone-300 focus:border-aurora-purple focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:hover:border-stone-500"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                          <EnhancedSelect
                            label={t('videoAssistant.goalLabel')}
                            value={assistantGoal}
                            onChange={(value) => setAssistantGoal(value as VideoAssistantGoal)}
                            options={assistantGoalOptions}
                          />
                          <EnhancedSelect
                            label={t('videoAssistant.styleLabel')}
                            value={assistantStyle}
                            onChange={(value) => setAssistantStyle(value as VideoAssistantStyle)}
                            options={assistantStyleOptions}
                          />
                          <EnhancedSelect
                            label={t('videoAssistant.cameraLabel')}
                            value={assistantCamera}
                            onChange={(value) => setAssistantCamera(value as VideoAssistantCamera)}
                            options={assistantCameraOptions}
                          />
                          <EnhancedSelect
                            label={t('videoAssistant.paceLabel')}
                            value={assistantPace}
                            onChange={(value) => setAssistantPace(value as VideoAssistantPace)}
                            options={assistantPaceOptions}
                          />
                          <div className="md:col-span-2 xl:col-span-1">
                            <EnhancedSelect
                              label={t('videoAssistant.audioLabel')}
                              value={assistantAudio}
                              onChange={(value) => setAssistantAudio(value as VideoAssistantAudio)}
                              options={assistantAudioOptions}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={createProfessionalPromptVariants}
                          disabled={isGeneratingProfessionalPrompt}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-aurora-purple to-aurora-pink px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                        >
                          <Sparkles className="h-4 w-4" />
                          {isGeneratingProfessionalPrompt
                            ? t('videoAssistant.generating')
                            : t('videoAssistant.generate')}
                        </button>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {t('videoAssistant.generateHint')}
                        </span>
                      </div>

                      {isGeneratingProfessionalPrompt ? (
                        <div className="rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-300">
                          {t('videoAssistant.generating')}
                        </div>
                      ) : null}

                      {!isGeneratingProfessionalPrompt && professionalPrompts.length > 0 ? (
                        <div className="grid gap-3">
                          {professionalPrompts.map((variant) => (
                            <div
                              key={variant.id}
                              className="rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-800/70"
                            >
                              <div className="space-y-2">
                                <div className="space-y-1">
                                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                                    {variant.title}
                                  </p>
                                  <p className="text-xs text-stone-500 dark:text-stone-400">
                                    {variant.description}
                                  </p>
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">
                                  {variant.prompt}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleUsePromptDraft(variant.prompt)}
                                  className="inline-flex items-center justify-center rounded-xl border border-aurora-purple/25 bg-white px-3 py-2 text-xs font-medium text-aurora-purple transition-colors hover:bg-aurora-purple/8 dark:border-aurora-purple/35 dark:bg-stone-900 dark:text-aurora-pink dark:hover:bg-aurora-purple/10"
                                >
                                  {t('videoAssistant.useVariant')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="rounded-2xl border border-stone-200/80 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-800/70">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                              {t('videoAssistant.refineTitle')}
                            </p>
                            <p className="text-xs text-stone-500 dark:text-stone-400">
                              {t('videoAssistant.refineSubtitle')}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {quickRefineActions.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => applyRefinePatch(item.patch)}
                              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-aurora-purple/40 hover:bg-aurora-purple/6 hover:text-aurora-purple dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-aurora-purple/40 dark:hover:bg-aurora-purple/10 dark:hover:text-aurora-pink"
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
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
                      loading={projectContextLoading}
                      projects={projects}
                      selectedProjectId={selectedProjectId}
                      onSelectProjectId={onSelectProjectId}
                      selectedProject={selectedProject}
                      projectAssets={projectAssets}
                      usableAssets={usableProjectAssets}
                      selectedAssetIds={selectedProjectAssetIds}
                      disabledAssetIds={disabledProjectAssetIds}
                      onToggleAsset={onToggleProjectAsset}
                      supportsReferenceAssets={supportsImageInput}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <Separator />

            {isWanxVideo && (supportsImageInput || wanxSupportsAudioInput) && (
              <div className="space-y-4">
                {isWanxMergedVideo && wanxHasReferenceVideoInputs ? (
                  <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 dark:border-stone-700 dark:bg-stone-900/70">
                    <span className="text-sm font-medium">{t('form.uploadReference.labelWanxVideoContinuation')}</span>
                    <Switch
                      checked={wanxVideoContinuationEnabled}
                      onCheckedChange={handleWanxContinuationToggle}
                      className={seedanceSwitchClassName}
                    />
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  {supportsImageInput ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelWanxReferenceImages')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: wanxReferenceImageUploadMaxFiles })}
                        </span>
                      </div>
                      <FileDropzone
                        value={wanxReferenceImages}
                        onChange={setWanxReferenceImages}
                        disabled={wanxReferenceImageUploadMaxFiles === 0}
                        maxFiles={wanxReferenceImageUploadMaxFiles}
                        maxSize={20}
                        accept="image/jpeg,image/jpg,image/png,image/bmp,image/webp"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                      />
                    </div>
                  ) : null}

                  {supportsImageInput ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {isWanxI2v
                            ? t('form.uploadReference.labelWanxContinuationVideo')
                            : t('form.uploadReference.labelWanxReferenceVideos')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: wanxReferenceVideoUploadMaxFiles })}
                        </span>
                      </div>
                      <FileDropzone
                        value={wanxReferenceVideos}
                        onChange={setWanxReferenceVideos}
                        disabled={wanxReferenceVideoUploadMaxFiles === 0}
                        maxFiles={wanxReferenceVideoUploadMaxFiles}
                        maxSize={100}
                        accept="video/mp4,video/quicktime"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                      />
                    </div>
                  ) : null}

                  {wanxSupportsAudioInput ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {isWanxR2v
                            ? t('form.uploadReference.labelWanxReferenceAudios')
                            : t('form.uploadReference.labelWanxDrivingAudio')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: wanxReferenceAudioUploadMaxFiles })}
                        </span>
                      </div>
                      <FileDropzone
                        value={wanxReferenceAudios}
                        onChange={setWanxReferenceAudios}
                        disabled={wanxReferenceAudioUploadMaxFiles === 0}
                        maxFiles={wanxReferenceAudioUploadMaxFiles}
                        maxSize={15}
                        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                      />
                    </div>
                  ) : null}

                  {isWanx27Video && (supportsImageInput || isWanxMergedVideo) ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelWanxFirstFrame')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: 1 })}
                        </span>
                      </div>
                      <FileDropzone
                        value={wanxFirstFrameImages}
                        onChange={setWanxFirstFrameImages}
                        maxFiles={1}
                        maxSize={20}
                        accept="image/jpeg,image/jpg,image/png,image/bmp,image/webp"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                      />
                    </div>
                  ) : null}

                  {(isWanxMergedVideo || isWanxI2v) && isWanx27Video ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelWanxLastFrame')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: 1 })}
                        </span>
                      </div>
                      <FileDropzone
                        value={wanxLastFrameImages}
                        onChange={handleWanxLastFrameChange}
                        maxFiles={1}
                        maxSize={20}
                        accept="image/jpeg,image/jpg,image/png,image/bmp,image/webp"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {supportsImageInput && !isDoubaoVideo && !isWanxVideo && (
              <div className="space-y-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <ImageIconSolid className="h-4 w-4" />
                    {t('form.uploadReference.labelVideoReference')}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('form.uploadReference.optional')}
                    </span>
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {t('form.uploadReference.maxFiles', {
                      max: standardVideoReferenceUploadMaxFiles,
                    })}
                  </span>
                </div>

                <ImageDropzone
                  value={videoInputImages}
                  onChange={setVideoInputImages}
                  maxFiles={standardVideoReferenceUploadMaxFiles}
                  maxSize={10}
                  accept="image/png,image/jpeg"
                  disabled={standardVideoReferenceUploadMaxFiles === 0}
                />

                {videoInputImages.length > 0 ? (
                  <p className="flex items-center gap-1 text-xs text-primary">
                    <Lightbulb className="h-3 w-3" />
                    {t('form.uploadReference.hintVideoReferenceWithImages', {
                      count: videoInputImages.length,
                    })}
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {t('form.uploadReference.hintVideoReference')}
                  </p>
                )}
              </div>
            )}

            {isDoubaoVideo && supportsImageInput && (
              isDoubaoSeedance20 ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelDoubaoReferenceImages20')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: seedanceReferenceImageUploadMaxFiles })}
                        </span>
                      </div>
                      <FileDropzone
                        value={doubaoReferenceImages}
                        onChange={(files) => {
                          setDoubaoReferenceImages(files)
                          if (files.length > 0) {
                            setDoubaoFrameImages([])
                          }
                        }}
                        disabled={hasDoubaoSeedance20FrameInputs || seedanceReferenceImageUploadMaxFiles === 0}
                        maxFiles={seedanceReferenceImageUploadMaxFiles}
                        maxSize={30}
                        accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                        description={t('form.uploadReference.fileLimitHint', { max: seedanceReferenceImageUploadMaxFiles, size: 30 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('form.uploadReference.hintDoubaoReferenceImages20')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelDoubaoReferenceVideos20')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: seedanceReferenceVideoUploadMaxFiles })}
                        </span>
                      </div>
                      <FileDropzone
                        value={doubaoReferenceVideos}
                        onChange={(files) => {
                          setDoubaoReferenceVideos(files)
                          if (files.length > 0) {
                            setDoubaoFrameImages([])
                          }
                        }}
                        disabled={hasDoubaoSeedance20FrameInputs || seedanceReferenceVideoUploadMaxFiles === 0}
                        maxFiles={seedanceReferenceVideoUploadMaxFiles}
                        maxSize={50}
                        accept="video/mp4,video/quicktime"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                        description={t('form.uploadReference.fileLimitHint', { max: seedanceReferenceVideoUploadMaxFiles, size: 50 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('form.uploadReference.hintDoubaoReferenceVideos20')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-sm font-medium">
                          {t('form.uploadReference.labelDoubaoReferenceAudios20')}
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {t('form.uploadReference.maxItems', { max: 3 })}
                        </span>
                      </div>
                      <FileDropzone
                        value={doubaoReferenceAudios}
                        onChange={(files) => {
                          setDoubaoReferenceAudios(files)
                          if (files.length > 0) {
                            setDoubaoFrameImages([])
                          }
                        }}
                        disabled={hasDoubaoSeedance20FrameInputs}
                        maxFiles={3}
                        maxSize={15}
                        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
                        idleText={t('form.uploadReference.dropzoneIdle')}
                        draggingText={t('form.uploadReference.dropzoneDragging')}
                        description={t('form.uploadReference.fileLimitHint', { max: 3, size: 15 })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('form.uploadReference.hintDoubaoReferenceAudios20')}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium">
                        {t('form.uploadReference.labelDoubaoFrames20')}
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {t('form.uploadReference.optional')}
                      </span>
                    </div>
                    <FileDropzone
                      value={doubaoFrameImages}
                      onChange={(files) => {
                        setDoubaoFrameImages(files)
                        if (files.length > 0) {
                          setDoubaoReferenceImages([])
                          setDoubaoReferenceVideos([])
                          setDoubaoReferenceAudios([])
                        }
                      }}
                      disabled={hasDoubaoSeedance20ReferenceInputs}
                      maxFiles={2}
                      maxSize={30}
                      accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif,image/heic,image/heif"
                      idleText={t('form.uploadReference.dropzoneIdle')}
                      draggingText={t('form.uploadReference.dropzoneDragging')}
                      description={t('form.uploadReference.fileLimitHint', { max: 2, size: 30 })}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('form.uploadReference.hintDoubaoFrames20')}
                    </p>
                  </div>

                  <div className="rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-br from-stone-50 to-emerald-50/70 p-4 shadow-sm dark:border-emerald-500/30 dark:from-stone-900 dark:to-emerald-950/20">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200/80 bg-white/90 p-3 dark:border-stone-700 dark:bg-stone-900/70">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{t('form.parameters.generateAudio')}</p>
                          <p className="text-xs text-muted-foreground">{t('form.parameters.generateAudioHint')}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-xs font-semibold',
                              doubaoGenerateAudio
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                                : 'bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300'
                            )}
                          >
                            {doubaoGenerateAudio ? t('form.parameters.switchOn') : t('form.parameters.switchOff')}
                          </span>
                          <Switch
                            checked={doubaoGenerateAudio}
                            onCheckedChange={setDoubaoGenerateAudio}
                            className={seedanceSwitchClassName}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {t('form.uploadReference.hintDoubaoVideoExclusive')}
                  </p>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <ImageIconSolid className="h-4 w-4" />
                        {t('form.uploadReference.labelVideoReference')}
                        <span className="text-xs font-normal text-muted-foreground">
                          {t('form.uploadReference.optional')}
                        </span>
                      </label>
                      <span className="text-xs text-muted-foreground">
                        {t('form.uploadReference.maxFiles', { max: doubaoReferenceUploadMaxFiles })}
                      </span>
                    </div>

                    <ImageDropzone
                      value={doubaoReferenceImages}
                      onChange={(files) => {
                        setDoubaoReferenceImages(files)
                        if (files.length > 0) {
                          setDoubaoFrameImages([])
                        }
                      }}
                      maxFiles={doubaoReferenceUploadMaxFiles}
                      maxSize={10}
                      accept="image/png,image/jpeg"
                      disabled={doubaoFrameImages.length > 0 || doubaoReferenceUploadMaxFiles === 0}
                    />

                    {doubaoReferenceImages.length > 0 ? (
                      <p className="flex items-center gap-1 text-xs text-primary">
                        <Lightbulb className="h-3 w-3" />
                        {t('form.uploadReference.hintVideoReferenceWithImages', {
                          count: doubaoReferenceImages.length,
                        })}
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Info className="h-3 w-3" />
                        {t('form.uploadReference.hintDoubaoReferenceImages')}
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <ImageIconSolid className="h-4 w-4" />
                      {t('form.uploadReference.labelVideo')}
                      <span className="text-xs font-normal text-muted-foreground">
                        {t('form.uploadReference.optional')}
                      </span>
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {t('form.uploadReference.maxFiles', { max: 2 })}
                    </span>
                  </div>

                  <ImageDropzone
                    value={doubaoFrameImages}
                    onChange={(files) => {
                      setDoubaoFrameImages(files)
                      if (files.length > 0) {
                        setDoubaoReferenceImages([])
                      }
                    }}
                    maxFiles={2}
                    maxSize={10}
                    accept="image/png,image/jpeg"
                    disabled={doubaoReferenceImages.length > 0 || selectedProjectAssetIds.length > 0}
                  />

                  {doubaoFrameImages.length > 0 ? (
                    <p className="flex items-center gap-1 text-xs text-primary">
                      <Lightbulb className="h-3 w-3" />
                      {doubaoFrameImages.length === 1
                        ? t('form.uploadReference.hintFirstFrame')
                        : t('form.uploadReference.hintFirstAndLastFrame')}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Info className="h-3 w-3" />
                      {t('form.uploadReference.hintDoubaoVideo')}
                    </p>
                  )}
                </div>
              )
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
            {isWanxVideo && wanxVideoResolutionOptions && wanxVideoRatioOptions && wanxVideoDurationOptions ? (
              <>
                <AspectRatioSelect
                  label={t('form.parameters.videoResolution')}
                  value={videoResolution}
                  onChange={setVideoResolution}
                  options={wanxVideoResolutionOptions}
                  showPreview={false}
                />
                <div className="space-y-2">
                  <AspectRatioSelect
                    label={t('form.parameters.aspectRatio')}
                    value={aspectRatio}
                    onChange={setAspectRatio}
                    options={wanxVideoRatioOptions}
                    disabled={!wanxCanCustomizeRatio}
                    showPreview={true}
                  />
                </div>
                <AspectRatioSelect
                  label={t('form.parameters.videoDuration')}
                  value={videoDuration}
                  onChange={setVideoDuration}
                  options={wanxVideoDurationOptions}
                  showPreview={false}
                />
              </>
            ) : isDoubaoVideo && doubaoVideoResolutionOptions && doubaoVideoRatioOptions && doubaoVideoDurationOptions ? (
              <>
                <AspectRatioSelect
                  label={t('form.parameters.videoResolution')}
                  value={videoResolution}
                  onChange={setVideoResolution}
                  options={doubaoVideoResolutionOptions}
                  showPreview={false}
                />
                <AspectRatioSelect
                  label={t('form.parameters.aspectRatio')}
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={doubaoVideoRatioOptions}
                  showPreview={true}
                />
                <AspectRatioSelect
                  label={t('form.parameters.videoDuration')}
                  value={videoDuration}
                  onChange={setVideoDuration}
                  options={doubaoVideoDurationOptions}
                  showPreview={false}
                />
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('form.parameters.videoDuration')}</label>
                    <Select
                      value={videoDuration}
                      onChange={(event) => setVideoDuration(event.target.value)}
                      options={[
                        { value: '5', label: t('form.parameters.durations.5') },
                        { value: '10', label: t('form.parameters.durations.10') },
                        { value: '15', label: t('form.parameters.durations.15') },
                      ]}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">{t('form.parameters.videoResolution')}</label>
                    <Select
                      value={videoResolution}
                      onChange={(event) => setVideoResolution(event.target.value)}
                      options={[
                        { value: '720p', label: t('form.parameters.resolutions.720p') },
                        { value: '1080p', label: t('form.parameters.resolutions.1080p') },
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('form.parameters.aspectRatio')}</label>
                  <Select
                    value={aspectRatio}
                    onChange={(event) => setAspectRatio(event.target.value)}
                    options={[
                      { value: '16:9', label: t('form.parameters.aspectRatios.16:9') },
                      { value: '9:16', label: t('form.parameters.aspectRatios.9:16') },
                      { value: '1:1', label: t('form.parameters.aspectRatios.1:1') },
                    ]}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  )
}
