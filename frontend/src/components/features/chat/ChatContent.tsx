'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import { usePathname, useRouter } from '@/lib/router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Plus,
  Trash2,
  Send,
  Square,
  ImagePlus,
  Paperclip,
  Sparkles,
  Bot,
  Brain,
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  MessageSquare,
  PanelLeft,
  Search,
  FolderOpen,
  Pin,
  PinOff,
  Pencil,
  Check,
  X,
  ChevronDown,
  Copy,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'

import { PageTransition } from '@/components/shared/PageTransition'
import { Button } from '@/components/ui/Button'
import { EnhancedSelect, type EnhancedSelectOption } from '@/components/ui/EnhancedSelect'
import { Modal } from '@/components/ui/Modal'
import { ChatMarkdown } from '@/components/features/chat/ChatMarkdown'
import { AutoProjectWorkflowCard } from '@/components/features/chat/AutoProjectWorkflowCard'
import { useAuth } from '@/lib/hooks/useAuth'
import { chatService, imageService, modelService, projectsService, videoService } from '@/lib/api/services'
import type { AiModel } from '@/lib/api/types/models'
import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'
import type { ApiTask } from '@/lib/api/types/task'
import type {
  ChatAutoProjectAgentMetadata,
  ChatAutoProjectWorkflow,
  ChatConversation,
  ChatMessage,
  ChatProjectPromptSuggestion,
  ChatTaskRef,
} from '@/lib/api/types/chat'
import type { ProjectStoryboardStatus, ProjectSummary } from '@/lib/api/types/projects'
import { cn } from '@/lib/utils/cn'
import { type AspectRatioOption } from '@/components/features/create/config/aspectRatioOptions'
import {
  AUTO_AGENT_OPTION_VALUE,
  getChatAgentImageAspectRatioOptions,
  getChatAgentImageResolutionOptions,
  getChatAgentReferenceLimits,
  getChatAgentVideoDurationOptions,
  getChatAgentVideoRatioOptions,
  getChatAgentVideoResolutionOptions,
  isWanxR2vChatAgentVideoModel,
  supportsChatAutoImageModel,
  supportsChatAutoVideoModel,
  supportsChatAgentModel,
} from '@/components/features/chat/agentModelUtils'

import styles from './ChatContent.module.css'

type AgentReferenceKind = 'image' | 'video' | 'audio'

type AgentReferenceItem = {
  id: string
  kind: AgentReferenceKind
  url: string
  name: string
}

const PLACEHOLDER_CONVERSATION_TITLES = new Set([
  'New Chat',
  'AI Chat',
  'AI 聊天对话',
  'Creative Workflow',
  '创作工作流',
])

function isPlaceholderConversationTitle(value?: string | null) {
  if (typeof value !== 'string') return true
  const normalized = value.trim()
  if (!normalized) return true
  return PLACEHOLDER_CONVERSATION_TITLES.has(normalized)
}

function formatDate(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const language = locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  return date.toLocaleString(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderChatModelIcon(icon: string | null | undefined, label: string, className: string) {
  if (icon && (icon.startsWith('data:image') || icon.startsWith('http'))) {
    return <img src={icon} alt="" className={cn(styles.modelIcon, className)} aria-hidden="true" />
  }

  if (icon) {
    return (
      <span className={cn(styles.modelIcon, className, styles.modelIconText)} aria-hidden="true">
        {icon}
      </span>
    )
  }

  const fallbackLabel = label.trim().slice(0, 1) || 'A'
  return (
    <span className={cn(styles.modelIcon, className, styles.modelIconFallback)} aria-hidden="true">
      {fallbackLabel}
    </span>
  )
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string) || '')
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string) || '')
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

async function loadImageFromBlob(blob: Blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    image.src = url
  })
}

async function imageFileToDataUrl(file: File) {
  const maxEdge = 1400
  const jpegQuality = 0.82

  try {
    const source = await loadImageFromBlob(file)
    const isHtmlImage = source instanceof HTMLImageElement
    const width = isHtmlImage ? source.naturalWidth : source.width
    const height = isHtmlImage ? source.naturalHeight : source.height

    if (!width || !height) {
      if ('close' in source) source.close()
      return await fileToDataUrl(file)
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      if ('close' in source) source.close()
      return await fileToDataUrl(file)
    }

    const drawable: CanvasImageSource = source
    ctx.drawImage(drawable, 0, 0, targetWidth, targetHeight)
    if (!isHtmlImage && 'close' in source) source.close()

    const preferPng = file.type === 'image/png'
    const outputType = preferPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((value) => resolve(value), outputType, preferPng ? undefined : jpegQuality)
    )

    if (!blob) return await fileToDataUrl(file)
    return await blobToDataUrl(blob)
  } catch {
    return await fileToDataUrl(file)
  }
}

async function writeClipboardText(text: string) {
  if (!text.trim()) return false

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback to execCommand
  }

  try {
    if (typeof document === 'undefined') return false
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.setAttribute('readonly', 'true')
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textArea)
    return copied
  } catch {
    return false
  }
}

function sortConversations(items: ChatConversation[]) {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

function getAspectRatioPreviewSize(option: Pick<AspectRatioOption, 'value' | 'label' | 'width' | 'height'>) {
  let parsedWidth = option.width
  let parsedHeight = option.height

  if (!parsedWidth || !parsedHeight) {
    const source = `${option.value || option.label}`.replace('×', 'x')
    const matched = source.match(/(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)/i)
    if (matched) {
      parsedWidth = Number(matched[1])
      parsedHeight = Number(matched[2])
    }
  }

  const rawWidth = Math.max(1, parsedWidth ?? 1)
  const rawHeight = Math.max(1, parsedHeight ?? 1)
  const maxWidth = 28
  const maxHeight = 18
  const scale = Math.min(maxWidth / rawWidth, maxHeight / rawHeight)

  return {
    width: `${Math.round(rawWidth * scale)}px`,
    height: `${Math.round(rawHeight * scale)}px`,
  }
}

function normalizeTaskRef(taskRef: unknown): ChatTaskRef | null {
  if (!taskRef || typeof taskRef !== 'object') return null

  const source = taskRef as Record<string, unknown>
  const kind = source.kind === 'image' || source.kind === 'video' ? source.kind : null
  const taskId = typeof source.taskId === 'string' ? source.taskId : ''
  if (!kind || !taskId) return null

  const status =
    source.status === 'pending' ||
    source.status === 'processing' ||
    source.status === 'completed' ||
    source.status === 'failed'
      ? source.status
      : undefined

  return {
    kind,
    taskId,
    taskNo: typeof source.taskNo === 'string' ? source.taskNo : undefined,
    status,
    shotId: typeof source.shotId === 'string' ? source.shotId : undefined,
    finalStoryboard: source.finalStoryboard === true ? true : undefined,
    modelId: typeof source.modelId === 'string' ? source.modelId : undefined,
    provider: typeof source.provider === 'string' ? source.provider : undefined,
    prompt: typeof source.prompt === 'string' ? source.prompt : undefined,
    thumbnailUrl:
      typeof source.thumbnailUrl === 'string' ? source.thumbnailUrl : source.thumbnailUrl === null ? null : undefined,
    resultUrl:
      typeof source.resultUrl === 'string' ? source.resultUrl : source.resultUrl === null ? null : undefined,
    errorMessage:
      typeof source.errorMessage === 'string' ? source.errorMessage : source.errorMessage === null ? null : undefined,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : undefined,
    completedAt:
      typeof source.completedAt === 'string' ? source.completedAt : source.completedAt === null ? null : undefined,
    canCancel: typeof source.canCancel === 'boolean' ? source.canCancel : undefined,
    cancelSupported: typeof source.cancelSupported === 'boolean' ? source.cancelSupported : undefined,
  }
}

function normalizeMediaAgentMetadata(message: ChatMessage & { imageAgent?: unknown }): ChatMessage['mediaAgent'] {
  const mediaAgent = (message.mediaAgent ?? message.imageAgent) as ChatMessage['mediaAgent'] | null | undefined
  if (!mediaAgent || typeof mediaAgent !== 'object') return null

  const status = mediaAgent.status === 'ready' ? 'ready' : mediaAgent.status === 'clarify' ? 'clarify' : null
  const modelId = typeof mediaAgent.modelId === 'string' ? mediaAgent.modelId : ''
  const modelName = typeof mediaAgent.modelName === 'string' ? mediaAgent.modelName : ''
  if (!status || !modelId || !modelName) return null

  return {
    status,
    intent: mediaAgent.intent === 'edit' ? 'edit' : 'generate',
    optimizedPrompt:
      typeof mediaAgent.optimizedPrompt === 'string' ? mediaAgent.optimizedPrompt : null,
    negativePrompt:
      typeof mediaAgent.negativePrompt === 'string' ? mediaAgent.negativePrompt : null,
    suggestedReplies: Array.isArray(mediaAgent.suggestedReplies)
      ? mediaAgent.suggestedReplies.filter((item): item is string => typeof item === 'string').slice(0, 4)
      : [],
    sourceUserMessageId:
      typeof mediaAgent.sourceUserMessageId === 'string' ? mediaAgent.sourceUserMessageId : '',
    modelId,
    modelName,
    modelType: mediaAgent.modelType === 'video' ? 'video' : 'image',
    preferredAspectRatio:
      typeof mediaAgent.preferredAspectRatio === 'string' ? mediaAgent.preferredAspectRatio : null,
    preferredResolution:
      typeof mediaAgent.preferredResolution === 'string' ? mediaAgent.preferredResolution : null,
    preferredDuration:
      typeof mediaAgent.preferredDuration === 'string' ? mediaAgent.preferredDuration : null,
    referenceVideos: Array.isArray(mediaAgent.referenceVideos)
      ? mediaAgent.referenceVideos.filter((item): item is string => typeof item === 'string').slice(0, 10)
      : [],
    referenceAudios: Array.isArray(mediaAgent.referenceAudios)
      ? mediaAgent.referenceAudios.filter((item): item is string => typeof item === 'string').slice(0, 10)
      : [],
    referenceImageCount:
      typeof mediaAgent.referenceImageCount === 'number' && Number.isFinite(mediaAgent.referenceImageCount)
        ? Math.max(0, Math.trunc(mediaAgent.referenceImageCount))
        : 0,
    referenceVideoCount:
      typeof mediaAgent.referenceVideoCount === 'number' && Number.isFinite(mediaAgent.referenceVideoCount)
        ? Math.max(0, Math.trunc(mediaAgent.referenceVideoCount))
        : 0,
    referenceAudioCount:
      typeof mediaAgent.referenceAudioCount === 'number' && Number.isFinite(mediaAgent.referenceAudioCount)
        ? Math.max(0, Math.trunc(mediaAgent.referenceAudioCount))
        : 0,
    autoCreated: mediaAgent.autoCreated === true,
  }
}

function normalizeAutoProjectStage(value: unknown): ChatAutoProjectAgentMetadata['stage'] {
  return value === 'project_plan_review' ||
    value === 'outline_review' ||
    value === 'character_review' ||
    value === 'project_setup_confirmation' ||
    value === 'shot_review'
    ? value
    : null
}

function normalizeAutoProjectText(value: unknown, maxLength = 2000) {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

function normalizeAutoProjectStringList(value: unknown, max = 12) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
      .slice(0, max)
  )]
}

function normalizeAutoProjectWorkflow(raw: unknown): ChatAutoProjectWorkflow | null {
  if (!raw || typeof raw !== 'object') return null

  const source = raw as Record<string, unknown>
  const stage = normalizeAutoProjectStage(source.stage)
  if (!stage) return null

  const outline = Array.isArray(source.outline)
    ? source.outline
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const id = normalizeAutoProjectText(row.id, 60) || `outline-${index + 1}`
          const title = normalizeAutoProjectText(row.title, 120) || `${index + 1}`
          const summary = normalizeAutoProjectText(row.summary, 400)
          if (!title && !summary) return null
          return { id, title, summary: summary || title }
        })
        .filter((item): item is ChatAutoProjectWorkflow['outline'][number] => Boolean(item))
        .slice(0, 8)
    : []

  const characters = Array.isArray(source.characters)
    ? source.characters
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const id = normalizeAutoProjectText(row.id, 60) || `character-${index + 1}`
          const name = normalizeAutoProjectText(row.name, 80) || `Character ${index + 1}`
          const role = normalizeAutoProjectText(row.role, 120)
          const description = normalizeAutoProjectText(row.description, 360)
          const visualPrompt = normalizeAutoProjectText(row.visualPrompt, 1200)
          if (!name && !description && !visualPrompt) return null
          return { id, name, role, description, visualPrompt }
        })
        .filter((item): item is ChatAutoProjectWorkflow['characters'][number] => Boolean(item))
        .slice(0, 8)
    : []

  const imagePlans = Array.isArray(source.imagePlans)
    ? source.imagePlans
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const id = normalizeAutoProjectText(row.id, 60) || `image-plan-${index + 1}`
          const title = normalizeAutoProjectText(row.title, 120) || `Image ${index + 1}`
          const prompt = normalizeAutoProjectText(row.prompt, 2200)
          if (!prompt) return null
          return {
            id,
            title,
            prompt,
            negativePrompt: normalizeAutoProjectText(row.negativePrompt, 1200) || null,
            referenceCharacterIds: normalizeAutoProjectStringList(row.referenceCharacterIds, 8),
            referenceAssetIds: normalizeAutoProjectStringList(row.referenceAssetIds, 12),
            preferredAspectRatio: normalizeAutoProjectText(row.preferredAspectRatio, 40) || null,
            preferredResolution: normalizeAutoProjectText(row.preferredResolution, 40) || null,
          }
        })
        .filter((item): item is ChatAutoProjectWorkflow['imagePlans'][number] => Boolean(item))
        .slice(0, 6)
    : []

  const shots = Array.isArray(source.shots)
    ? source.shots
        .map((item, index) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          const id = normalizeAutoProjectText(row.id, 60) || `shot-${index + 1}`
          const title = normalizeAutoProjectText(row.title, 120) || `Shot ${index + 1}`
          const summary = normalizeAutoProjectText(row.summary, 360)
          const script = normalizeAutoProjectText(row.script, 800)
          const prompt = normalizeAutoProjectText(row.prompt, 2200)
          const duration = normalizeAutoProjectText(row.duration, 40) || '5'
          if (!prompt) return null
          return {
            id,
            title,
            summary,
            script,
            prompt,
            duration,
            referenceCharacterIds: normalizeAutoProjectStringList(row.referenceCharacterIds, 8),
            referenceAssetIds: normalizeAutoProjectStringList(row.referenceAssetIds, 12),
            preferredAspectRatio: normalizeAutoProjectText(row.preferredAspectRatio, 40) || null,
            preferredResolution: normalizeAutoProjectText(row.preferredResolution, 40) || null,
            generationDecision:
              row.generationDecision === 'skip' || row.decision === 'skip' ? 'skip' : 'generate',
            decisionReason:
              normalizeAutoProjectText(row.decisionReason ?? row.generationReason ?? row.reason, 400) || null,
          }
        })
        .filter((item): item is ChatAutoProjectWorkflow['shots'][number] => Boolean(item))
        .slice(0, 12)
    : []

  const shotIdSet = new Set(shots.map((item) => item.id))

  return {
    stage,
    progressLabel: normalizeAutoProjectText(source.progressLabel, 160) || null,
    outlineTitle: normalizeAutoProjectText(source.outlineTitle, 160) || null,
    outline,
    characters,
    imagePlans,
    shots,
    generationMode:
      source.generationMode === 'all' || source.generationMode === 'step'
        ? 'step'
        : null,
    generatedShotIds: normalizeAutoProjectStringList(source.generatedShotIds, 24).filter((id) => shotIdSet.has(id)),
    skippedShotIds: normalizeAutoProjectStringList(source.skippedShotIds, 24).filter((id) => shotIdSet.has(id)),
    proposedProjectName: normalizeAutoProjectText(source.proposedProjectName ?? source.projectName, 160) || null,
    proposedProjectDescription:
      normalizeAutoProjectText(source.proposedProjectDescription ?? source.projectDescription, 2000) || null,
    recommendedNextStage: normalizeAutoProjectStage(source.recommendedNextStage) ?? null,
  }
}

function normalizeAutoProjectAgentMetadata(message: ChatMessage): ChatMessage['autoProjectAgent'] {
  const raw = message.autoProjectAgent as ChatMessage['autoProjectAgent'] | null | undefined
  if (!raw || typeof raw !== 'object') return null

  const projectId = typeof raw.projectId === 'string' && raw.projectId.trim() ? raw.projectId : null
  const projectName = typeof raw.projectName === 'string' && raw.projectName.trim() ? raw.projectName : null
  const imageModelId = typeof raw.imageModelId === 'string' ? raw.imageModelId : ''
  const videoModelId = typeof raw.videoModelId === 'string' ? raw.videoModelId : ''

  if (!imageModelId || !videoModelId) return null

  const workflow = normalizeAutoProjectWorkflow(raw.workflow)
  const stage = normalizeAutoProjectStage(raw.stage) ?? workflow?.stage ?? null

  return {
    projectId,
    projectName,
    imageModelId,
    videoModelId,
    preferredResolution:
      typeof raw.preferredResolution === 'string' && raw.preferredResolution.trim()
        ? raw.preferredResolution.trim()
        : null,
    autoCreatedProject: raw.autoCreatedProject === true,
    createdTaskCount:
      typeof raw.createdTaskCount === 'number' && Number.isFinite(raw.createdTaskCount)
        ? Math.max(0, Math.trunc(raw.createdTaskCount))
        : 0,
    stage,
    workflow,
  }
}

const PROJECT_PROMPT_ACTION_TAG = 'project_prompt_action'
const PROJECT_MASTER_IMAGE_PROMPT_TITLE = '项目插图统一风格总提示词'
const PROJECT_PROMPT_ACTION_PATTERN = new RegExp(
  `<${PROJECT_PROMPT_ACTION_TAG}>([\\s\\S]*?)<\\/${PROJECT_PROMPT_ACTION_TAG}>`,
  'g'
)

function extractProjectPromptSuggestions(content: string): {
  content: string
  suggestions: ChatProjectPromptSuggestion[]
} {
  const source = typeof content === 'string' ? content : ''
  const matches = [...source.matchAll(PROJECT_PROMPT_ACTION_PATTERN)]

  if (matches.length === 0) {
    return {
      content: source,
      suggestions: [],
    }
  }

  const suggestions: ChatProjectPromptSuggestion[] = []

  for (const match of matches) {
    const rawPayload = typeof match[1] === 'string' ? match[1].trim() : ''
    if (!rawPayload) continue

    try {
      const parsed = JSON.parse(rawPayload) as {
        action?: string
        type?: string
        title?: string
        prompt?: string
      }

      const action =
        parsed.action === 'upsert_project_master_image_prompt'
          ? 'upsert_project_master_image_prompt'
          : parsed.action === 'create_project_prompt'
            ? 'create_project_prompt'
            : null

      if (!action) {
        continue
      }

      const type =
        action === 'upsert_project_master_image_prompt'
          ? 'image'
          : parsed.type === 'video'
            ? 'video'
            : parsed.type === 'image'
              ? 'image'
              : null
      const title =
        action === 'upsert_project_master_image_prompt'
          ? PROJECT_MASTER_IMAGE_PROMPT_TITLE
          : typeof parsed.title === 'string'
            ? parsed.title.trim().slice(0, 160)
            : ''
      const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim().slice(0, 20000) : ''

      if (!type || !title || !prompt) {
        continue
      }

      suggestions.push({
        action,
        type,
        title,
        prompt,
      })
    } catch {
      continue
    }
  }

  if (suggestions.length === 0) {
    return {
      content: source,
      suggestions: [],
    }
  }

  const cleanedContent = source.replace(PROJECT_PROMPT_ACTION_PATTERN, '').replace(/\n{3,}/g, '\n\n').trim()

  return {
    content: cleanedContent,
    suggestions,
  }
}

function normalizeMessageShape(message: ChatMessage): ChatMessage {
  const projectPromptSuggestionResult =
    message.role === 'assistant'
      ? extractProjectPromptSuggestions(message.content)
      : { content: message.content, suggestions: [] as ChatProjectPromptSuggestion[] }
  const citations = Array.isArray(message.citations)
    ? message.citations
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          return {
            ...item,
            type: 'file' as const,
            snippet: typeof item.snippet === 'string' ? item.snippet : '',
          }
        })
        .filter((item): item is ChatMessage['citations'][number] => Boolean(item && item.snippet))
    : []
  const taskRefs = Array.isArray(message.taskRefs)
    ? message.taskRefs
        .map((item) => normalizeTaskRef(item))
        .filter((item): item is ChatTaskRef => Boolean(item))
    : []

  return {
    ...message,
    content: projectPromptSuggestionResult.content,
    images: Array.isArray(message.images) ? message.images : [],
    files: Array.isArray(message.files) ? message.files : [],
    citations,
    taskRefs,
    reasoning: message.reasoning ?? null,
    mediaAgent: normalizeMediaAgentMetadata(message as ChatMessage & { imageAgent?: unknown }),
    autoProjectAgent: normalizeAutoProjectAgentMetadata(message),
    projectPromptSuggestion: projectPromptSuggestionResult.suggestions[0] ?? null,
    projectPromptSuggestions: projectPromptSuggestionResult.suggestions,
  }
}

function resolveConversationComposerModeLock(messages: ChatMessage[]): 'chat' | 'image' | 'auto' | null {
  if (messages.length === 0) return null

  for (const message of messages) {
    if (message.autoProjectAgent) return 'auto'
    if (message.mediaAgent) return 'image'
  }

  return 'chat'
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function normalizeExtension(name: string, ext: string) {
  if (ext) return ext.toLowerCase().replace(/^\./, '')
  const parts = name.split('.')
  if (parts.length <= 1) return ''
  return parts[parts.length - 1].toLowerCase()
}

function FileIcon({ extension }: { extension: string }) {
  if (['xlsx', 'xls', 'csv'].includes(extension)) {
    return <FileSpreadsheet className="h-4 w-4" />
  }
  if (['zip', 'rar', '7z'].includes(extension)) {
    return <FileArchive className="h-4 w-4" />
  }
  if (['pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md', 'json', 'html', 'xml'].includes(extension)) {
    return <FileText className="h-4 w-4" />
  }
  return <File className="h-4 w-4" />
}

type RouteSyncMode = 'push' | 'replace' | 'none'

function normalizeConversationRouteId(value?: string | null) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

function buildChatPath(locale: string, conversationId?: string | null) {
  if (!conversationId) return `/${locale}/chat`
  return `/${locale}/chat/${encodeURIComponent(conversationId)}`
}

function parseConversationIdFromPath(pathname: string | null, locale: string) {
  if (!pathname) return null

  const basePath = `/${locale}/chat`
  if (pathname === basePath || pathname === `${basePath}/`) return null
  if (!pathname.startsWith(`${basePath}/`)) return null

  const rest = pathname.slice(basePath.length + 1)
  if (!rest) return null
  const firstSegment = rest.split('/')[0]?.trim()
  if (!firstSegment) return null

  try {
    return decodeURIComponent(firstSegment)
  } catch {
    return firstSegment
  }
}

type StoryboardStatusByShotId = Record<string, ProjectStoryboardStatus>
type StoryboardStatusByProjectId = Record<string, StoryboardStatusByShotId>

type AssistantTimelineStepState = 'completed' | 'active' | 'pending' | 'failed'

function renderAssistantStepIndicator(state: AssistantTimelineStepState) {
  if (state === 'completed') {
    return <Check className={styles.assistantStepIcon} />
  }
  if (state === 'failed') {
    return <X className={styles.assistantStepIcon} />
  }
  if (state === 'active') {
    return <span className={styles.assistantStepSpinner} aria-hidden="true" />
  }

  return <span className={styles.assistantStepDot} aria-hidden="true" />
}

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return message.includes('abort')
}

function isNetworkLikeError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('stream interrupted before completion') ||
    message.includes('networkrequestfailed') ||
      message.includes('the network connection was lost')
  )
}

function areStoryboardStatusMapsEqual(
  left: StoryboardStatusByShotId | undefined,
  right: StoryboardStatusByShotId
) {
  if (!left) return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  for (const key of rightKeys) {
    const leftItem = left[key]
    const rightItem = right[key]
    if (!leftItem) return false
    if (
      leftItem.shotId !== rightItem.shotId ||
      leftItem.title !== rightItem.title ||
      leftItem.taskId !== rightItem.taskId ||
      leftItem.taskNo !== rightItem.taskNo ||
      leftItem.status !== rightItem.status ||
      leftItem.completed !== rightItem.completed ||
      leftItem.resultUrl !== rightItem.resultUrl ||
      leftItem.thumbnailUrl !== rightItem.thumbnailUrl ||
      leftItem.errorMessage !== rightItem.errorMessage
    ) {
      return false
    }
  }

  return true
}

interface ChatContentProps {
  initialConversationId?: string | null
}

export function ChatContent({ initialConversationId }: ChatContentProps) {
  const t = useTranslations('chat')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, isReady } = useAuth()
  const isZh = locale.toLowerCase().startsWith('zh')

  const [models, setModels] = useState<AiModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [agentModels, setAgentModels] = useState<ModelWithCapabilities[]>([])
  const [autoImageModels, setAutoImageModels] = useState<ModelWithCapabilities[]>([])
  const [autoVideoModels, setAutoVideoModels] = useState<ModelWithCapabilities[]>([])
  const [hasResolvedAgentModels, setHasResolvedAgentModels] = useState(false)
  const [selectedAgentModelId, setSelectedAgentModelId] = useState('')
  const [selectedAutoImageModelId, setSelectedAutoImageModelId] = useState('')
  const [selectedAutoVideoModelId, setSelectedAutoVideoModelId] = useState('')
  const [selectedAutoVideoResolution, setSelectedAutoVideoResolution] = useState(AUTO_AGENT_OPTION_VALUE)
  const [composerMode, setComposerMode] = useState<'image' | 'chat' | 'auto'>('image')
  const [isAgentSettingsModalOpen, setIsAgentSettingsModalOpen] = useState(false)
  const [isAgentUploadMenuOpen, setIsAgentUploadMenuOpen] = useState(false)
  const [selectedAgentAspectRatio, setSelectedAgentAspectRatio] = useState(AUTO_AGENT_OPTION_VALUE)
  const [selectedAgentResolution, setSelectedAgentResolution] = useState(AUTO_AGENT_OPTION_VALUE)
  const [selectedAgentDuration, setSelectedAgentDuration] = useState(AUTO_AGENT_OPTION_VALUE)

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedAutoProjectId, setSelectedAutoProjectId] = useState('')
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationKeyword, setConversationKeyword] = useState('')
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null)
  const [renamingTitle, setRenamingTitle] = useState('')

  const [composer, setComposer] = useState('')
  const [agentReferences, setAgentReferences] = useState<AgentReferenceItem[]>([])
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<ChatMessage['files']>([])
  const [isComposerComposing, setIsComposerComposing] = useState(false)
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false)
  const [isProjectContextModalOpen, setIsProjectContextModalOpen] = useState(false)
  const [selectedProjectContextId, setSelectedProjectContextId] = useState('')
  const [storyboardStatusByProjectId, setStoryboardStatusByProjectId] = useState<StoryboardStatusByProjectId>({})

  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isSwitchingModel, setIsSwitchingModel] = useState(false)
  const [isUpdatingProjectContext, setIsUpdatingProjectContext] = useState(false)
  const [isUploadingAgentReferences, setIsUploadingAgentReferences] = useState(false)
  const [mergingStoryboardProjectId, setMergingStoryboardProjectId] = useState<string | null>(null)
  const [cancellingTaskKeys, setCancellingTaskKeys] = useState<string[]>([])
  const [confirmingMediaMessageId, setConfirmingMediaMessageId] = useState<string | null>(null)
  const [creatingProjectPromptMessageId, setCreatingProjectPromptMessageId] = useState<string | null>(null)
  const [savedProjectPromptMessageIds, setSavedProjectPromptMessageIds] = useState<Record<string, boolean>>({})
  const [deletingTurnMessageId, setDeletingTurnMessageId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null)
  const [collapsedReasoningByMessageId, setCollapsedReasoningByMessageId] = useState<Record<string, boolean>>({})
  const [collapsedCitationsByMessageId, setCollapsedCitationsByMessageId] = useState<Record<string, boolean>>({})
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [streamStatusText, setStreamStatusText] = useState('')

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const attachmentMenuRef = useRef<HTMLDivElement>(null)
  const agentUploadMenuRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const streamAbortRef = useRef<AbortController | null>(null)
  const stopRequestedRef = useRef(false)
  const initializedConversationRef = useRef(false)
  const streamBufferRef = useRef('')
  const streamFlushTimerRef = useRef<number | null>(null)
  const streamReasoningBufferRef = useRef('')
  const streamReasoningFlushTimerRef = useRef<number | null>(null)
  const bootstrappedTaskIdsRef = useRef(new Set<string>())
  const refreshingTaskIdsRef = useRef(new Set<string>())
  const refreshingStoryboardProjectIdsRef = useRef(new Set<string>())
  const storyboardPollingTimerRef = useRef<number | null>(null)
  const storyboardPollingAttemptRef = useRef(0)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const initialRouteConversationId = useMemo(
    () =>
      normalizeConversationRouteId(
        parseConversationIdFromPath(pathname, locale) ?? initialConversationId
      ),
    [initialConversationId, locale, pathname]
  )

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  )
  const activeProjectContext = activeConversation?.projectContext ?? null

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId]
  )
  const selectedAgentModel = useMemo(
    () => agentModels.find((model) => model.id === selectedAgentModelId) ?? null,
    [agentModels, selectedAgentModelId]
  )
  const selectedAutoImageModel = useMemo(
    () => autoImageModels.find((model) => model.id === selectedAutoImageModelId) ?? null,
    [autoImageModels, selectedAutoImageModelId]
  )
  const selectedAutoVideoModel = useMemo(
    () => autoVideoModels.find((model) => model.id === selectedAutoVideoModelId) ?? null,
    [autoVideoModels, selectedAutoVideoModelId]
  )
  const lockedComposerMode = useMemo(
    () => resolveConversationComposerModeLock(messages),
    [messages]
  )
  const latestAutoProjectAssistant = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === 'assistant' && message.autoProjectAgent) ?? null,
    [messages]
  )
  const isImageMode = composerMode === 'image'
  const isAutoMode = composerMode === 'auto'
  const isChatMode = composerMode === 'chat'
  const agentModeLabel = isZh ? 'Agent 模式' : 'Agent Mode'
  const autoModeLabel = isZh ? '全自动模式' : 'Auto Mode'
  const chatModeLabel = isZh ? '聊天模式' : 'Chat Mode'
  const agentModelOptions = useMemo<EnhancedSelectOption[]>(
    () =>
      agentModels.map((model) => ({
        value: model.id,
        label: model.name,
        icon: model.icon,
        iconType: model.type === 'video' ? 'video' : 'image',
      })),
    [agentModels]
  )
  const autoImageModelOptions = useMemo<EnhancedSelectOption[]>(
    () =>
      autoImageModels.map((model) => ({
        value: model.id,
        label: model.name,
        icon: model.icon,
        iconType: 'image',
      })),
    [autoImageModels]
  )
  const autoVideoModelOptions = useMemo<EnhancedSelectOption[]>(
    () =>
      autoVideoModels.map((model) => ({
        value: model.id,
        label: model.name,
        icon: model.icon,
        iconType: 'video',
      })),
    [autoVideoModels]
  )
  const autoAgentOption = useMemo<AspectRatioOption>(() => ({
    value: AUTO_AGENT_OPTION_VALUE,
    label: isZh ? '自动' : 'Auto',
    description: '',
    icon: Square,
    width: 1,
    height: 1,
  }), [isZh])
  const autoVideoResolutionOptions = useMemo<AspectRatioOption[]>(() => {
    const baseOptions = getChatAgentVideoResolutionOptions(selectedAutoVideoModel) ?? []
    return [autoAgentOption, ...baseOptions]
  }, [autoAgentOption, selectedAutoVideoModel])
  const selectedAutoVideoResolutionOption = useMemo(
    () =>
      autoVideoResolutionOptions.find((option) => option.value === selectedAutoVideoResolution) ??
      autoVideoResolutionOptions[0] ??
      null,
    [autoVideoResolutionOptions, selectedAutoVideoResolution]
  )
  const autoVideoResolutionSelectOptions = useMemo<EnhancedSelectOption[]>(
    () =>
      autoVideoResolutionOptions.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [autoVideoResolutionOptions]
  )
  const lockedAutoVideoResolution = latestAutoProjectAssistant?.autoProjectAgent?.preferredResolution ?? null
  const isAutoVideoResolutionLocked = Boolean(activeConversationId && lockedAutoVideoResolution)
  const autoProjectOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      {
        value: '',
        label: isZh ? '自动创建项目' : 'Auto Create Project',
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [isZh, projects]
  )
  const projectContextOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      {
        value: '',
        label: t('importProjectNone'),
      },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        meta: isZh
          ? `${project.assetCount} 个素材 · ${project.promptCount} 条提示词`
          : `${project.assetCount} assets · ${project.promptCount} prompts`,
      })),
    ],
    [isZh, projects, t]
  )
  const agentAspectRatioOptions = useMemo<AspectRatioOption[]>(() => {
    if (!selectedAgentModel) {
      return [autoAgentOption]
    }

    const baseOptions =
      selectedAgentModel.type === 'video'
        ? getChatAgentVideoRatioOptions(selectedAgentModel) ?? []
        : getChatAgentImageAspectRatioOptions(selectedAgentModel)

    return [autoAgentOption, ...baseOptions]
  }, [autoAgentOption, selectedAgentModel])
  const agentResolutionOptions = useMemo<AspectRatioOption[]>(() => {
    if (!selectedAgentModel) return [autoAgentOption]

    const baseOptions =
      selectedAgentModel.type === 'video'
        ? getChatAgentVideoResolutionOptions(selectedAgentModel) ?? []
        : getChatAgentImageResolutionOptions(selectedAgentModel) ?? []

    return [autoAgentOption, ...baseOptions]
  }, [autoAgentOption, selectedAgentModel])
  const agentDurationOptions = useMemo<AspectRatioOption[]>(() => {
    if (!selectedAgentModel || selectedAgentModel.type !== 'video') return [autoAgentOption]

    const baseOptions = getChatAgentVideoDurationOptions(selectedAgentModel, {
      hasReferenceVideo: agentReferences.some((item) => item.kind === 'video'),
    }) ?? []
    return [autoAgentOption, ...baseOptions]
  }, [agentReferences, autoAgentOption, selectedAgentModel])
  const selectedAgentAspectRatioOption = useMemo(
    () =>
      agentAspectRatioOptions.find((option) => option.value === selectedAgentAspectRatio) ??
      agentAspectRatioOptions[0] ??
      null,
    [agentAspectRatioOptions, selectedAgentAspectRatio]
  )
  const selectedAgentResolutionOption = useMemo(
    () =>
      agentResolutionOptions.find((option) => option.value === selectedAgentResolution) ??
      agentResolutionOptions[0] ??
      null,
    [agentResolutionOptions, selectedAgentResolution]
  )
  const selectedAgentDurationOption = useMemo(
    () =>
      agentDurationOptions.find((option) => option.value === selectedAgentDuration) ??
      agentDurationOptions[0] ??
      null,
    [agentDurationOptions, selectedAgentDuration]
  )
  const agentSettingsTriggerLabel = useMemo(() => {
    const selectedManualOption = [
      selectedAgentAspectRatioOption,
      selectedAgentResolutionOption,
      selectedAgentDurationOption,
    ].find((option) => option && option.value !== AUTO_AGENT_OPTION_VALUE)

    return selectedManualOption?.label || (isZh ? '自动' : 'Auto')
  }, [
    isZh,
    selectedAgentAspectRatioOption,
    selectedAgentDurationOption,
    selectedAgentResolutionOption,
  ])
  const selectedAgentSupportsContextEditing = useMemo(
    () => supportsChatAgentModel(selectedAgentModel),
    [selectedAgentModel]
  )
  const selectedAgentReferenceLimits = useMemo(
    () => getChatAgentReferenceLimits(selectedAgentModel),
    [selectedAgentModel]
  )
  const agentReferenceImages = useMemo(
    () => agentReferences.filter((item) => item.kind === 'image'),
    [agentReferences]
  )
  const agentReferenceVideos = useMemo(
    () => agentReferences.filter((item) => item.kind === 'video'),
    [agentReferences]
  )
  const agentReferenceAudios = useMemo(
    () => agentReferences.filter((item) => item.kind === 'audio'),
    [agentReferences]
  )
  const selectedAgentIsWanxR2v = useMemo(
    () => isWanxR2vChatAgentVideoModel(selectedAgentModel),
    [selectedAgentModel]
  )
  const selectedAgentUploadProvider = useMemo(
    () => {
      const provider = String(selectedAgentModel?.provider ?? '').trim().toLowerCase()
      if (selectedAgentModel?.type === 'video' && (provider.includes('wanx') || provider.includes('wanxiang'))) {
        return 'wanx' as const
      }
      return undefined
    },
    [selectedAgentModel]
  )
  const agentVisualReferenceCount = useMemo(
    () => agentReferenceImages.length + agentReferenceVideos.length,
    [agentReferenceImages.length, agentReferenceVideos.length]
  )
  const selectedAgentVisualReferenceLimit = selectedAgentReferenceLimits.sharedVisualLimit
  const selectedAgentEffectiveAudioLimit = useMemo(
    () =>
      selectedAgentIsWanxR2v
        ? Math.min(selectedAgentReferenceLimits.audios, agentVisualReferenceCount)
        : selectedAgentReferenceLimits.audios,
    [
      agentVisualReferenceCount,
      selectedAgentIsWanxR2v,
      selectedAgentReferenceLimits.audios,
    ]
  )
  const selectedAgentEffectiveImageLimit = useMemo(
    () =>
      selectedAgentVisualReferenceLimit === null
        ? selectedAgentReferenceLimits.images
        : Math.max(
            agentReferenceImages.length,
            Math.min(
              selectedAgentReferenceLimits.images,
              Math.max(0, selectedAgentVisualReferenceLimit - agentReferenceVideos.length)
            )
          ),
    [
      agentReferenceImages.length,
      agentReferenceVideos.length,
      selectedAgentReferenceLimits.images,
      selectedAgentVisualReferenceLimit,
    ]
  )
  const selectedAgentEffectiveVideoLimit = useMemo(
    () =>
      selectedAgentVisualReferenceLimit === null
        ? selectedAgentReferenceLimits.videos
        : Math.max(
            agentReferenceVideos.length,
            Math.min(
              selectedAgentReferenceLimits.videos,
              Math.max(0, selectedAgentVisualReferenceLimit - agentReferenceImages.length)
            )
          ),
    [
      agentReferenceImages.length,
      agentReferenceVideos.length,
      selectedAgentReferenceLimits.videos,
      selectedAgentVisualReferenceLimit,
    ]
  )
  const selectedAgentDisplayAudioLimit = useMemo(
    () => Math.max(agentReferenceAudios.length, selectedAgentEffectiveAudioLimit),
    [agentReferenceAudios.length, selectedAgentEffectiveAudioLimit]
  )
  const agentReferenceImageUrls = useMemo(
    () => agentReferenceImages.map((item) => item.url),
    [agentReferenceImages]
  )
  const agentReferenceVideoUrls = useMemo(
    () => agentReferenceVideos.map((item) => item.url),
    [agentReferenceVideos]
  )
  const agentReferenceAudioUrls = useMemo(
    () => agentReferenceAudios.map((item) => item.url),
    [agentReferenceAudios]
  )
  const storyboardTaskRefs = useMemo(
    () =>
      messages.flatMap((message) =>
        message.taskRefs.filter(
          (taskRef) => taskRef.kind === 'video' && taskRef.finalStoryboard === true && Boolean(taskRef.shotId)
        )
      ),
    [messages]
  )
  const storyboardStatusTargets = useMemo(() => {
    const shotIdsByProjectId = new Map<string, Set<string>>()

    for (const message of messages) {
      const projectId = message.autoProjectAgent?.projectId?.trim() || ''
      const workflow = message.autoProjectAgent?.workflow
      if (!projectId || !workflow) continue

      const skippedShotIdSet = new Set(workflow.skippedShotIds)
      const generatedShotIds = workflow.generatedShotIds.filter((shotId) => !skippedShotIdSet.has(shotId))
      if (generatedShotIds.length === 0) continue

      const shotIds = shotIdsByProjectId.get(projectId) ?? new Set<string>()
      for (const shotId of generatedShotIds) {
        const normalizedShotId = shotId.trim()
        if (normalizedShotId) shotIds.add(normalizedShotId)
      }
      if (shotIds.size > 0) {
        shotIdsByProjectId.set(projectId, shotIds)
      }
    }

    return [...shotIdsByProjectId.entries()]
      .map(([projectId, shotIds]) => ({
        projectId,
        shotIds: [...shotIds],
      }))
      .filter((item) => item.shotIds.length > 0)
  }, [messages])
  const pendingStoryboardStatusTargets = useMemo(
    () =>
      storyboardStatusTargets
        .map((target) => {
          const currentStatuses = storyboardStatusByProjectId[target.projectId] ?? {}
          const pendingShotIds = target.shotIds.filter((shotId) => {
            const status = currentStatuses[shotId]
            if (!status) return true
            return status.status !== 'completed' && status.status !== 'failed'
          })

          return {
            projectId: target.projectId,
            shotIds: pendingShotIds,
          }
        })
        .filter((target) => target.shotIds.length > 0),
    [storyboardStatusByProjectId, storyboardStatusTargets]
  )
  const selectedAgentModelType = selectedAgentModel?.type === 'video' ? 'video' : 'image'

  const supportsImageUpload = activeConversation
    ? Boolean(activeConversation.model.supportsImageInput)
    : Boolean(selectedModel?.supportsImageInput)

  const supportsFileUpload = true
  const maxFilesPerMessage = 5
  const maxFileSizeMb = 20
  const allowedFileExtensions = useMemo(
    () =>
      'txt,md,csv,json,html,pdf,docx,pptx,xlsx'
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
        .filter((item) => item.length > 0),
    []
  )

  const groupedConversations = useMemo(() => {
    const pinned = conversations.filter((item) => item.isPinned)
    const regular = conversations.filter((item) => !item.isPinned)

    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000
    const recent: ChatConversation[] = []
    const previous: ChatConversation[] = []

    for (const item of regular) {
      const time = new Date(item.updatedAt || item.lastMessageAt).getTime()
      if (Number.isFinite(time) && time < cutoff) {
        previous.push(item)
      } else {
        recent.push(item)
      }
    }

    return { pinned, recent, previous }
  }, [conversations])

  const historyLabels = useMemo(
    () =>
      locale === 'zh-CN'
        ? { pinned: '置顶', recent: '最近', previous: '更早' }
        : { pinned: 'PINNED', recent: 'RECENT', previous: 'PREVIOUS' },
    [locale]
  )

  const canSend =
    (isImageMode
      ? (composer.trim().length > 0 || agentReferences.length > 0) &&
        Boolean(selectedAgentModelId) &&
        Boolean(activeConversationId || selectedModelId)
      : isAutoMode
        ? composer.trim().length > 0 &&
          Boolean(selectedAutoImageModelId) &&
          Boolean(selectedAutoVideoModelId) &&
          Boolean(activeConversationId || selectedModelId)
      : composer.trim().length > 0 || pendingImages.length > 0 || pendingFiles.length > 0) &&
    !isSending &&
    !isSwitchingModel &&
    !isUploadingFiles &&
    !isUploadingAgentReferences
  const showStopButton = isSending && !isImageMode
  const canOpenAttachmentMenu =
    isChatMode && !isSending && !isSwitchingModel && !isUploadingFiles && !isUploadingAgentReferences
  const canToggleImageMode =
    !isSending &&
    !isSwitchingModel &&
    !isUploadingFiles &&
    !isUploadingAgentReferences &&
    agentModels.length > 0 &&
    (!lockedComposerMode || lockedComposerMode === 'image')
  const canToggleAutoMode =
    !isSending &&
    !isSwitchingModel &&
    !isUploadingFiles &&
    !isUploadingAgentReferences &&
    autoImageModelOptions.length > 0 &&
    autoVideoModelOptions.length > 0 &&
    (!lockedComposerMode || lockedComposerMode === 'auto')
  const canSwitchComposerMode =
    !isSending &&
    !isSwitchingModel &&
    !isUploadingFiles &&
    !isUploadingAgentReferences &&
    !lockedComposerMode
  const canOpenAgentUploadMenu =
    isImageMode &&
    !isSending &&
    !isSwitchingModel &&
    !isUploadingFiles &&
    !isUploadingAgentReferences &&
    selectedAgentSupportsContextEditing &&
    (selectedAgentReferenceLimits.images > 0 ||
      selectedAgentReferenceLimits.videos > 0 ||
      selectedAgentReferenceLimits.audios > 0)
  const displayConversationTitle = useCallback(
    (value?: string | null) => {
      if (isPlaceholderConversationTitle(value)) return t('title')
      return value?.trim() || t('title')
    },
    [t]
  )
  const emptyStateCards = [
    {
      mode: 'image' as const,
      title: agentModeLabel,
      description: isZh ? '参考图 / 直接生成' : 'References / instant generation',
      icon: Sparkles,
      active: isImageMode,
      enabled: canToggleImageMode || isImageMode,
    },
    {
      mode: 'auto' as const,
      title: autoModeLabel,
      description: isZh ? '角色 / 分镜 / 视频串联' : 'Characters / storyboard / stitched video',
      icon: Brain,
      active: isAutoMode,
      enabled: canToggleAutoMode || isAutoMode,
    },
    {
      mode: 'chat' as const,
      title: chatModeLabel,
      description: isZh ? '脚本 / 提示词 / 问答' : 'Scripts / prompts / Q&A',
      icon: MessageSquare,
      active: isChatMode,
      enabled: canSwitchComposerMode || isChatMode,
    },
  ]
  const agentUploadTileInfo = useMemo(() => {
    const totalSlots =
      selectedAgentReferenceLimits.images +
      selectedAgentReferenceLimits.videos +
      selectedAgentReferenceLimits.audios

    if (
      selectedAgentReferenceLimits.images > 0 &&
      selectedAgentReferenceLimits.videos === 0 &&
      selectedAgentReferenceLimits.audios === 0
    ) {
      return {
        kind: 'image' as const,
        label: t('menuUploadImage'),
        meta: `${agentReferenceImages.length}/${selectedAgentEffectiveImageLimit}`,
      }
    }

    if (
      selectedAgentReferenceLimits.videos > 0 &&
      selectedAgentReferenceLimits.images === 0 &&
      selectedAgentReferenceLimits.audios === 0
    ) {
      return {
        kind: 'video' as const,
        label: isZh ? '上传视频' : 'Upload Video',
        meta: `${agentReferenceVideos.length}/${selectedAgentEffectiveVideoLimit}`,
      }
    }

    if (
      selectedAgentReferenceLimits.audios > 0 &&
      selectedAgentReferenceLimits.images === 0 &&
      selectedAgentReferenceLimits.videos === 0
    ) {
      return {
        kind: 'audio' as const,
        label: isZh ? '上传音频' : 'Upload Audio',
        meta: `${agentReferenceAudios.length}/${selectedAgentDisplayAudioLimit}`,
      }
    }

    return {
      kind: 'multi' as const,
      label: isZh ? '添加素材' : 'Add Media',
      meta:
        selectedAgentVisualReferenceLimit !== null
          ? `${agentVisualReferenceCount}/${selectedAgentVisualReferenceLimit}`
          : totalSlots > 0
            ? `${agentReferences.length}/${totalSlots}`
            : '',
    }
  }, [
    agentReferenceAudios.length,
    agentReferenceImages.length,
    agentReferenceVideos.length,
    agentVisualReferenceCount,
    agentReferences.length,
    isZh,
    selectedAgentDisplayAudioLimit,
    selectedAgentEffectiveImageLimit,
    selectedAgentEffectiveVideoLimit,
    selectedAgentReferenceLimits.audios,
    selectedAgentReferenceLimits.images,
    selectedAgentReferenceLimits.videos,
    selectedAgentVisualReferenceLimit,
    t,
  ])

  const composerModeLabel = isImageMode
    ? agentModeLabel
    : isAutoMode
      ? autoModeLabel
      : chatModeLabel
  const workspaceTitle = isZh ? '准备开拍什么？' : 'What are we creating next?'
  const workspaceSubtitle = isZh ? '选择一种工作方式，直接开始。' : 'Choose a workflow and start.'
  const historyActionLabel = isZh ? '历史会话' : 'History'
  const newConversationLabel = isZh ? '新建会话' : 'New Chat'
  const headerModelPlaceholder = t('modelPlaceholder')
  const headerModelList = models
  const selectedHeaderModel = selectedModel
  const headerModelDescription = selectedHeaderModel?.description?.trim() || ''

  const handleToggleHistoryPanel = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  const handleSelectComposerMode = useCallback((nextMode: 'chat' | 'image' | 'auto') => {
    if (lockedComposerMode && nextMode !== lockedComposerMode) {
      toast.error(
        lockedComposerMode === 'auto'
          ? (isZh ? '当前对话已锁定为全自动模式' : 'This conversation is locked to Auto Mode')
          : lockedComposerMode === 'image'
            ? (isZh ? '当前对话已锁定为 Agent 模式' : 'This conversation is locked to Agent Mode')
            : (isZh ? '当前对话已锁定为聊天模式' : 'This conversation is locked to Chat Mode')
      )
      return
    }

    if (nextMode === 'image') {
      if (!canToggleImageMode) {
        toast.error(t('imageMode.modelUnavailable'))
        return
      }
    } else if (nextMode === 'auto') {
      if (!canToggleAutoMode) {
        toast.error(isZh ? '暂无可用自动模式模型' : 'Auto mode is unavailable')
        return
      }
    } else if (!canSwitchComposerMode) {
      return
    }

    setComposerMode(nextMode)
  }, [canSwitchComposerMode, canToggleAutoMode, canToggleImageMode, isZh, lockedComposerMode, t])

  const handlePickEmptyStateMode = useCallback((nextMode: 'chat' | 'image' | 'auto') => {
    handleSelectComposerMode(nextMode)

    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const composerNode = composerRef.current
        if (!composerNode) return

        composerNode.focus()
        const end = composerNode.value.length
        composerNode.setSelectionRange(end, end)
      })
    })
  }, [handleSelectComposerMode])

  const syncRouteToConversation = useCallback(
    (conversationId: string | null, mode: RouteSyncMode = 'replace') => {
      if (mode === 'none' || typeof window === 'undefined') return

      const nextPath = buildChatPath(locale, conversationId)
      if (window.location.pathname === nextPath) return

      if (mode === 'push') {
        window.history.pushState(null, '', nextPath)
      } else {
        window.history.replaceState(null, '', nextPath)
      }
    },
    [locale]
  )

  const appendOrReplaceConversation = useCallback((conversation: ChatConversation) => {
    setConversations((prev) => {
      const next = [conversation, ...prev.filter((item) => item.id !== conversation.id)]
      return sortConversations(next)
    })
  }, [])

  const clearStreamFlushTimer = useCallback(() => {
    if (streamFlushTimerRef.current === null) return
    window.clearTimeout(streamFlushTimerRef.current)
    streamFlushTimerRef.current = null
  }, [])

  const clearStreamReasoningFlushTimer = useCallback(() => {
    if (streamReasoningFlushTimerRef.current === null) return
    window.clearTimeout(streamReasoningFlushTimerRef.current)
    streamReasoningFlushTimerRef.current = null
  }, [])

  const appendInterruptionNoteToMessage = useCallback(
    (assistantMessageId: string, note: string) => {
      const pendingContent = streamBufferRef.current
      const pendingReasoning = streamReasoningBufferRef.current
      const current = messagesRef.current.find((msg) => msg.id === assistantMessageId)
      const mergedContent = `${current?.content ?? ''}${pendingContent}`
      const mergedReasoning = `${current?.reasoning ?? ''}${pendingReasoning}`
      const hasPartial = Boolean(mergedContent.trim()) || Boolean(mergedReasoning.trim())

      clearStreamFlushTimer()
      clearStreamReasoningFlushTimer()
      streamBufferRef.current = ''
      streamReasoningBufferRef.current = ''

      if (!hasPartial) return false

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantMessageId) return msg

          const nextReasoning = `${msg.reasoning ?? ''}${pendingReasoning}`
          const nextBody = `${msg.content}${pendingContent}`
          const nextContent = nextBody.includes(note)
            ? nextBody
            : nextBody.trim()
              ? `${nextBody}\n\n${note}`
              : note

          return {
            ...msg,
            content: nextContent,
            reasoning: nextReasoning || null,
          }
        })
      )
      return true
    },
    [clearStreamFlushTimer, clearStreamReasoningFlushTimer]
  )

  const flushStreamBuffer = useCallback((assistantMessageId: string) => {
    const delta = streamBufferRef.current
    if (!delta) return

    streamBufferRef.current = ''
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, content: `${msg.content}${delta}` }
          : msg
      )
    )
  }, [])

  const flushStreamReasoningBuffer = useCallback((assistantMessageId: string) => {
    const delta = streamReasoningBufferRef.current
    if (!delta) return

    streamReasoningBufferRef.current = ''
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? { ...msg, reasoning: `${msg.reasoning ?? ''}${delta}` }
          : msg
      )
    )
  }, [])

  const resizeComposer = useCallback(() => {
    const el = composerRef.current
    if (!el) return

    const useTallComposer = isImageMode || isAutoMode
    const minHeight = useTallComposer ? 132 : 24
    const maxHeight = useTallComposer ? 260 : 150

    el.style.height = `${minHeight}px`
    const target = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
    el.style.height = `${target}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [isAutoMode, isImageMode])

  const loadModels = useCallback(async () => {
    const [chatResult, imageResult, videoResult] = await Promise.allSettled([
      modelService.getModels({ type: 'chat' }),
      modelService.getModelsWithCapabilities({ type: 'image' }),
      modelService.getModelsWithCapabilities({ type: 'video' }),
    ])

    if (chatResult.status === 'fulfilled') {
      const available = chatResult.value.filter((model) => model.isActive && model.type === 'chat')
      setModels(available)
      setSelectedModelId((current) => {
        if (current && available.some((item) => item.id === current)) return current
        return available[0]?.id ?? ''
      })
    } else {
      toast.error(t('errors.loadModels'))
    }

    const hasImageModels = imageResult.status === 'fulfilled'
    const hasVideoModels = videoResult.status === 'fulfilled'

    if (hasImageModels || hasVideoModels) {
      const allImageAvailable =
        hasImageModels
          ? imageResult.value.filter((model) => model.isActive && model.type === 'image')
          : []
      const imageAvailable = allImageAvailable.filter((model) => supportsChatAutoImageModel(model))
      const allVideoAvailable =
        hasVideoModels
          ? videoResult.value.filter((model) => model.isActive && model.type === 'video')
          : []
      const videoAvailable =
        hasVideoModels
          ? allVideoAvailable.filter((model) => supportsChatAutoVideoModel(model))
          : []
      setAutoImageModels(imageAvailable)
      setAutoVideoModels(videoAvailable)
      setSelectedAutoImageModelId((current) => {
        if (current && imageAvailable.some((item) => item.id === current)) return current
        return imageAvailable[0]?.id ?? ''
      })
      setSelectedAutoVideoModelId((current) => {
        if (current && videoAvailable.some((item) => item.id === current)) return current
        return videoAvailable[0]?.id ?? ''
      })
      const available = [...allImageAvailable, ...allVideoAvailable].filter((model) => supportsChatAgentModel(model))
      setAgentModels(available)
      setSelectedAgentModelId((current) => {
        if (current && available.some((item) => item.id === current)) return current
        const preferredImageModel = available.find((item) => item.type === 'image')
        return preferredImageModel?.id ?? available[0]?.id ?? ''
      })
    } else {
      setAutoImageModels([])
      setAutoVideoModels([])
      setSelectedAutoImageModelId('')
      setSelectedAutoVideoModelId('')
      toast.error(t('errors.loadImageModels'))
    }

    setHasResolvedAgentModels(true)
  }, [t])

  const loadProjects = useCallback(async () => {
    try {
      const data = await projectsService.getProjects()
      setProjects(data)
      setSelectedAutoProjectId((current) => {
        if (!current) return current
        return data.some((project) => project.id === current) ? current : ''
      })
    } catch {
      setProjects([])
    }
  }, [])

  const loadMessages = useCallback(async (
    conversationId: string,
    options?: {
      routeSyncMode?: RouteSyncMode
      suppressErrorToast?: boolean
    }
  ): Promise<boolean> => {
    setLoadingMessages(true)
    try {
      bootstrappedTaskIdsRef.current.clear()
      refreshingTaskIdsRef.current.clear()
      const response = await chatService.getMessages(conversationId)
      const normalizedMessages = response.messages.map((item) => normalizeMessageShape(item))
      const latestAutoAssistant = [...normalizedMessages]
        .reverse()
        .find((item) => item.role === 'assistant' && item.autoProjectAgent)

      setMessages(normalizedMessages)
      setCollapsedCitationsByMessageId({})
      setActiveConversationId(conversationId)
      setSelectedModelId(response.conversation.model.id)
      setSelectedProjectContextId(response.conversation.projectContext?.id ?? '')
      if (latestAutoAssistant?.autoProjectAgent) {
        setSelectedAutoProjectId(latestAutoAssistant.autoProjectAgent.projectId ?? '')
        setSelectedAutoImageModelId(latestAutoAssistant.autoProjectAgent.imageModelId)
        setSelectedAutoVideoModelId(latestAutoAssistant.autoProjectAgent.videoModelId)
        setSelectedAutoVideoResolution(latestAutoAssistant.autoProjectAgent.preferredResolution ?? AUTO_AGENT_OPTION_VALUE)
      } else {
        setSelectedAutoProjectId('')
      }
      setIsModelMenuOpen(false)
      setAgentReferences([])
      setPendingImages([])
      setPendingFiles([])
      setIsAgentUploadMenuOpen(false)
      setIsAgentSettingsModalOpen(false)
      setIsProjectContextModalOpen(false)
      setIsUploadingAgentReferences(false)
      setConfirmingMediaMessageId(null)
      setCreatingProjectPromptMessageId(null)
      setSavedProjectPromptMessageIds({})
      setIsAttachmentMenuOpen(false)
      syncRouteToConversation(conversationId, options?.routeSyncMode ?? 'none')
      return true
    } catch {
      if (!options?.suppressErrorToast) {
        toast.error(t('errors.loadMessages'))
      }
      return false
    } finally {
      setLoadingMessages(false)
    }
  }, [syncRouteToConversation, t])

  const loadConversations = useCallback(async (keyword?: string) => {
    setLoadingConversations(true)
    try {
      const response = await chatService.listConversations(keyword ? { q: keyword } : undefined)
      const sorted = sortConversations(response)
      setConversations(sorted)

      if (!initializedConversationRef.current) {
        initializedConversationRef.current = true

        if (sorted.length === 0) {
          if (initialRouteConversationId) {
            syncRouteToConversation(null, 'replace')
          }
          return
        }

        if (initialRouteConversationId) {
          const loadedFromRoute = await loadMessages(initialRouteConversationId, {
            routeSyncMode: 'none',
            suppressErrorToast: true,
          })

          if (loadedFromRoute) {
            return
          }
          syncRouteToConversation(null, 'replace')
        }
      }
    } catch {
      toast.error(t('errors.loadConversations'))
    } finally {
      setLoadingConversations(false)
    }
  }, [initialRouteConversationId, loadMessages, syncRouteToConversation, t])

  useEffect(() => {
    if (!isReady || !isAuthenticated) return
    loadModels()
  }, [isReady, isAuthenticated, loadModels])

  useEffect(() => {
    if (!lockedComposerMode || composerMode === lockedComposerMode) return
    setComposerMode(lockedComposerMode)
  }, [composerMode, lockedComposerMode])

  useEffect(() => {
    if (lockedAutoVideoResolution && selectedAutoVideoResolution === lockedAutoVideoResolution) {
      return
    }
    if (autoVideoResolutionSelectOptions.some((option) => option.value === selectedAutoVideoResolution)) {
      return
    }
    setSelectedAutoVideoResolution(AUTO_AGENT_OPTION_VALUE)
  }, [autoVideoResolutionSelectOptions, lockedAutoVideoResolution, selectedAutoVideoResolution])

  useEffect(() => {
    if (!lockedAutoVideoResolution) return
    if (selectedAutoVideoResolution === lockedAutoVideoResolution) return
    setSelectedAutoVideoResolution(lockedAutoVideoResolution)
  }, [lockedAutoVideoResolution, selectedAutoVideoResolution])

  useEffect(() => {
    if (!isReady || !isAuthenticated) return
    void loadProjects()
  }, [isAuthenticated, isReady, loadProjects])

  useEffect(() => {
    if (isProjectContextModalOpen) return
    setSelectedProjectContextId(activeProjectContext?.id ?? '')
  }, [activeProjectContext?.id, isProjectContextModalOpen])

  useEffect(() => {
    setIsAttachmentMenuOpen(false)
    setIsAgentUploadMenuOpen(false)
    setIsAgentSettingsModalOpen(false)
    setIsModelMenuOpen(false)
    setIsUploadingAgentReferences(false)
    setConfirmingMediaMessageId(null)

    if (!isChatMode) {
      setPendingImages([])
      setPendingFiles([])
    }

    if (!isImageMode) {
      setAgentReferences([])
    }
  }, [isChatMode, isImageMode])

  useEffect(() => {
    if (!hasResolvedAgentModels) return
    if (agentModels.length > 0) return
    if (isImageMode) setComposerMode('chat')
  }, [agentModels.length, hasResolvedAgentModels, isImageMode])

  useEffect(() => {
    if (!hasResolvedAgentModels) return
    if (autoImageModels.length > 0 && autoVideoModels.length > 0) return
    if (isAutoMode) {
      setComposerMode(agentModels.length > 0 ? 'image' : 'chat')
    }
  }, [
    agentModels.length,
    autoImageModels.length,
    autoVideoModels.length,
    hasResolvedAgentModels,
    isAutoMode,
  ])

  useEffect(() => {
    if (!hasResolvedAgentModels) return
    if (agentModels.length === 0) return
    if (initialRouteConversationId !== null) return
    setComposerMode((current) => (current === 'chat' ? 'image' : current))
  }, [agentModels.length, hasResolvedAgentModels, initialRouteConversationId])

  useEffect(() => {
    setIsAgentSettingsModalOpen(false)
    setIsAgentUploadMenuOpen(false)
    setAgentReferences([])
    setSelectedAgentAspectRatio(AUTO_AGENT_OPTION_VALUE)
    setSelectedAgentResolution(AUTO_AGENT_OPTION_VALUE)
    setSelectedAgentDuration(AUTO_AGENT_OPTION_VALUE)
  }, [selectedAgentModelId])

  useEffect(() => {
    if (!agentAspectRatioOptions.some((option) => option.value === selectedAgentAspectRatio)) {
      setSelectedAgentAspectRatio(AUTO_AGENT_OPTION_VALUE)
    }
    if (!agentResolutionOptions.some((option) => option.value === selectedAgentResolution)) {
      setSelectedAgentResolution(AUTO_AGENT_OPTION_VALUE)
    }
    if (!agentDurationOptions.some((option) => option.value === selectedAgentDuration)) {
      setSelectedAgentDuration(AUTO_AGENT_OPTION_VALUE)
    }
  }, [
    agentAspectRatioOptions,
    agentDurationOptions,
    agentResolutionOptions,
    selectedAgentAspectRatio,
    selectedAgentDuration,
    selectedAgentResolution,
  ])

  useEffect(() => {
    if (!isImageMode) return
    if (selectedAgentSupportsContextEditing) return
    if (agentReferences.length === 0) return
    setAgentReferences([])
  }, [agentReferences.length, isImageMode, selectedAgentSupportsContextEditing])

  useEffect(() => {
    if (!isReady || !isAuthenticated || !initialRouteConversationId) return
    if (!initializedConversationRef.current) return
    if (isSending) return
    if (activeConversationId === initialRouteConversationId) return

    void (async () => {
      const loaded = await loadMessages(initialRouteConversationId, {
        routeSyncMode: 'none',
        suppressErrorToast: true,
      })
      if (!loaded) {
        syncRouteToConversation(activeConversationId, 'replace')
      }
    })()
  }, [
    activeConversationId,
    initialRouteConversationId,
    isAuthenticated,
    isSending,
    isReady,
    loadMessages,
    syncRouteToConversation,
  ])

  useEffect(() => {
    if (!isReady || !isAuthenticated) return
    if (isSending) return
    if (initialRouteConversationId) return
    if (activeConversationId === null && messages.length === 0) return

    setActiveConversationId(null)
    setMessages([])
    setCollapsedReasoningByMessageId({})
    setCollapsedCitationsByMessageId({})
    setPendingImages([])
    setPendingFiles([])
    setCreatingProjectPromptMessageId(null)
    setSavedProjectPromptMessageIds({})
    setIsAttachmentMenuOpen(false)
    setStreamingAssistantId(null)
    setStreamStatusText('')
  }, [
    activeConversationId,
    initialRouteConversationId,
    isAuthenticated,
    isReady,
    isSending,
    messages.length,
  ])

  useEffect(() => {
    if (!isReady || !isAuthenticated) return

    const timer = window.setTimeout(() => {
      void loadConversations(conversationKeyword.trim() || undefined)
    }, 240)

    return () => window.clearTimeout(timer)
  }, [isReady, isAuthenticated, loadConversations, conversationKeyword])

  useEffect(() => {
    if (!messageListRef.current) return
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [messages, isSending])

  useEffect(() => {
    resizeComposer()
  }, [composer, resizeComposer])

  useEffect(() => {
    if (!isModelMenuOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
        setIsModelMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isModelMenuOpen])

  useEffect(() => {
    if (!isAttachmentMenuOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target as Node)) {
        setIsAttachmentMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isAttachmentMenuOpen])

  useEffect(() => {
    if (!isAgentUploadMenuOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      if (agentUploadMenuRef.current && !agentUploadMenuRef.current.contains(event.target as Node)) {
        setIsAgentUploadMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isAgentUploadMenuOpen])

  useEffect(() => {
    if (!sidebarOpen) return

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
      }
    }

    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [sidebarOpen])

  useEffect(() => {
    return () => {
      clearStreamFlushTimer()
      clearStreamReasoningFlushTimer()
      streamAbortRef.current?.abort()
      streamAbortRef.current = null
      stopRequestedRef.current = false
      streamBufferRef.current = ''
      streamReasoningBufferRef.current = ''
      setStreamStatusText('')
    }
  }, [clearStreamFlushTimer, clearStreamReasoningFlushTimer])

  const handleCreateNewChat = () => {
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    stopRequestedRef.current = false
    clearStreamFlushTimer()
    clearStreamReasoningFlushTimer()
    streamBufferRef.current = ''
    streamReasoningBufferRef.current = ''
    setStreamingAssistantId(null)
    setCollapsedReasoningByMessageId({})
    setCollapsedCitationsByMessageId({})
    setActiveConversationId(null)
    setMessages([])
    setComposer('')
    setAgentReferences([])
    setPendingImages([])
    setPendingFiles([])
    setComposerMode((current) => {
      if (current === 'auto') {
        return autoImageModels.length > 0 && autoVideoModels.length > 0
          ? 'auto'
          : agentModels.length > 0
            ? 'image'
            : 'chat'
      }

      if (current === 'image') {
        return agentModels.length > 0 ? 'image' : 'chat'
      }

      return 'chat'
    })
    setIsAgentSettingsModalOpen(false)
    setIsAgentUploadMenuOpen(false)
    setIsProjectContextModalOpen(false)
    setSelectedProjectContextId('')
    setSelectedAgentAspectRatio(AUTO_AGENT_OPTION_VALUE)
    setSelectedAgentResolution(AUTO_AGENT_OPTION_VALUE)
    setSelectedAgentDuration(AUTO_AGENT_OPTION_VALUE)
    setIsUpdatingProjectContext(false)
    setIsUploadingAgentReferences(false)
    setConfirmingMediaMessageId(null)
    setCreatingProjectPromptMessageId(null)
    setSavedProjectPromptMessageIds({})
    setIsAttachmentMenuOpen(false)
    setIsUploadingFiles(false)
    setIsUploadingAgentReferences(false)
    setIsComposerComposing(false)
    setStreamStatusText('')
    setIsSending(false)
    setConfirmingMediaMessageId(null)
    setRenamingConversationId(null)
    setRenamingTitle('')
    setSidebarOpen(false)
    setIsModelMenuOpen(false)
    setSelectedAutoProjectId('')
    syncRouteToConversation(null, 'push')
  }

  const mergeTaskIntoMessages = useCallback((task: ApiTask) => {
    const cancelledStoryboardShotIds = new Set<string>()

    setMessages((prev) => {
      let changed = false
      const next = prev.map((message) => {
        if (!message.taskRefs.length) return message

        let taskRefChanged = false
        const messageCancelledStoryboardShotIds: string[] = []
        const taskRefs = message.taskRefs.map((taskRef) => {
          if (taskRef.kind !== task.type || taskRef.taskId !== task.id) return taskRef
          taskRefChanged = true
          changed = true
          if (
            task.type === 'video' &&
            task.status === 'failed' &&
            task.errorMessage === 'CANCELED' &&
            taskRef.finalStoryboard === true &&
            taskRef.shotId
          ) {
            messageCancelledStoryboardShotIds.push(taskRef.shotId)
            cancelledStoryboardShotIds.add(taskRef.shotId)
          }
          return {
            ...taskRef,
            taskNo: task.taskNo || taskRef.taskNo,
            status: task.status,
            modelId: task.modelId || taskRef.modelId,
            provider: task.provider || taskRef.provider,
            prompt: task.prompt || taskRef.prompt,
            thumbnailUrl: task.thumbnailUrl ?? taskRef.thumbnailUrl ?? null,
            resultUrl: task.resultUrl ?? taskRef.resultUrl ?? null,
            errorMessage: task.errorMessage ?? taskRef.errorMessage ?? null,
            createdAt: task.createdAt || taskRef.createdAt,
            completedAt: task.completedAt ?? taskRef.completedAt ?? null,
            canCancel: task.canCancel ?? taskRef.canCancel,
            cancelSupported: task.cancelSupported ?? taskRef.cancelSupported,
          }
        })

        if (!taskRefChanged) return message

        if (
          messageCancelledStoryboardShotIds.length > 0 &&
          message.autoProjectAgent?.workflow
        ) {
          const nextGeneratedShotIds = message.autoProjectAgent.workflow.generatedShotIds.filter(
            (shotId) => !messageCancelledStoryboardShotIds.includes(shotId)
          )

          return {
            ...message,
            taskRefs,
            autoProjectAgent: {
              ...message.autoProjectAgent,
              workflow: {
                ...message.autoProjectAgent.workflow,
                generatedShotIds: nextGeneratedShotIds,
              },
            },
          }
        }

        return { ...message, taskRefs }
      })

      return changed ? next : prev
    })

    const projectKey = typeof task.projectId === 'string' ? task.projectId.trim() : ''

    if (projectKey && cancelledStoryboardShotIds.size > 0) {
      setStoryboardStatusByProjectId((prev) => {
        const currentProjectStatuses = prev[projectKey]
        if (!currentProjectStatuses) return prev

        let changed = false
        const nextProjectStatuses = { ...currentProjectStatuses }
        for (const shotId of cancelledStoryboardShotIds) {
          if (!(shotId in nextProjectStatuses)) continue
          delete nextProjectStatuses[shotId]
          changed = true
        }

        if (!changed) return prev

        return {
          ...prev,
          [projectKey]: nextProjectStatuses,
        }
      })
    }
  }, [])

  const refreshTask = useCallback(async (kind: ChatTaskRef['kind'], taskId: string) => {
    const refreshKey = `${kind}:${taskId}`
    if (!taskId || refreshingTaskIdsRef.current.has(refreshKey)) return

    refreshingTaskIdsRef.current.add(refreshKey)
    try {
      const task = kind === 'video' ? await videoService.getTask(taskId) : await imageService.getTask(taskId)
      mergeTaskIntoMessages(task)
    } catch (error) {
      console.error(`[ChatContent] Failed to refresh ${kind} task:`, taskId, error)
    } finally {
      refreshingTaskIdsRef.current.delete(refreshKey)
    }
  }, [mergeTaskIntoMessages])

  const handleCancelVideoTask = useCallback(async (taskRef: ChatTaskRef) => {
    if (taskRef.kind !== 'video') return

    const taskKey = `${taskRef.kind}:${taskRef.taskId}`
    setCancellingTaskKeys((prev) => (prev.includes(taskKey) ? prev : [...prev, taskKey]))
    try {
      const updatedTask = await videoService.cancelTask(taskRef.taskId)
      mergeTaskIntoMessages(updatedTask)
    } catch (error) {
      console.error('[ChatContent] Failed to cancel video task:', taskRef.taskId, error)
      const message = error instanceof Error ? error.message : String(error)
      toast.error(message || t('errors.cancelTask'))
    } finally {
      setCancellingTaskKeys((prev) => prev.filter((item) => item !== taskKey))
    }
  }, [mergeTaskIntoMessages, t])

  const applyStoryboardStatuses = useCallback((projectId: string, items: ProjectStoryboardStatus[]) => {
    const partialStatuses = Object.fromEntries(
      items.map((item) => [item.shotId, item])
    ) as StoryboardStatusByShotId

    setStoryboardStatusByProjectId((prev) => {
      const previousStatuses = prev[projectId] ?? {}
      const nextStatuses = {
        ...previousStatuses,
        ...partialStatuses,
      }

      if (areStoryboardStatusMapsEqual(prev[projectId], nextStatuses)) {
        return prev
      }

      return {
        ...prev,
        [projectId]: nextStatuses,
      }
    })
  }, [])

  const refreshStoryboardStatus = useCallback(async (projectId: string, shotIds: string[]) => {
    const normalizedProjectId = projectId.trim()
    const normalizedShotIds = [...new Set(
      shotIds
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )]

    if (!normalizedProjectId || normalizedShotIds.length === 0) return null
    if (refreshingStoryboardProjectIdsRef.current.has(normalizedProjectId)) return null

    refreshingStoryboardProjectIdsRef.current.add(normalizedProjectId)
    try {
      const statuses = await projectsService.getProjectStoryboardStatus(normalizedProjectId, normalizedShotIds)
      applyStoryboardStatuses(normalizedProjectId, statuses)
      return statuses
    } catch (error) {
      console.error('[ChatContent] Failed to refresh storyboard status:', normalizedProjectId, error)
      return null
    } finally {
      refreshingStoryboardProjectIdsRef.current.delete(normalizedProjectId)
    }
  }, [applyStoryboardStatuses])

  useEffect(() => {
    const pendingIds = new Set<string>()
    for (const message of messages) {
      for (const taskRef of message.taskRefs) {
        const needsRefresh =
          taskRef.status === 'pending' ||
          taskRef.status === 'processing' ||
          (!taskRef.resultUrl && !taskRef.errorMessage)
        if (needsRefresh) {
          pendingIds.add(`${taskRef.kind}:${taskRef.taskId}`)
        }
      }
    }

    pendingIds.forEach((taskKey) => {
      if (bootstrappedTaskIdsRef.current.has(taskKey)) return
      bootstrappedTaskIdsRef.current.add(taskKey)
      const [kind, taskId] = taskKey.split(':')
      if (kind !== 'image' && kind !== 'video') return
      void refreshTask(kind, taskId)
    })
  }, [messages, refreshTask])

  useEffect(() => {
    if (storyboardPollingTimerRef.current) {
      window.clearTimeout(storyboardPollingTimerRef.current)
      storyboardPollingTimerRef.current = null
    }

    if (!isAuthenticated || storyboardStatusTargets.length === 0) {
      setStoryboardStatusByProjectId((prev) => (Object.keys(prev).length === 0 ? prev : {}))
      storyboardPollingAttemptRef.current = 0
      return
    }

    if (pendingStoryboardStatusTargets.length === 0) {
      storyboardPollingAttemptRef.current = 0
      return
    }

    // Immediate fetch for the first tick
    for (const target of pendingStoryboardStatusTargets) {
      void refreshStoryboardStatus(target.projectId, target.shotIds)
    }

    // Exponential-backoff fallback polling as a safety net for missed SSE events.
    // Base interval 8 s, doubles each tick, caps at 30 s.
    const STORYBOARD_POLL_BASE_MS = 8_000
    const STORYBOARD_POLL_MAX_MS = 30_000

    const scheduleNext = () => {
      const attempt = storyboardPollingAttemptRef.current
      const delay = Math.min(
        STORYBOARD_POLL_BASE_MS * Math.pow(1.5, Math.min(attempt, 8)),
        STORYBOARD_POLL_MAX_MS,
      )
      storyboardPollingAttemptRef.current = attempt + 1

      storyboardPollingTimerRef.current = window.setTimeout(async () => {
        storyboardPollingTimerRef.current = null

        // Re-read latest pending targets from the memo (captured at schedule time is stale)
        // Instead, just refresh the same targets – the useEffect will re-fire if the
        // pendingStoryboardStatusTargets list changes after the fetch resolves.
        for (const target of pendingStoryboardStatusTargets) {
          void refreshStoryboardStatus(target.projectId, target.shotIds)
        }

        // If still pending, schedule another round
        if (pendingStoryboardStatusTargets.length > 0) {
          scheduleNext()
        }
      }, delay)
    }

    scheduleNext()

    return () => {
      if (storyboardPollingTimerRef.current) {
        window.clearTimeout(storyboardPollingTimerRef.current)
        storyboardPollingTimerRef.current = null
      }
    }
  }, [isAuthenticated, pendingStoryboardStatusTargets, refreshStoryboardStatus, storyboardStatusTargets.length])

  const handleSelectModel = useCallback(async (nextModelId: string) => {
    if (!nextModelId || isSending || isSwitchingModel) return

    if (nextModelId === selectedModelId) {
      setIsModelMenuOpen(false)
      return
    }

    // 还没有会话时，仅切换当前待创建会话的模型。
    if (!activeConversationId) {
      setSelectedModelId(nextModelId)
      setIsModelMenuOpen(false)
      return
    }

    try {
      setIsSwitchingModel(true)
      const updated = await chatService.updateConversation(activeConversationId, {
        modelId: nextModelId,
      })
      appendOrReplaceConversation(updated)
      setSelectedModelId(updated.model.id)
      setIsModelMenuOpen(false)

      if (!updated.model.supportsImageInput && pendingImages.length > 0) {
        setPendingImages([])
        toast.error(t('errors.modelNoImageAfterSwitch'))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.updateConversation')
      toast.error(message || t('errors.updateConversation'))
    } finally {
      setIsSwitchingModel(false)
    }
  }, [
    activeConversationId,
    appendOrReplaceConversation,
    isSending,
    isSwitchingModel,
    pendingImages.length,
    selectedModelId,
    t,
  ])

  const handleSelectHeaderModel = useCallback(
    (modelId: string) => {
      if (isSending || isSwitchingModel) return
      void handleSelectModel(modelId)
    },
    [handleSelectModel, isSending, isSwitchingModel]
  )

  const ensureConversation = useCallback(async () => {
    if (activeConversationId) return activeConversationId

    if (!selectedModelId) {
      throw new Error(t('errors.selectModel'))
    }

    const created = await chatService.createConversation({ modelId: selectedModelId })
    appendOrReplaceConversation(created)
    setActiveConversationId(created.id)
    syncRouteToConversation(created.id, 'replace')
    return created.id
  }, [activeConversationId, appendOrReplaceConversation, selectedModelId, syncRouteToConversation, t])

  const handleOpenProjectContextModal = useCallback(() => {
    setSelectedProjectContextId(activeProjectContext?.id ?? '')
    setIsAttachmentMenuOpen(false)
    setIsProjectContextModalOpen(true)
  }, [activeProjectContext?.id])

  const handleApplyProjectContext = useCallback(async () => {
    const nextProjectId = selectedProjectContextId.trim()
    const currentProjectId = activeProjectContext?.id ?? ''

    if (!nextProjectId && !currentProjectId && !activeConversationId) {
      setIsProjectContextModalOpen(false)
      return
    }

    if (nextProjectId === currentProjectId) {
      setIsProjectContextModalOpen(false)
      return
    }

    try {
      setIsUpdatingProjectContext(true)
      const conversationId =
        activeConversationId ?? (nextProjectId ? await ensureConversation() : null)

      if (!conversationId) {
        setIsProjectContextModalOpen(false)
        return
      }

      const updated = nextProjectId
        ? await chatService.updateConversation(conversationId, {
            projectContextId: nextProjectId,
          })
        : await chatService.updateConversation(conversationId, {
            clearProjectContext: true,
          })

      appendOrReplaceConversation(updated)
      setActiveConversationId(updated.id)
      setSelectedProjectContextId(updated.projectContext?.id ?? '')
      setIsProjectContextModalOpen(false)
      toast.success(nextProjectId ? t('importProjectSuccess') : t('removeProjectSuccess'))
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.importProject')
      toast.error(message || t('errors.importProject'))
    } finally {
      setIsUpdatingProjectContext(false)
    }
  }, [
    activeConversationId,
    activeProjectContext?.id,
    appendOrReplaceConversation,
    ensureConversation,
    selectedProjectContextId,
    t,
  ])

  const handleRemoveProjectContext = useCallback(async () => {
    if (!activeConversationId || !activeProjectContext) return

    try {
      setIsUpdatingProjectContext(true)
      const updated = await chatService.updateConversation(activeConversationId, {
        clearProjectContext: true,
      })
      appendOrReplaceConversation(updated)
      setSelectedProjectContextId('')
      toast.success(t('removeProjectSuccess'))
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.removeProject')
      toast.error(message || t('errors.removeProject'))
    } finally {
      setIsUpdatingProjectContext(false)
    }
  }, [activeConversationId, activeProjectContext, appendOrReplaceConversation, t])

  const handleApplyProjectPromptSuggestion = useCallback(async (
    message: ChatMessage,
    suggestion: ChatProjectPromptSuggestion,
    suggestionIndex: number
  ) => {
    const suggestionKey = `${message.id}:${suggestionIndex}`

    if (!activeProjectContext) {
      toast.error(t('errors.projectRequiredForPrompt'))
      return
    }

    try {
      setCreatingProjectPromptMessageId(suggestionKey)
      const shouldUpdateMasterImagePrompt =
        suggestion.action === 'upsert_project_master_image_prompt' ||
        (suggestion.type === 'image' && suggestion.title.trim() === PROJECT_MASTER_IMAGE_PROMPT_TITLE)

      if (shouldUpdateMasterImagePrompt) {
        await projectsService.updateProject(activeProjectContext.id, {
          masterImagePrompt: suggestion.prompt,
        })
      } else {
        await projectsService.createProjectPrompt(activeProjectContext.id, {
          type: suggestion.type,
          title: suggestion.title,
          prompt: suggestion.prompt,
        })
      }
      setSavedProjectPromptMessageIds((prev) => ({
        ...prev,
        [suggestionKey]: true,
      }))
      toast.success(
        shouldUpdateMasterImagePrompt
          ? t('projectPromptSuggestionMasterUpdated')
          : t('projectPromptSuggestionAdded')
      )
      void loadProjects()
    } catch (error) {
      const messageText = error instanceof Error
        ? error.message
        : suggestion.action === 'upsert_project_master_image_prompt'
          ? t('errors.updateProjectMasterPrompt')
          : t('errors.createProjectPrompt')
      toast.error(
        messageText ||
          (suggestion.action === 'upsert_project_master_image_prompt'
            ? t('errors.updateProjectMasterPrompt')
            : t('errors.createProjectPrompt'))
      )
    } finally {
      setCreatingProjectPromptMessageId((current) => (current === suggestionKey ? null : current))
    }
  }, [activeProjectContext, loadProjects, t])

  const handleStopResponding = useCallback(() => {
    const stopNote = `> ${t('stoppedHint')}`
    const hasActiveStream = Boolean(streamAbortRef.current)

    stopRequestedRef.current = true
    streamAbortRef.current?.abort()
    streamAbortRef.current = null

    if (streamingAssistantId) {
      const appended = appendInterruptionNoteToMessage(streamingAssistantId, stopNote)
      if (!appended) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== streamingAssistantId) return msg
            if (msg.content.includes(stopNote)) return msg
            const nextContent = msg.content.trim() ? `${msg.content}\n\n${stopNote}` : stopNote
            return { ...msg, content: nextContent }
          })
        )
      }
    }

    setStreamingAssistantId(null)
    setStreamStatusText('')
    if (!hasActiveStream) {
      setIsSending(false)
    }
  }, [
    appendInterruptionNoteToMessage,
    streamingAssistantId,
    t,
  ])

  const handleSend = async (override?: {
    content?: string
    images?: string[]
    referenceVideos?: string[]
    referenceAudios?: string[]
    files?: ChatMessage['files']
    composerMode?: 'chat' | 'image' | 'auto'
    autoProjectId?: string
    autoImageModelId?: string
    autoVideoModelId?: string
    autoVideoResolution?: string
  }) => {
    const resolvedComposerMode = override?.composerMode ?? composerMode
    const useImageAgent = resolvedComposerMode === 'image'
    const useAutoMode = resolvedComposerMode === 'auto'
    const useChatMode = resolvedComposerMode === 'chat'
    const autoProjectId = override?.autoProjectId ?? selectedAutoProjectId
    const autoImageModelId = override?.autoImageModelId ?? selectedAutoImageModelId
    const autoVideoModelId = override?.autoVideoModelId ?? selectedAutoVideoModelId
    const autoVideoResolution =
      useAutoMode && lockedAutoVideoResolution
        ? lockedAutoVideoResolution
        : override?.autoVideoResolution ?? selectedAutoVideoResolution

    if (isSending) return

    const text = (override?.content ?? composer).trim()
    const images = useImageAgent
      ? [...(override?.images ?? agentReferenceImageUrls)]
      : useAutoMode
        ? []
        : [...(override?.images ?? pendingImages)]
    const videos = useImageAgent ? [...(override?.referenceVideos ?? agentReferenceVideoUrls)] : []
    const audios = useImageAgent ? [...(override?.referenceAudios ?? agentReferenceAudioUrls)] : []
    const files = useChatMode ? [...(override?.files ?? pendingFiles)] : []

    if (!text && images.length === 0 && videos.length === 0 && audios.length === 0 && files.length === 0) {
      toast.error(
        t(
          useImageAgent
            ? 'errors.emptyImagePrompt'
            : useAutoMode
              ? 'errors.emptyAutoPrompt'
              : 'errors.emptyMessage'
        )
      )
      return
    }

    if (useImageAgent && !selectedAgentModelId) {
      toast.error(t('errors.selectImageModel'))
      return
    }

    if (useAutoMode && !autoImageModelId) {
      toast.error(t('errors.selectAutoImageModel'))
      return
    }

    if (useAutoMode && !autoVideoModelId) {
      toast.error(t('errors.selectAutoVideoModel'))
      return
    }

    if (!activeConversationId && !selectedModelId) {
      toast.error(t('errors.selectModel'))
      return
    }

    const optimisticUserId = `temp-user-${Date.now()}`
    const optimisticAssistantId = `temp-assistant-${Date.now()}`
    let receivedStart = false

    try {
      setIsSending(true)
      setIsAttachmentMenuOpen(false)
      stopRequestedRef.current = false

      const conversationId = await ensureConversation()
      const abortController = new AbortController()
      streamAbortRef.current = abortController

      setMessages((prev) => [
        ...prev,
        {
          id: optimisticUserId,
          conversationId,
          role: 'user',
          content: text,
          images,
          files,
          citations: [],
          taskRefs: [],
          mediaAgent: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: optimisticAssistantId,
          conversationId,
          role: 'assistant',
          content: '',
          reasoning: '',
          images: [],
          files: [],
          citations: [],
          taskRefs: [],
          mediaAgent: null,
          autoProjectAgent: useAutoMode
            ? {
                projectId: autoProjectId || null,
                projectName: '',
                imageModelId: autoImageModelId,
                videoModelId: autoVideoModelId,
                preferredResolution:
                  autoVideoResolution === AUTO_AGENT_OPTION_VALUE ? null : autoVideoResolution,
                autoCreatedProject: false,
                createdTaskCount: 0,
                stage: null,
                workflow: null,
              }
            : null,
          createdAt: new Date().toISOString(),
        },
      ])
      setStreamingAssistantId(optimisticAssistantId)
      setCollapsedReasoningByMessageId((prev) => ({
        ...prev,
        [optimisticAssistantId]: false,
      }))
      clearStreamFlushTimer()
      clearStreamReasoningFlushTimer()
      streamBufferRef.current = ''
      streamReasoningBufferRef.current = ''
      setStreamStatusText('')

      if (!override) {
        setComposer('')
        if (!useImageAgent) {
          setPendingImages([])
          setPendingFiles([])
        }
      }

      await chatService.streamMessage(
        conversationId,
        useImageAgent
          ? {
              content: text || undefined,
              images: images.length > 0 ? images : undefined,
              mediaAgent: {
                enabled: true,
                modelId: selectedAgentModelId,
                preferredAspectRatio:
                  selectedAgentAspectRatio === AUTO_AGENT_OPTION_VALUE
                    ? undefined
                    : selectedAgentAspectRatio,
                preferredResolution:
                  selectedAgentResolution === AUTO_AGENT_OPTION_VALUE
                    ? undefined
                    : selectedAgentResolution,
                preferredDuration:
                  selectedAgentDuration === AUTO_AGENT_OPTION_VALUE
                    ? undefined
                    : selectedAgentDuration,
                referenceImages: images.length > 0 ? images : undefined,
                referenceVideos: videos.length > 0 ? videos : undefined,
                referenceAudios: audios.length > 0 ? audios : undefined,
                autoCreate: false,
              },
            }
          : useAutoMode
            ? {
                content: text || undefined,
                autoProjectAgent: {
                  enabled: true,
                  projectId: autoProjectId || undefined,
                  imageModelId: autoImageModelId,
                  videoModelId: autoVideoModelId,
                  preferredResolution:
                    autoVideoResolution === AUTO_AGENT_OPTION_VALUE ? undefined : autoVideoResolution,
                  createProjectIfMissing: true,
                },
              }
          : {
              content: text || undefined,
              images: images.length > 0 ? images : undefined,
              fileIds: files.length > 0 ? files.map((item) => item.id) : undefined,
            },
        {
          onStart: (event) => {
            receivedStart = true
            setMessages((prev) =>
              prev.map((msg) => (msg.id === optimisticUserId ? normalizeMessageShape(event.userMessage) : msg))
            )
            appendOrReplaceConversation(event.conversation)
          },
          onDelta: (chunk) => {
            streamBufferRef.current += chunk
            clearStreamFlushTimer()
            flushStreamBuffer(optimisticAssistantId)
            if (streamStatusText) setStreamStatusText('')
          },
          onReasoningDelta: (chunk) => {
            streamReasoningBufferRef.current += chunk
            clearStreamReasoningFlushTimer()
            flushStreamReasoningBuffer(optimisticAssistantId)
            if (streamStatusText) setStreamStatusText('')
          },
          onStatus: (event) => {
            if (typeof event.message === 'string' && event.message.trim()) {
              setStreamStatusText(event.message.trim())
            }
          },
          onDone: (event) => {
            clearStreamFlushTimer()
            clearStreamReasoningFlushTimer()
            flushStreamBuffer(optimisticAssistantId)
            flushStreamReasoningBuffer(optimisticAssistantId)
            const normalizedAssistantMessage = normalizeMessageShape(event.assistantMessage)
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === optimisticAssistantId ? normalizedAssistantMessage : msg
              )
            )
            setCollapsedReasoningByMessageId((prev) => {
              const existing = prev[optimisticAssistantId]
              if (existing === undefined) {
                return prev
              }

              const next = { ...prev }
              delete next[optimisticAssistantId]
              next[event.assistantMessage.id] = existing
              return next
            })
            setStreamingAssistantId(null)
            appendOrReplaceConversation(event.conversation)
            setStreamStatusText('')
            if (normalizedAssistantMessage.autoProjectAgent) {
              setSelectedAutoProjectId(normalizedAssistantMessage.autoProjectAgent.projectId ?? '')
              setSelectedAutoImageModelId(normalizedAssistantMessage.autoProjectAgent.imageModelId)
              setSelectedAutoVideoModelId(normalizedAssistantMessage.autoProjectAgent.videoModelId)
              setSelectedAutoVideoResolution(
                normalizedAssistantMessage.autoProjectAgent.preferredResolution ?? AUTO_AGENT_OPTION_VALUE
              )
              void loadProjects()
            }
            for (const taskRef of normalizedAssistantMessage.taskRefs) {
              bootstrappedTaskIdsRef.current.add(`${taskRef.kind}:${taskRef.taskId}`)
              void refreshTask(taskRef.kind, taskRef.taskId)
            }
          },
        },
        abortController.signal
      )
    } catch (error) {
      const userStopped = stopRequestedRef.current
      const aborted = isAbortLikeError(error)

      if (userStopped || aborted) {
        setStreamStatusText('')

        if (receivedStart) {
          const stopNote = `> ${t('stoppedHint')}`
          const appended = appendInterruptionNoteToMessage(optimisticAssistantId, stopNote)
          if (!appended) {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== optimisticAssistantId) return msg
                if (msg.content.includes(stopNote)) return msg
                const nextContent = msg.content.trim() ? `${msg.content}\n\n${stopNote}` : stopNote
                return { ...msg, content: nextContent }
              })
            )
          }
        } else {
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== optimisticUserId && msg.id !== optimisticAssistantId)
          )
          if (!override) {
            setComposer(text)
            if (!useImageAgent) {
              setPendingImages(images)
              setPendingFiles(files)
            }
          }
        }

        setStreamingAssistantId(null)
        return
      }

      const interruptionNote = `> ${t('interruptedHint')}`
      const keptPartialMessage = receivedStart
        ? appendInterruptionNoteToMessage(optimisticAssistantId, interruptionNote)
        : false

      if (!keptPartialMessage) {
        setMessages((prev) =>
          prev.filter((msg) => msg.id !== optimisticUserId && msg.id !== optimisticAssistantId)
        )
      }

      const message = isNetworkLikeError(error)
        ? t('errors.streamInterrupted')
        : error instanceof Error
          ? error.message
          : t('errors.send')
      toast.error(message || t('errors.send'))
      setStreamingAssistantId(null)
      setStreamStatusText('')
      if (!keptPartialMessage) {
        if (!override) {
          setComposer(text)
          if (!useImageAgent) {
            setPendingImages(images)
            setPendingFiles(files)
          }
        }
      }
    } finally {
      clearStreamFlushTimer()
      clearStreamReasoningFlushTimer()
      streamBufferRef.current = ''
      streamReasoningBufferRef.current = ''
      streamAbortRef.current = null
      stopRequestedRef.current = false
      setIsSending(false)
      setStreamStatusText('')
    }
  }

  const handleCopyMessage = useCallback(async (message: ChatMessage) => {
    const reasoning = (message.reasoning ?? '').trim()
    const content = (message.content ?? '').trim()
    const combined = [reasoning ? `${t('thinkingProcess')}\n${reasoning}` : '', content]
      .filter((part) => part.length > 0)
      .join('\n\n')

    if (!combined) return

    const copied = await writeClipboardText(combined)
    if (copied) {
      toast.success(t('copySuccess'))
      return
    }
    toast.error(t('copyFailed'))
  }, [t])

  const handleRetryMessage = useCallback(async (message: ChatMessage) => {
    if (message.role !== 'user' || isSending || isUploadingFiles || isUploadingAgentReferences || isSwitchingModel) {
      return
    }

    const currentIndex = messages.findIndex((item) => item.id === message.id)
    const nextAssistant = currentIndex >= 0 ? messages[currentIndex + 1] : null
    const nextMediaAgent = nextAssistant?.role === 'assistant' ? nextAssistant.mediaAgent ?? null : null
    const nextAutoProjectAgent =
      nextAssistant?.role === 'assistant' ? nextAssistant.autoProjectAgent ?? null : null
    const composerMode: 'chat' | 'image' | 'auto' = nextAutoProjectAgent
      ? 'auto'
      : nextMediaAgent
        ? 'image'
        : 'chat'

    await handleSend({
      content: message.content,
      images: message.images,
      files: message.files,
      composerMode,
      referenceVideos: nextMediaAgent?.referenceVideos,
      referenceAudios: nextMediaAgent?.referenceAudios,
      autoProjectId: nextAutoProjectAgent?.projectId ?? undefined,
      autoImageModelId: nextAutoProjectAgent?.imageModelId,
      autoVideoModelId: nextAutoProjectAgent?.videoModelId,
      autoVideoResolution: nextAutoProjectAgent?.preferredResolution ?? undefined,
    })
  }, [
    handleSend,
    isSending,
    isSwitchingModel,
    isUploadingAgentReferences,
    isUploadingFiles,
    messages,
  ])

  const handleDeleteTurn = useCallback(async (message: ChatMessage) => {
    if (message.role !== 'user' || isSending || isUploadingFiles || isSwitchingModel) return
    if (!activeConversationId) return

    try {
      setDeletingTurnMessageId(message.id)
      const result = await chatService.deleteTurn(activeConversationId, message.id)
      const deleted = new Set(result.deletedMessageIds)

      setMessages((prev) => prev.filter((item) => !deleted.has(item.id)))
      setCollapsedReasoningByMessageId((prev) => {
        if (Object.keys(prev).length === 0) return prev
        const next: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(prev) as Array<[string, boolean]>) {
          if (!deleted.has(key)) next[key] = value
        }
        return next
      })
      setCollapsedCitationsByMessageId((prev) => {
        if (Object.keys(prev).length === 0) return prev
        const next: Record<string, boolean> = {}
        for (const [key, value] of Object.entries(prev) as Array<[string, boolean]>) {
          if (!deleted.has(key)) next[key] = value
        }
        return next
      })

      if (streamingAssistantId && deleted.has(streamingAssistantId)) {
        setStreamingAssistantId(null)
      }

      appendOrReplaceConversation(result.conversation)
      toast.success(t('deleteTurnSuccess'))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : t('deleteTurnFailed')
      toast.error(messageText || t('deleteTurnFailed'))
    } finally {
      setDeletingTurnMessageId((current) => (current === message.id ? null : current))
    }
  }, [
    activeConversationId,
    appendOrReplaceConversation,
    isSending,
    isSwitchingModel,
    isUploadingFiles,
    streamingAssistantId,
    t,
  ])

  const appendAgentReferences = useCallback((
    kind: AgentReferenceKind,
    items: Array<{ url: string; name: string }>,
    max: number
  ) => {
    if (items.length === 0 || max <= 0) return

    setAgentReferences((prev) => {
      const sameKind = prev.filter((item) => item.kind === kind)
      const otherKinds = prev.filter((item) => item.kind !== kind)
      const available = Math.max(0, max - sameKind.length)
      const nextItems = items.slice(0, available).map((item, index) => ({
        id: `${kind}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        kind,
        url: item.url,
        name: item.name,
      }))

      return [...otherKinds, ...sameKind, ...nextItems]
    })
  }, [])

  const handleUploadAgentImages = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    const max = selectedAgentReferenceLimits.images
    if (max <= 0) {
      toast.error(isZh ? '当前模型不支持图片参考' : 'The current model does not support image references')
      return
    }

    const remainingByKind = Math.max(0, max - agentReferenceImages.length)
    const remainingByVisualBudget =
      selectedAgentVisualReferenceLimit === null
        ? remainingByKind
        : Math.max(0, selectedAgentVisualReferenceLimit - agentVisualReferenceCount)
    const remaining = Math.min(remainingByKind, remainingByVisualBudget)
    if (remaining <= 0) {
      toast.error(
        selectedAgentVisualReferenceLimit !== null
          ? isZh
            ? `图像和视频素材总数最多 ${selectedAgentVisualReferenceLimit} 个`
            : `You can attach up to ${selectedAgentVisualReferenceLimit} image/video references in total`
          : isZh
            ? `最多可上传 ${max} 张图片参考`
            : `You can attach up to ${max} image references`
      )
      return
    }

    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/')).slice(0, remaining)
    if (files.length === 0) {
      toast.error(t('errors.uploadType'))
      return
    }

    try {
      setIsUploadingAgentReferences(true)
      const uploadedItems =
        selectedAgentModelType === 'video'
          ? (await videoService.uploadSeedanceInputs('image', files, selectedAgentUploadProvider)).files.map((item, index) => ({
              url: item.url,
              name: files[index]?.name || item.fileName || `image-${index + 1}`,
            }))
          : await Promise.all(
              files.map(async (file) => ({
                url: await imageFileToDataUrl(file),
                name: file.name,
              }))
            )

      appendAgentReferences('image', uploadedItems, max)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.uploadType')
      toast.error(message || t('errors.uploadType'))
    } finally {
      setIsUploadingAgentReferences(false)
    }
  }, [
    agentReferenceImages.length,
    agentVisualReferenceCount,
    appendAgentReferences,
    isZh,
    selectedAgentModelType,
    selectedAgentReferenceLimits.images,
    selectedAgentUploadProvider,
    selectedAgentVisualReferenceLimit,
    t,
  ])

  const handleUploadAgentSeedanceInputs = useCallback(async (
    kind: 'video' | 'audio',
    fileList: FileList | null,
    max: number
  ) => {
    if (!fileList || fileList.length === 0) return
    if (max <= 0) {
      toast.error(
        kind === 'video'
          ? isZh
            ? '当前模型不支持视频参考'
            : 'The current model does not support video references'
          : isZh
            ? '当前模型不支持音频参考'
            : 'The current model does not support audio references'
      )
      return
    }

    const existingCount = kind === 'video' ? agentReferenceVideos.length : agentReferenceAudios.length
    const remainingByKind = Math.max(0, max - existingCount)
    const remaining =
      kind === 'video'
        ? Math.min(
            remainingByKind,
            selectedAgentVisualReferenceLimit === null
              ? remainingByKind
              : Math.max(0, selectedAgentVisualReferenceLimit - agentVisualReferenceCount)
          )
        : Math.min(
            remainingByKind,
            Math.max(0, selectedAgentEffectiveAudioLimit - agentReferenceAudios.length)
          )
    if (remaining <= 0) {
      toast.error(
        kind === 'video'
          ? selectedAgentVisualReferenceLimit !== null
            ? isZh
              ? `图像和视频素材总数最多 ${selectedAgentVisualReferenceLimit} 个`
              : `You can attach up to ${selectedAgentVisualReferenceLimit} image/video references in total`
            : isZh
              ? `最多可上传 ${max} 个视频参考`
              : `You can attach up to ${max} video references`
          : selectedAgentIsWanxR2v && agentVisualReferenceCount <= 0
            ? isZh
              ? '请先上传图片或视频参考，再上传音频'
              : 'Upload an image or video reference before adding audio'
            : isZh
              ? `最多可上传 ${Math.max(agentReferenceAudios.length, selectedAgentEffectiveAudioLimit)} 个音频参考`
              : `You can attach up to ${Math.max(agentReferenceAudios.length, selectedAgentEffectiveAudioLimit)} audio references`
      )
      return
    }

    const expectedPrefix = kind === 'video' ? 'video/' : 'audio/'
    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith(expectedPrefix))
      .slice(0, remaining)
    if (files.length === 0) {
      toast.error(
        kind === 'video'
          ? isZh
            ? '仅支持视频文件'
            : 'Only video files are supported'
          : isZh
            ? '仅支持音频文件'
            : 'Only audio files are supported'
      )
      return
    }

    try {
      setIsUploadingAgentReferences(true)
      const result = await videoService.uploadSeedanceInputs(kind, files, selectedAgentUploadProvider)
      appendAgentReferences(
        kind,
        result.files.map((item, index) => ({
          url: item.url,
          name: files[index]?.name || item.fileName || `${kind}-${index + 1}`,
        })),
        max
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.send')
      toast.error(message || t('errors.send'))
    } finally {
      setIsUploadingAgentReferences(false)
    }
  }, [
    agentReferenceAudios.length,
    agentVisualReferenceCount,
    agentReferenceVideos.length,
    appendAgentReferences,
    isZh,
    selectedAgentEffectiveAudioLimit,
    selectedAgentIsWanxR2v,
    selectedAgentUploadProvider,
    selectedAgentVisualReferenceLimit,
    t,
  ])

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    if (isImageMode) {
      await handleUploadAgentImages(files)
      return
    }

    const nextImages: string[] = []

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(t('errors.uploadType'))
        continue
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('errors.uploadSize'))
        continue
      }

      try {
        const dataUrl = await imageFileToDataUrl(file)
        nextImages.push(dataUrl)
      } catch {
        toast.error(t('errors.uploadType'))
      }
    }

    if (nextImages.length === 0) return

    setPendingImages((prev) => [...prev, ...nextImages].slice(0, 4))
  }

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    if (!supportsFileUpload) {
      toast.error(t('errors.fileDisabled'))
      return
    }

    const incoming = Array.from(fileList)
    if (incoming.length + pendingFiles.length > maxFilesPerMessage) {
      toast.error(t('errors.fileCountLimit', { max: maxFilesPerMessage }))
      return
    }

    const allowed = new Set(allowedFileExtensions)
    const maxBytes = maxFileSizeMb * 1024 * 1024
    const accepted: File[] = []

    for (const file of incoming) {
      const ext = normalizeExtension(file.name, '')
      if (allowed.size > 0 && (!ext || !allowed.has(ext))) {
        toast.error(t('errors.fileExtensionNotAllowed', { ext: ext || 'unknown' }))
        continue
      }
      if (file.size > maxBytes) {
        toast.error(t('errors.fileTooLarge', { size: maxFileSizeMb }))
        continue
      }
      accepted.push(file)
    }

    if (accepted.length === 0) return

    try {
      setIsUploadingFiles(true)
      const conversationId = await ensureConversation()
      const uploaded = await chatService.uploadFiles(conversationId, accepted)
      setPendingFiles((prev) => [...prev, ...uploaded.files].slice(0, maxFilesPerMessage))
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.fileUploadFailed')
      toast.error(message || t('errors.fileUploadFailed'))
    } finally {
      setIsUploadingFiles(false)
    }
  }

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await chatService.deleteConversation(conversationId)

      setConversations((prev) => {
        const next = prev.filter((item) => item.id !== conversationId)

        if (activeConversationId === conversationId) {
          if (next.length > 0) {
            void loadMessages(next[0].id, { routeSyncMode: 'replace' })
          } else {
            setActiveConversationId(null)
            setMessages([])
            initializedConversationRef.current = false
            syncRouteToConversation(null, 'replace')
          }
        }

        return next
      })
    } catch {
      toast.error(t('errors.loadConversations'))
    }
  }

  const handleTogglePinConversation = async (conversation: ChatConversation) => {
    try {
      const updated = await chatService.updateConversation(conversation.id, {
        isPinned: !conversation.isPinned,
      })
      appendOrReplaceConversation(updated)
    } catch {
      toast.error(t('errors.updateConversation'))
    }
  }

  const handleStartRenameConversation = (conversation: ChatConversation) => {
    setRenamingConversationId(conversation.id)
    setRenamingTitle(displayConversationTitle(conversation.title))
  }

  const handleCancelRenameConversation = () => {
    setRenamingConversationId(null)
    setRenamingTitle('')
  }

  const handleConfirmRenameConversation = async (conversationId: string) => {
    const nextTitle = renamingTitle.trim()
    if (!nextTitle) {
      toast.error(t('errors.emptyTitle'))
      return
    }

    try {
      const updated = await chatService.updateConversation(conversationId, { title: nextTitle })
      appendOrReplaceConversation(updated)
      handleCancelRenameConversation()
    } catch {
      toast.error(t('errors.updateConversation'))
    }
  }

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as KeyboardEvent & {
      isComposing?: boolean
      keyCode?: number
    }

    if (nativeEvent.isComposing || isComposerComposing || nativeEvent.keyCode === 229) return
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (canSend) {
      void handleSend()
    }
  }

  const handleCopyImageAgentPrompt = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return

    const copied = await writeClipboardText(prompt)
    if (copied) {
      toast.success(t('copySuccess'))
      return
    }

    toast.error(t('copyFailed'))
  }, [t])

  const handleConfirmMediaAgentTask = useCallback(async (assistantMessage: ChatMessage) => {
    const metadata = assistantMessage.mediaAgent
    if (!metadata || metadata.status !== 'ready' || !metadata.optimizedPrompt?.trim()) return

    const conversationId = activeConversationId ?? assistantMessage.conversationId
    if (!conversationId) return

    const sourceUserMessage =
      messages.find((item) => item.id === metadata.sourceUserMessageId && item.role === 'user') ??
      (() => {
        const currentIndex = messages.findIndex((item) => item.id === assistantMessage.id)
        const previousMessage = currentIndex > 0 ? messages[currentIndex - 1] : null
        return previousMessage?.role === 'user' ? previousMessage : null
      })()

    const sourceImages = sourceUserMessage?.images ?? []
    const confirmationMessageContent =
      sourceUserMessage?.content.trim() ? (isZh ? '确认生成' : 'Confirm generation') : metadata.optimizedPrompt
    if (metadata.referenceImageCount > 0 && sourceImages.length === 0) {
      toast.error(isZh ? '未找到对应的图片参考，请重新发送本轮创作' : 'Reference images were not found. Please resend this turn.')
      return
    }

    try {
      setConfirmingMediaMessageId(assistantMessage.id)

      const result =
        metadata.modelType === 'video'
          ? await chatService.createVideoTask(conversationId, {
              modelId: metadata.modelId,
              prompt: metadata.optimizedPrompt,
              images: sourceImages.length > 0 ? sourceImages : undefined,
              videos: metadata.referenceVideos.length > 0 ? metadata.referenceVideos : undefined,
              audios: metadata.referenceAudios.length > 0 ? metadata.referenceAudios : undefined,
              preferredAspectRatio: metadata.preferredAspectRatio ?? undefined,
              preferredResolution: metadata.preferredResolution ?? undefined,
              preferredDuration: metadata.preferredDuration ?? undefined,
              useConversationContextEdit: metadata.intent === 'edit',
              userMessageContent: confirmationMessageContent,
              sourceAssistantMessageId: assistantMessage.id,
            })
          : await chatService.createImageTask(conversationId, {
              modelId: metadata.modelId,
              prompt: metadata.optimizedPrompt,
              negativePrompt: metadata.negativePrompt ?? undefined,
              images: sourceImages.length > 0 ? sourceImages : undefined,
              preferredAspectRatio: metadata.preferredAspectRatio ?? undefined,
              preferredResolution: metadata.preferredResolution ?? undefined,
              useConversationContextEdit: metadata.intent === 'edit',
              userMessageContent: confirmationMessageContent,
              sourceAssistantMessageId: assistantMessage.id,
            })

      const normalizedUserMessage = normalizeMessageShape(result.userMessage)
      const normalizedAssistantMessage = normalizeMessageShape(result.assistantMessage)
      setMessages((prev) => [
        ...prev.map((item) =>
          item.id === assistantMessage.id && item.mediaAgent
            ? { ...item, mediaAgent: { ...item.mediaAgent, autoCreated: true } }
            : item
        ),
        normalizedUserMessage,
        normalizedAssistantMessage,
      ])
      appendOrReplaceConversation(result.conversation)

      const firstTaskRef = normalizedAssistantMessage.taskRefs[0]
      if (firstTaskRef) {
        bootstrappedTaskIdsRef.current.add(`${firstTaskRef.kind}:${firstTaskRef.taskId}`)
        void refreshTask(firstTaskRef.kind, firstTaskRef.taskId)
      }

      const lastMessageId = messages[messages.length - 1]?.id
      if (assistantMessage.id === lastMessageId) {
        setComposer('')
        setAgentReferences([])
        setIsAgentUploadMenuOpen(false)
        setIsAgentSettingsModalOpen(false)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errors.createImageTask')
      toast.error(message || t('errors.createImageTask'))
    } finally {
      setConfirmingMediaMessageId((current) => (current === assistantMessage.id ? null : current))
    }
  }, [
    activeConversationId,
    appendOrReplaceConversation,
    isZh,
    messages,
    refreshTask,
    t,
  ])

  const handleSendImageAgentSuggestion = useCallback(async (reply: string) => {
    const nextReply = reply.trim()
    if (!nextReply) return

    await handleSend({
      content: nextReply,
      images: agentReferenceImageUrls,
      referenceVideos: agentReferenceVideoUrls,
      referenceAudios: agentReferenceAudioUrls,
      files: [],
      composerMode: 'image',
    })
  }, [
    agentReferenceAudioUrls,
    agentReferenceImageUrls,
    agentReferenceVideoUrls,
    handleSend,
  ])

  const handleSendAutoProjectAction = useCallback(async (
    content: string,
    metadata: ChatAutoProjectAgentMetadata,
  ) => {
    const nextContent = content.trim()
    if (!nextContent) return

    await handleSend({
      content: nextContent,
      composerMode: 'auto',
      autoProjectId: metadata.projectId ?? undefined,
      autoImageModelId: metadata.imageModelId,
      autoVideoModelId: metadata.videoModelId,
      autoVideoResolution: metadata.preferredResolution ?? undefined,
    })
  }, [handleSend])

  const handleMergeAutoProjectStoryboard = useCallback(async (
    metadata: ChatAutoProjectAgentMetadata,
  ) => {
    const projectId = metadata.projectId?.trim() || ''
    const workflow = metadata.workflow
    if (!projectId || !workflow) {
      toast.error(isZh ? '未找到当前项目，暂时无法合并分镜' : 'Project not found for storyboard merge')
      return
    }

    try {
      setMergingStoryboardProjectId(projectId)
      const liveStoryboardStatuses = await projectsService.getProjectStoryboardStatus(
        projectId,
        workflow.shots.map((shot) => shot.id)
      )
      applyStoryboardStatuses(projectId, liveStoryboardStatuses)

      const skippedShotIdSet = new Set(workflow.skippedShotIds)
      const liveStoryboardShotIdSet = new Set(
        liveStoryboardStatuses
          .filter((item) =>
            !skippedShotIdSet.has(item.shotId) &&
            Boolean(item.taskId || item.status || item.resultUrl || item.errorMessage)
          )
          .map((item) => item.shotId)
      )
      const completedShotIdSet = new Set(
        liveStoryboardStatuses
          .filter((item) => item.completed && !skippedShotIdSet.has(item.shotId))
          .map((item) => item.shotId)
      )
      const generatedShotIdSet = new Set(
        workflow.generatedShotIds.filter((shotId) => !skippedShotIdSet.has(shotId))
      )

      for (const shotId of liveStoryboardShotIdSet) {
        generatedShotIdSet.add(shotId)
      }
      for (const shotId of completedShotIdSet) {
        generatedShotIdSet.add(shotId)
      }

      const generatedShots = workflow.shots.filter((shot) => generatedShotIdSet.has(shot.id))
      const failedShotIdSet = new Set(
        liveStoryboardStatuses
          .filter((item) => item.status === 'failed' && !skippedShotIdSet.has(item.shotId))
          .map((item) => item.shotId)
      )
      const failedShotLabels = generatedShots
        .filter((shot) => failedShotIdSet.has(shot.id))
        .map((shot) => {
          const shotIndex = workflow.shots.findIndex((item) => item.id === shot.id)
          return isZh ? `第 ${shotIndex + 1} 镜｜${shot.title}` : `Shot #${shotIndex + 1} | ${shot.title}`
        })
      const pendingShotLabels = generatedShots
        .filter((shot) => !completedShotIdSet.has(shot.id) && !failedShotIdSet.has(shot.id))
        .map((shot) => {
          const shotIndex = workflow.shots.findIndex((item) => item.id === shot.id)
          return isZh ? `第 ${shotIndex + 1} 镜｜${shot.title}` : `Shot #${shotIndex + 1} | ${shot.title}`
        })
      const shotIds = generatedShots
        .filter((shot) => completedShotIdSet.has(shot.id))
        .map((shot) => shot.id)

      if (shotIds.length === 0) {
        toast.error(isZh ? '暂无可合并的已生成分镜' : 'No generated storyboard shots are available to merge')
        return
      }

      if (failedShotLabels.length > 0) {
        toast.error(
          isZh
            ? `仍有分镜视频生成失败，处理后才能合并：${failedShotLabels.join('；')}`
            : `Some storyboard videos failed and must be fixed before merge: ${failedShotLabels.join('; ')}`
        )
        return
      }

      if (pendingShotLabels.length > 0) {
        toast.error(
          isZh
            ? `仍有分镜视频未完成，暂时无法合并：${pendingShotLabels.join('；')}`
            : `Some storyboard videos are not completed yet: ${pendingShotLabels.join('; ')}`
        )
        return
      }

      await projectsService.mergeProjectStoryboard(projectId, { shotIds })
      toast.success(
        isZh
          ? '最终成片已生成并保存到项目素材，可前往项目中下载'
          : 'Merged storyboard saved to project assets. You can download it from the project.'
      )
      void loadProjects()
    } catch (error) {
      const message = error instanceof Error ? error.message : (isZh ? '合并分镜失败' : 'Failed to merge storyboard')
      toast.error(message || (isZh ? '合并分镜失败' : 'Failed to merge storyboard'))
    } finally {
      setMergingStoryboardProjectId((current) => (current === projectId ? null : current))
    }
  }, [applyStoryboardStatuses, isZh, loadProjects])

  const AgentUploadTileIcon =
    agentUploadTileInfo.kind === 'image'
      ? ImagePlus
      : agentUploadTileInfo.kind === 'video'
        ? Square
        : agentUploadTileInfo.kind === 'audio'
          ? FileText
          : Plus

  if (!isReady) {
    return (
      <PageTransition className="flex min-h-0 flex-1 w-full items-center justify-center bg-canvas dark:bg-canvas-dark">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-aurora-purple dark:border-stone-700" />
      </PageTransition>
    )
  }

  return (
    <PageTransition className="flex min-h-0 flex-1 w-full bg-canvas dark:bg-canvas-dark">
      <div className={styles.chatApp}>
        {sidebarOpen ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className={styles.mobileMask}
            aria-label={t('collapseHistory')}
          />
        ) : null}

        <aside
          className={cn(
            styles.sidebar,
            sidebarOpen ? styles.sidebarOpen : styles.sidebarClosed
          )}
        >
          <div className={styles.sidebarHeader}>
            <button
              type="button"
              onClick={handleCreateNewChat}
              className={styles.newChatBtn}
            >
              <Plus className="h-4 w-4" />
              <span>{t('newChat')}</span>
            </button>

            <div className={styles.searchBox}>
              <Search className={styles.searchIcon} />
              <input
                type="text"
                value={conversationKeyword}
                onChange={(event) => setConversationKeyword(event.target.value)}
                placeholder={t('searchPlaceholder')}
                className={styles.searchInput}
              />
            </div>
          </div>

          <div className={styles.historyList}>
            {loadingConversations ? (
              <p className={styles.historyEmpty}>{t('historyLoading')}</p>
            ) : conversations.length === 0 ? (
              <p className={styles.historyEmpty}>{t('historyEmpty')}</p>
            ) : (
              <>
                {groupedConversations.pinned.length > 0 ? (
                  <div className={styles.historyGroup}>
                    <div className={styles.historyTitle}>{historyLabels.pinned}</div>
                    {groupedConversations.pinned.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          styles.historyItem,
                          conversation.id === activeConversationId && styles.historyItemActive
                        )}
                      >
                        {renamingConversationId === conversation.id ? (
                          <div className={styles.renameWrap}>
                            <input
                              value={renamingTitle}
                              onChange={(event) => setRenamingTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void handleConfirmRenameConversation(conversation.id)
                                }
                              }}
                              maxLength={200}
                              className={styles.renameInput}
                            />
                            <div className={styles.renameActions}>
                              <button
                                type="button"
                                onClick={() => void handleConfirmRenameConversation(conversation.id)}
                                className={styles.renameBtn}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRenameConversation}
                                className={styles.renameBtn}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                setSidebarOpen(false)
                                await loadMessages(conversation.id, { routeSyncMode: 'push' })
                              }}
                              className={styles.historyItemMain}
                            >
                              <Pin className={styles.historyItemIcon} />
                              <span className={styles.itemText}>{displayConversationTitle(conversation.title)}</span>
                            </button>
                            <div className={styles.historyItemMeta}>{formatDate(conversation.lastMessageAt, locale)}</div>
                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => void handleTogglePinConversation(conversation)}
                                title={t('unpin')}
                              >
                                <PinOff className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleStartRenameConversation(conversation)}
                                title={t('rename')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleDeleteConversation(conversation.id)}
                                title={t('delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {groupedConversations.recent.length > 0 ? (
                  <div className={styles.historyGroup}>
                    <div className={styles.historyTitle}>{historyLabels.recent}</div>
                    {groupedConversations.recent.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          styles.historyItem,
                          conversation.id === activeConversationId && styles.historyItemActive
                        )}
                      >
                        {renamingConversationId === conversation.id ? (
                          <div className={styles.renameWrap}>
                            <input
                              value={renamingTitle}
                              onChange={(event) => setRenamingTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void handleConfirmRenameConversation(conversation.id)
                                }
                              }}
                              maxLength={200}
                              className={styles.renameInput}
                            />
                            <div className={styles.renameActions}>
                              <button
                                type="button"
                                onClick={() => void handleConfirmRenameConversation(conversation.id)}
                                className={styles.renameBtn}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRenameConversation}
                                className={styles.renameBtn}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                setSidebarOpen(false)
                                await loadMessages(conversation.id, { routeSyncMode: 'push' })
                              }}
                              className={styles.historyItemMain}
                            >
                              <MessageSquare className={styles.historyItemIcon} />
                              <span className={styles.itemText}>{displayConversationTitle(conversation.title)}</span>
                            </button>
                            <div className={styles.historyItemMeta}>{formatDate(conversation.lastMessageAt, locale)}</div>
                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => void handleTogglePinConversation(conversation)}
                                title={conversation.isPinned ? t('unpin') : t('pin')}
                              >
                                {conversation.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleStartRenameConversation(conversation)}
                                title={t('rename')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleDeleteConversation(conversation.id)}
                                title={t('delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {groupedConversations.previous.length > 0 ? (
                  <div className={styles.historyGroup}>
                    <div className={styles.historyTitle}>{historyLabels.previous}</div>
                    {groupedConversations.previous.map((conversation) => (
                      <div
                        key={conversation.id}
                        className={cn(
                          styles.historyItem,
                          conversation.id === activeConversationId && styles.historyItemActive
                        )}
                      >
                        {renamingConversationId === conversation.id ? (
                          <div className={styles.renameWrap}>
                            <input
                              value={renamingTitle}
                              onChange={(event) => setRenamingTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault()
                                  void handleConfirmRenameConversation(conversation.id)
                                }
                              }}
                              maxLength={200}
                              className={styles.renameInput}
                            />
                            <div className={styles.renameActions}>
                              <button
                                type="button"
                                onClick={() => void handleConfirmRenameConversation(conversation.id)}
                                className={styles.renameBtn}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelRenameConversation}
                                className={styles.renameBtn}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                setSidebarOpen(false)
                                await loadMessages(conversation.id, { routeSyncMode: 'push' })
                              }}
                              className={styles.historyItemMain}
                            >
                              <MessageSquare className={styles.historyItemIcon} />
                              <span className={styles.itemText}>{displayConversationTitle(conversation.title)}</span>
                            </button>
                            <div className={styles.historyItemMeta}>{formatDate(conversation.lastMessageAt, locale)}</div>
                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => void handleTogglePinConversation(conversation)}
                                title={conversation.isPinned ? t('unpin') : t('pin')}
                              >
                                {conversation.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleStartRenameConversation(conversation)}
                                title={t('rename')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                className={styles.itemActionBtn}
                                onClick={() => handleDeleteConversation(conversation.id)}
                                title={t('delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </aside>

        <main className={styles.mainChat}>
          <header className={styles.chatHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.headerBrandBlock}>
                <div className={styles.headerTitleRow}>
                  <div className={styles.modelPicker} ref={modelMenuRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (headerModelList.length === 0 || isSending || isSwitchingModel) return
                        setIsModelMenuOpen((prev) => !prev)
                      }}
                      className={cn(
                        styles.modelTrigger,
                        (isSending || isSwitchingModel) && styles.modelTriggerLocked
                      )}
                      title={isSwitchingModel ? t('modelSwitching') : t('model')}
                    >
                      {selectedHeaderModel
                        ? renderChatModelIcon(
                            selectedHeaderModel.icon,
                            selectedHeaderModel.name,
                            styles.modelTriggerIcon
                          )
                        : <span className={styles.modelTriggerDot} />}
                      <span className={styles.modelTriggerText}>
                        {selectedHeaderModel?.name || headerModelPlaceholder}
                      </span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', isModelMenuOpen && 'rotate-180')} />
                    </button>

                    {isModelMenuOpen ? (
                      <div className={styles.modelMenu}>
                        {headerModelList.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => {
                              handleSelectHeaderModel(model.id)
                            }}
                            disabled={isSwitchingModel}
                            className={cn(
                              styles.modelOption,
                              model.id === selectedHeaderModel?.id && styles.modelOptionActive
                            )}
                          >
                            <span className={styles.modelOptionRow}>
                              {renderChatModelIcon(model.icon, model.name, styles.modelOptionIcon)}
                              <span className={styles.modelOptionBody}>
                                <span className={styles.modelOptionNameRow}>
                                  <span className={styles.modelOptionName}>{model.name}</span>
                                  <Check
                                    className={cn(
                                      styles.modelOptionCheck,
                                      model.id === selectedHeaderModel?.id && styles.modelOptionCheckActive
                                    )}
                                  />
                                </span>
                                {model.description?.trim() ? (
                                  <span className={styles.modelOptionMeta}>
                                    {model.description.trim()}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {headerModelDescription ? (
                  <div className={styles.headerModelDescription}>{headerModelDescription}</div>
                ) : null}
              </div>
            </div>

            <div className={styles.headerRight}>
              <button
                type="button"
                onClick={handleToggleHistoryPanel}
                className={styles.headerActionBtn}
                aria-label={sidebarOpen ? t('collapseHistory') : t('expandHistory')}
              >
                <PanelLeft className="h-4 w-4" />
                <span>{historyActionLabel}</span>
              </button>

              <button
                type="button"
                onClick={handleCreateNewChat}
                className={cn(styles.headerActionBtn, styles.headerPrimaryAction)}
              >
                <Plus className="h-4 w-4" />
                <span>{newConversationLabel}</span>
              </button>
            </div>
          </header>

          <div
            ref={messageListRef}
            className={cn(styles.chatMessages, !loadingMessages && messages.length === 0 && styles.chatMessagesEmpty)}
          >
            {loadingMessages ? (
              <div className={styles.messageRow}>
                <div className={styles.historyEmpty}>{t('historyLoading')}</div>
              </div>
            ) : messages.length === 0 ? (
              <div className={styles.messageRow}>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.32, ease: 'easeOut' }}
                  className={styles.emptyStateCard}
                >
                  <div className={styles.emptyStateIntro}>
                    <div className={styles.emptyStateHeadlineBlock}>
                      <p className={styles.emptyStateTitle}>{workspaceTitle}</p>
                      <p className={styles.emptyStateDesc}>{workspaceSubtitle}</p>
                    </div>

                    <div className={styles.emptyStateModeGrid}>
                      {emptyStateCards.map((item, index) => {
                        const Icon = item.icon
                        const statusLabel = item.active
                          ? t('emptyStateCurrent')
                          : item.enabled
                            ? t('emptyStateOpen')
                            : t('emptyStateUnavailable')

                        return (
                          <motion.button
                            key={item.mode}
                            type="button"
                            onClick={() => handlePickEmptyStateMode(item.mode)}
                            disabled={!item.enabled}
                            whileHover={item.enabled ? { y: -4 } : undefined}
                            whileTap={item.enabled ? { scale: 0.985 } : undefined}
                            className={cn(
                              styles.emptyStateModeCard,
                              item.active && styles.emptyStateModeCardActive,
                              !item.enabled && styles.emptyStateModeCardDisabled
                            )}
                          >
                            <div className={styles.emptyStateModeCardHead}>
                              <span className={styles.emptyStateModeCardIcon}>
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className={styles.emptyStateModeCardIndex}>
                                {String(index + 1).padStart(2, '0')}
                              </span>
                            </div>
                            <p className={styles.emptyStateModeCardTitle}>{item.title}</p>
                            <p className={styles.emptyStateModeCardDesc}>{item.description}</p>
                            <span className={styles.emptyStateModeCardMeta}>{statusLabel}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </div>

                  <div className={styles.emptyStateVisual} aria-hidden="true">
                    <div className={styles.cinematicCoreContainer}>
                      <div className={styles.hologramViewport}>
                        <div className={styles.lensFlare} />
                        <div className={`${styles.focusRing} ${styles.ringOuter}`} />
                        <div className={`${styles.focusRing} ${styles.ringMiddle}`} />
                        <div className={`${styles.focusRing} ${styles.ringInner}`} />
                        <div className={`${styles.crosshair} ${styles.crosshairOne}`} />
                        <div className={`${styles.crosshair} ${styles.crosshairTwo}`} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            ) : (
              messages.map((message, index) => {
                const isUser = message.role === 'user'
                const nextMessage = messages[index + 1]
                const isStreamingMessage = message.id === streamingAssistantId
                const reasoningText = (message.reasoning ?? '').trim()
                const hasReasoning = reasoningText.length > 0
                const defaultCollapsed = !isStreamingMessage
                const isReasoningCollapsed =
                  collapsedReasoningByMessageId[message.id] ?? defaultCollapsed
                const showThinkingStatus =
                  !isUser && isStreamingMessage && hasReasoning && !message.content.trim()
                const hasCitations = !isUser && message.citations.length > 0
                const isCitationCollapsed =
                  collapsedCitationsByMessageId[message.id] ?? true
                const showStreamStatus =
                  !isUser && isStreamingMessage && streamStatusText.trim().length > 0
                const hasMessageContent = message.content.trim().length > 0
                const showInitialThinkingPlaceholder =
                  !isUser &&
                  isStreamingMessage &&
                  !hasReasoning &&
                  !hasMessageContent &&
                  !showStreamStatus
                const canCopyMessage =
                  ((message.content ?? '').trim().length > 0 || (message.reasoning ?? '').trim().length > 0) &&
                  !isStreamingMessage
                const mediaAgentMetadata = !isUser ? message.mediaAgent ?? null : null
                const autoProjectMetadata = !isUser ? message.autoProjectAgent ?? null : null
                const projectPromptSuggestions = !isUser ? message.projectPromptSuggestions ?? [] : []
                const hasMediaAgentPromptCard = Boolean(mediaAgentMetadata?.optimizedPrompt)
                const hasMediaAgentSuggestions = Boolean(mediaAgentMetadata?.suggestedReplies.length)
                const isConfirmingMediaTask = confirmingMediaMessageId === message.id
                const hasGeneratedImageTurn =
                  isUser &&
                  nextMessage?.role === 'assistant' &&
                  Array.isArray(nextMessage.taskRefs) &&
                  nextMessage.taskRefs.length > 0
                const canRetryMessage = isUser && !hasGeneratedImageTurn
                const canDeleteTurnMessage = isUser
                const deletingThisTurn = deletingTurnMessageId === message.id
                const assistantCompletedLabel = isZh ? '已完成' : 'Complete'
                const assistantLiveLabel = isZh ? '进行中' : 'Live'
                const assistantPendingLabel = isZh ? '待执行' : 'Pending'
                const assistantStatusTitle = isZh ? '执行进度' : 'Progress'
                const showAssistantStatusStep = !isUser && showStreamStatus
                const showAssistantReasoningStep = !isUser && (showThinkingStatus || hasReasoning)
                const showAssistantTimeline = showAssistantStatusStep || showAssistantReasoningStep
                const assistantStatusStepState: AssistantTimelineStepState =
                  showStreamStatus ? 'active' : 'completed'
                const assistantReasoningStepState: AssistantTimelineStepState =
                  hasReasoning && !isStreamingMessage
                    ? 'completed'
                    : showThinkingStatus || isStreamingMessage
                      ? 'active'
                      : 'pending'
                const assistantStatusPhaseLabel =
                  assistantStatusStepState === 'completed'
                      ? assistantCompletedLabel
                      : assistantLiveLabel
                const assistantReasoningPhaseLabel =
                  assistantReasoningStepState === 'completed'
                    ? assistantCompletedLabel
                    : assistantReasoningStepState === 'pending'
                      ? assistantPendingLabel
                      : assistantLiveLabel

                return (
                  <div
                    key={message.id}
                    className={cn(styles.messageRow, isUser ? styles.rowUser : styles.rowAi)}
                  >
                    {isUser ? (
                      <div className={styles.bubbleUser}>
                        {message.content ? <ChatMarkdown content={message.content} isUser={isUser} /> : null}

                        {message.images.length > 0 ? (
                          <div className={cn(styles.imageGrid, message.images.length > 1 && styles.imageGridMulti)}>
                            {message.images.map((image, index) => (
                              <img
                                key={`${message.id}-${index}`}
                                src={image}
                                alt={`chat-image-${index + 1}`}
                                className={styles.messageImage}
                              />
                            ))}
                          </div>
                        ) : null}

                        {message.files.length > 0 ? (
                          <div className={styles.fileList}>
                            {message.files.map((file) => {
                              const ext = normalizeExtension(file.fileName, file.extension)
                              return (
                                <div key={file.id} className={styles.fileCard}>
                                  <div className={styles.fileCardIcon}>
                                    <FileIcon extension={ext} />
                                  </div>
                                  <div className={styles.fileCardMeta}>
                                    <p className={styles.fileCardName}>{file.fileName}</p>
                                    <p className={styles.fileCardSub}>
                                      {ext ? ext.toUpperCase() : 'FILE'} · {formatFileSize(file.fileSize)}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}

                        <div className={cn(styles.messageFooter, styles.messageFooterUser)}>
                          <div className={cn(styles.messageMeta, styles.messageMetaUser)}>
                            {formatDate(message.createdAt, locale)}
                          </div>
                          <div className={styles.messageActions}>
                            {canCopyMessage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleCopyMessage(message)
                                }}
                                className={cn(styles.messageActionBtn, styles.messageActionBtnUser)}
                                title={t('copy')}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>{t('copy')}</span>
                              </button>
                            ) : null}

                            {canRetryMessage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleRetryMessage(message)
                                }}
                                disabled={isSending || isSwitchingModel || isUploadingFiles}
                                className={cn(styles.messageActionBtn, styles.messageActionBtnUser)}
                                title={t('retry')}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                <span>{t('retry')}</span>
                              </button>
                            ) : null}

                            {canDeleteTurnMessage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDeleteTurn(message)
                                }}
                                disabled={isSending || isSwitchingModel || isUploadingFiles || deletingThisTurn}
                                className={cn(styles.messageActionBtn, styles.messageActionBtnUser)}
                                title={t('deleteTurn')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>{deletingThisTurn ? t('deleting') : t('deleteTurn')}</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.bubbleAi}>
                        {showAssistantTimeline ? (
                          <div className={styles.assistantTimeline}>
                            {showAssistantStatusStep ? (
                              <div
                                className={cn(
                                  styles.assistantStepItem,
                                  assistantStatusStepState === 'completed' && styles.assistantStepCompleted,
                                  assistantStatusStepState === 'active' && styles.assistantStepActive
                                )}
                              >
                                <div className={styles.assistantStepIndicator}>
                                  {renderAssistantStepIndicator(assistantStatusStepState)}
                                </div>
                                <div className={styles.assistantStepContent}>
                                  <div className={styles.assistantStepHeader}>
                                    <div className={styles.assistantStepTitleGroup}>
                                      <span className={styles.assistantStepTitle}>
                                        {assistantStatusTitle}
                                      </span>
                                    </div>
                                    <span className={styles.assistantStepPhase}>
                                      {assistantStatusPhaseLabel}
                                    </span>
                                  </div>

                                  {showStreamStatus ? (
                                    <div className={styles.assistantStepLog}>{streamStatusText}</div>
                                  ) : null}

                                </div>
                              </div>
                            ) : null}

                            {showAssistantReasoningStep ? (
                              <div
                                className={cn(
                                  styles.assistantStepItem,
                                  assistantReasoningStepState === 'completed' && styles.assistantStepCompleted,
                                  assistantReasoningStepState === 'active' && styles.assistantStepActive
                                )}
                              >
                                <div className={styles.assistantStepIndicator}>
                                  {renderAssistantStepIndicator(assistantReasoningStepState)}
                                </div>
                                <div className={styles.assistantStepContent}>
                                  <div className={styles.assistantStepHeader}>
                                    <div className={styles.assistantStepTitleGroup}>
                                      <span className={styles.assistantStepTitle}>
                                        {t('thinkingProcess')}
                                      </span>
                                    </div>
                                    <span className={styles.assistantStepPhase}>
                                      {assistantReasoningPhaseLabel}
                                    </span>
                                  </div>

                                  {showThinkingStatus ? (
                                    <div className={styles.assistantStepLog}>{t('thinking')}</div>
                                  ) : null}

                                  {hasReasoning ? (
                                    <div className={styles.reasoningSection}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setCollapsedReasoningByMessageId((prev) => ({
                                            ...prev,
                                            [message.id]: !(prev[message.id] ?? defaultCollapsed),
                                          }))
                                        }
                                        className={styles.reasoningToggle}
                                      >
                                        <span className={styles.reasoningToggleLeft}>
                                          <Brain className="h-3.5 w-3.5" />
                                          <span>{t('thinkingProcess')}</span>
                                        </span>
                                        <span className={styles.reasoningToggleRight}>
                                          <span>
                                            {isReasoningCollapsed
                                              ? t('expandThinking')
                                              : t('collapseThinking')}
                                          </span>
                                          <ChevronDown
                                            className={cn(
                                              'h-3.5 w-3.5 transition-transform duration-200',
                                              !isReasoningCollapsed && 'rotate-180'
                                            )}
                                          />
                                        </span>
                                      </button>

                                      <AnimatePresence initial={false}>
                                        {!isReasoningCollapsed ? (
                                          <motion.div
                                            key={`${message.id}-reasoning-content`}
                                            className={styles.reasoningContentMotion}
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                                          >
                                            <div className={styles.reasoningContent}>
                                              <ChatMarkdown content={reasoningText} />
                                            </div>
                                          </motion.div>
                                        ) : null}
                                      </AnimatePresence>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {showInitialThinkingPlaceholder ? (
                          <div className={styles.thinkingStatus}>
                            <Brain className="h-3.5 w-3.5" />
                            <span className={styles.thinkingDot} aria-hidden="true" />
                            <span>{t('thinking')}</span>
                          </div>
                        ) : null}

                        {hasMessageContent ? (
                          isStreamingMessage ? (
                            <motion.div
                              key={`${message.id}-stream`}
                              className={styles.assistantResponsePlain}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.22, ease: 'easeOut' }}
                            >
                              <ChatMarkdown content={message.content} isUser={isUser} />
                            </motion.div>
                          ) : (
                            <div className={styles.assistantResponsePlain}>
                              <ChatMarkdown content={message.content} isUser={isUser} />
                            </div>
                          )
                        ) : null}

                        {projectPromptSuggestions.length > 0 ? (
                          <>
                            {projectPromptSuggestions.map((projectPromptSuggestion, suggestionIndex) => {
                              const suggestionKey = `${message.id}:${suggestionIndex}`
                              const isCreatingProjectPrompt = creatingProjectPromptMessageId === suggestionKey
                              const projectPromptAlreadySaved = savedProjectPromptMessageIds[suggestionKey] === true

                              return (
                                <div key={suggestionKey} className={styles.projectPromptActionCard}>
                                  <div className={styles.projectPromptActionHead}>
                                    <div>
                                      <p className={styles.projectPromptActionEyebrow}>
                                        {projectPromptSuggestion.action === 'upsert_project_master_image_prompt'
                                          ? t('projectPromptSuggestionMasterTitle')
                                          : t('projectPromptSuggestionTitle')}
                                      </p>
                                      <p className={styles.projectPromptActionTitle}>
                                        {projectPromptSuggestion.title}
                                      </p>
                                    </div>
                                    <span className={styles.projectPromptActionType}>
                                      {projectPromptSuggestion.action === 'upsert_project_master_image_prompt'
                                        ? t('projectPromptSuggestionTypeMasterImage')
                                        : projectPromptSuggestion.type === 'video'
                                        ? t('projectPromptSuggestionTypeVideo')
                                        : t('projectPromptSuggestionTypeImage')}
                                    </span>
                                  </div>

                                  <p className={styles.projectPromptActionPrompt}>
                                    {projectPromptSuggestion.prompt}
                                  </p>

                                  <div className={styles.projectPromptActionFooter}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleApplyProjectPromptSuggestion(
                                          message,
                                          projectPromptSuggestion,
                                          suggestionIndex
                                        )
                                      }}
                                      disabled={
                                        projectPromptAlreadySaved ||
                                        isCreatingProjectPrompt ||
                                        !activeProjectContext
                                      }
                                      className={cn(
                                        styles.projectPromptActionBtn,
                                        projectPromptAlreadySaved && styles.projectPromptActionBtnSaved
                                      )}
                                    >
                                      {projectPromptAlreadySaved
                                        ? projectPromptSuggestion.action === 'upsert_project_master_image_prompt'
                                          ? t('projectPromptSuggestionMasterUpdated')
                                          : t('projectPromptSuggestionAdded')
                                        : isCreatingProjectPrompt
                                          ? projectPromptSuggestion.action === 'upsert_project_master_image_prompt'
                                            ? t('projectPromptSuggestionMasterUpdating')
                                            : t('projectPromptSuggestionSaving')
                                          : projectPromptSuggestion.action === 'upsert_project_master_image_prompt'
                                            ? t('projectPromptSuggestionUpdateMaster')
                                            : projectPromptSuggestion.type === 'video'
                                              ? t('projectPromptSuggestionAddVideo')
                                              : t('projectPromptSuggestionAddImage')}
                                    </button>

                                    {!activeProjectContext ? (
                                      <span className={styles.projectPromptActionHint}>
                                        {t('projectPromptSuggestionProjectMissing')}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </>
                        ) : null}

                        {mediaAgentMetadata ? (
                        <div className={styles.imageAgentMetaWrap}>
                          {hasMediaAgentPromptCard ? (
                            <div className={styles.imageAgentMetaCard}>
                              <div className={styles.imageAgentMetaHead}>
                                <div>
                                  <p className={styles.imageAgentMetaEyebrow}>
                                    {mediaAgentMetadata.status === 'ready'
                                      ? isZh
                                        ? mediaAgentMetadata.autoCreated
                                          ? '已自动提交'
                                          : '等待确认'
                                        : mediaAgentMetadata.autoCreated
                                          ? 'Submitted Automatically'
                                          : 'Awaiting Confirmation'
                                      : isZh
                                        ? '智能体正在细化'
                                        : 'Agent Refining'}
                                  </p>
                                  <p className={styles.imageAgentMetaTitle}>
                                    {mediaAgentMetadata.modelType === 'video'
                                      ? isZh
                                        ? '优化后的视频提示词'
                                        : 'Optimized Video Prompt'
                                      : isZh
                                        ? '优化后的图片提示词'
                                        : 'Optimized Image Prompt'}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => void handleCopyImageAgentPrompt(mediaAgentMetadata.optimizedPrompt || '')}
                                  className={styles.imageAgentMetaCopy}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>{t('copy')}</span>
                                </button>
                              </div>

                              <div className={styles.imageAgentMetaTags}>
                                <span className={styles.imageAgentMetaTag}>{mediaAgentMetadata.modelName}</span>
                                <span className={styles.imageAgentMetaTag}>
                                  {mediaAgentMetadata.preferredAspectRatio
                                    ? `${isZh ? '比例' : 'Ratio'} ${mediaAgentMetadata.preferredAspectRatio}`
                                    : isZh
                                      ? '自动比例'
                                      : 'Auto ratio'}
                                </span>
                                {mediaAgentMetadata.preferredResolution ? (
                                  <span className={styles.imageAgentMetaTag}>
                                    {isZh
                                      ? `分辨率 ${mediaAgentMetadata.preferredResolution}`
                                      : `Resolution ${mediaAgentMetadata.preferredResolution}`}
                                  </span>
                                ) : null}
                                {mediaAgentMetadata.preferredDuration ? (
                                  <span className={styles.imageAgentMetaTag}>
                                    {isZh
                                      ? `时长 ${mediaAgentMetadata.preferredDuration}`
                                      : `Duration ${mediaAgentMetadata.preferredDuration}`}
                                  </span>
                                ) : null}
                                {mediaAgentMetadata.referenceImageCount > 0 ? (
                                  <span className={styles.imageAgentMetaTag}>
                                    {isZh
                                      ? `图片 ${mediaAgentMetadata.referenceImageCount}`
                                      : `${mediaAgentMetadata.referenceImageCount} image reference${mediaAgentMetadata.referenceImageCount > 1 ? 's' : ''}`}
                                  </span>
                                ) : null}
                                {mediaAgentMetadata.referenceVideoCount > 0 ? (
                                  <span className={styles.imageAgentMetaTag}>
                                    {isZh
                                      ? `视频 ${mediaAgentMetadata.referenceVideoCount}`
                                      : `${mediaAgentMetadata.referenceVideoCount} video reference${mediaAgentMetadata.referenceVideoCount > 1 ? 's' : ''}`}
                                  </span>
                                ) : null}
                                {mediaAgentMetadata.referenceAudioCount > 0 ? (
                                  <span className={styles.imageAgentMetaTag}>
                                    {isZh
                                      ? `音频 ${mediaAgentMetadata.referenceAudioCount}`
                                      : `${mediaAgentMetadata.referenceAudioCount} audio reference${mediaAgentMetadata.referenceAudioCount > 1 ? 's' : ''}`}
                                  </span>
                                ) : null}
                              </div>

                              <p className={styles.imageAgentMetaPrompt}>
                                {mediaAgentMetadata.optimizedPrompt}
                              </p>

                              {mediaAgentMetadata.negativePrompt ? (
                                <p className={styles.imageAgentMetaNegative}>
                                  <span>{isZh ? '负面提示词：' : 'Negative prompt: '}</span>
                                  {mediaAgentMetadata.negativePrompt}
                                </p>
                              ) : null}

                              {mediaAgentMetadata.status === 'ready' && !mediaAgentMetadata.autoCreated ? (
                                <div className={styles.imageAgentActions}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleConfirmMediaAgentTask(message)
                                    }}
                                    disabled={isConfirmingMediaTask || isSending || isSwitchingModel}
                                    className={styles.imageAgentPrimaryBtn}
                                  >
                                    <Check className="h-4 w-4" />
                                    <span>
                                      {isConfirmingMediaTask
                                        ? isZh
                                          ? '提交中...'
                                          : 'Submitting...'
                                        : mediaAgentMetadata.modelType === 'video'
                                          ? isZh
                                            ? '确认生成视频'
                                            : 'Confirm Video'
                                          : isZh
                                            ? '确认生成图片'
                                            : 'Confirm Image'}
                                    </span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {hasMediaAgentSuggestions ? (
                            <div className={styles.imageAgentSuggestionList}>
                              {mediaAgentMetadata.suggestedReplies.map((reply, replyIndex) => (
                                <button
                                  key={`${message.id}-reply-${replyIndex}`}
                                  type="button"
                                  onClick={() => {
                                    void handleSendImageAgentSuggestion(reply)
                                  }}
                                  disabled={isSending || isSwitchingModel || isUploadingFiles || isUploadingAgentReferences}
                                  className={styles.imageAgentSuggestionBtn}
                                >
                                  {reply}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                        {autoProjectMetadata?.workflow ? (
                          <AutoProjectWorkflowCard
                            metadata={autoProjectMetadata}
                            isZh={isZh}
                            taskRefs={message.taskRefs}
                            storyboardTaskRefs={storyboardTaskRefs}
                            storyboardStatusByShotId={
                              autoProjectMetadata.projectId
                                ? storyboardStatusByProjectId[autoProjectMetadata.projectId] ?? {}
                                : {}
                            }
                            disabled={isSending || isSwitchingModel || isUploadingFiles || isUploadingAgentReferences}
                            onAction={(content, metadata) => {
                              void handleSendAutoProjectAction(content, metadata)
                            }}
                            onMergeStoryboard={(metadata) => {
                              void handleMergeAutoProjectStoryboard(metadata)
                            }}
                            isMergingStoryboard={mergingStoryboardProjectId === autoProjectMetadata.projectId}
                          />
                        ) : null}

                        {message.images.length > 0 ? (
                          <div className={cn(styles.imageGrid, message.images.length > 1 && styles.imageGridMulti)}>
                            {message.images.map((image, index) => (
                              <img
                                key={`${message.id}-${index}`}
                                src={image}
                                alt={`chat-image-${index + 1}`}
                                className={styles.messageImage}
                              />
                            ))}
                          </div>
                        ) : null}

                        {message.files.length > 0 ? (
                          <div className={styles.fileList}>
                            {message.files.map((file) => {
                              const ext = normalizeExtension(file.fileName, file.extension)
                              return (
                                <div key={file.id} className={styles.fileCard}>
                                  <div className={styles.fileCardIcon}>
                                    <FileIcon extension={ext} />
                                  </div>
                                  <div className={styles.fileCardMeta}>
                                    <p className={styles.fileCardName}>{file.fileName}</p>
                                    <p className={styles.fileCardSub}>
                                      {ext ? ext.toUpperCase() : 'FILE'} · {formatFileSize(file.fileSize)}
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}

                        {message.taskRefs.length > 0 ? (
                          <div className={styles.taskCardList}>
                            {message.taskRefs.map((taskRef) => {
                              const taskKey = `${taskRef.kind}:${taskRef.taskId}`
                              const isCancellingTask = cancellingTaskKeys.includes(taskKey)
                              const showCancelTaskButton =
                                taskRef.kind === 'video' &&
                                taskRef.cancelSupported === true &&
                                (taskRef.status === 'pending' || taskRef.status === 'processing')

                              return (
                                <div key={`${message.id}-${taskRef.taskId}`} className={styles.taskCard}>
                                  <div className={styles.taskCardHead}>
                                    <div className={styles.taskCardTitleWrap}>
                                      <span className={styles.taskCardTitle}>
                                        {taskRef.kind === 'video'
                                          ? isZh
                                            ? '视频任务'
                                            : 'Video Task'
                                          : t('imageMode.cardTitle')}
                                      </span>
                                      {taskRef.taskNo ? (
                                        <span className={styles.taskCardMeta}>#{taskRef.taskNo}</span>
                                      ) : null}
                                    </div>
                                    <span
                                      className={cn(
                                        styles.taskCardStatus,
                                        taskRef.status === 'completed' && styles.taskCardStatusCompleted,
                                        taskRef.status === 'failed' && styles.taskCardStatusFailed,
                                        (taskRef.status === 'pending' || taskRef.status === 'processing') &&
                                          styles.taskCardStatusRunning
                                      )}
                                    >
                                      {taskRef.status === 'completed'
                                        ? t('imageMode.status.completed')
                                        : taskRef.status === 'failed'
                                          ? t('imageMode.status.failed')
                                          : taskRef.status === 'processing'
                                            ? t('imageMode.status.processing')
                                            : t('imageMode.status.pending')}
                                    </span>
                                  </div>

                                  {taskRef.kind === 'video' && taskRef.resultUrl ? (
                                    <video
                                      src={taskRef.resultUrl}
                                      className={styles.taskCardImage}
                                      controls
                                      muted
                                      playsInline
                                      preload="metadata"
                                    />
                                  ) : taskRef.resultUrl || taskRef.thumbnailUrl ? (
                                    <img
                                      src={taskRef.resultUrl || taskRef.thumbnailUrl || ''}
                                      alt={taskRef.prompt || 'generated-media-task'}
                                      className={styles.taskCardImage}
                                    />
                                  ) : null}

                                  {taskRef.prompt ? (
                                    <p className={styles.taskCardPrompt}>{taskRef.prompt}</p>
                                  ) : null}

                                  {taskRef.errorMessage ? (
                                    <p className={styles.taskCardError}>{taskRef.errorMessage}</p>
                                  ) : null}

                                  <div className={styles.taskCardActions}>
                                    {showCancelTaskButton ? (
                                      <button
                                        type="button"
                                        className={styles.taskCardBtn}
                                        disabled={isCancellingTask}
                                        onClick={() => {
                                          void handleCancelVideoTask(taskRef)
                                        }}
                                      >
                                        {isCancellingTask ? t('imageMode.cancellingTask') : t('imageMode.cancelTask')}
                                      </button>
                                    ) : null}
                                    {taskRef.resultUrl ? (
                                      <button
                                        type="button"
                                        className={styles.taskCardBtn}
                                        onClick={() =>
                                          window.open(taskRef.resultUrl || '', '_blank', 'noopener,noreferrer')
                                        }
                                      >
                                        {taskRef.kind === 'video'
                                          ? isZh
                                            ? '查看视频'
                                            : 'Open Video'
                                          : t('imageMode.openImage')}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className={styles.taskCardBtn}
                                      onClick={() => router.push(`/${locale}/tasks`)}
                                    >
                                      {t('imageMode.openTasks')}
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}

                        {hasCitations ? (
                          <div className={styles.citationTags}>
                            {message.citations.map((citation, index) => {
                              const sourceLabel = citation.fileName || 'File Source'

                              return (
                                <button
                                  key={`${message.id}-citation-tag-${index}`}
                                  type="button"
                                  onClick={() =>
                                    setCollapsedCitationsByMessageId((prev) => ({
                                      ...prev,
                                      [message.id]: false,
                                    }))
                                  }
                                  className={styles.citationTagBtn}
                                >
                                  <span className={styles.citationTagIndex}>[{index + 1}]</span>
                                  <span className={styles.citationTagLabel}>{sourceLabel}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}

                        {hasCitations ? (
                          <div className={styles.citationWrap}>
                            <button
                              type="button"
                              onClick={() =>
                                setCollapsedCitationsByMessageId((prev) => ({
                                  ...prev,
                                  [message.id]: !(prev[message.id] ?? true),
                                }))
                              }
                              className={styles.citationToggle}
                            >
                              <span className={styles.citationToggleLeft}>
                                <span className={styles.citationTitle}>{t('citationsTitle')}</span>
                                <span className={styles.citationCount}>{message.citations.length}</span>
                              </span>
                              <span className={styles.citationToggleRight}>
                                <span>
                                  {isCitationCollapsed ? t('expandCitations') : t('collapseCitations')}
                                </span>
                                <ChevronDown
                                  className={cn(
                                    'h-3.5 w-3.5 transition-transform duration-200',
                                    !isCitationCollapsed && 'rotate-180'
                                  )}
                                />
                              </span>
                            </button>

                            <AnimatePresence initial={false}>
                              {!isCitationCollapsed && (
                                <motion.div
                                  key={`${message.id}-citation-list`}
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  <div className={styles.citationList}>
                                    {message.citations.map((citation, index) => (
                                      <div key={`${message.id}-citation-${index}`} className={styles.citationItem}>
                                        <div className={styles.citationHead}>
                                          <span className={styles.citationName}>
                                            <span className={styles.citationNameIndex}>[{index + 1}]</span>
                                            {citation.fileName || 'File Source'}
                                          </span>
                                          {typeof citation.chunkIndex === 'number' ? (
                                            <span className={styles.citationChunk}>Chunk {citation.chunkIndex}</span>
                                          ) : null}
                                        </div>
                                        <p className={styles.citationSnippet}>{citation.snippet}</p>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ) : null}

                        <div className={cn(styles.messageFooter, styles.messageFooterAssistant)}>
                          <div className={styles.messageActions}>
                            <span className={cn(styles.messageMeta, styles.messageMetaAssistant)}>
                              {formatDate(message.createdAt, locale)}
                            </span>
                            {canCopyMessage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  void handleCopyMessage(message)
                                }}
                                className={cn(styles.messageActionBtn, styles.assistantActionBtn)}
                                title={t('copy')}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>{t('copy')}</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          <div className={styles.inputContainer}>
            <motion.div
              layout
              transition={{ duration: 0.26, ease: 'easeOut' }}
              className={cn(styles.inputBox, (isImageMode || isAutoMode) && styles.inputBoxImageMode)}
            >
              <AnimatePresence initial={false} mode="wait">
                {isImageMode ? (
                  <motion.div
                    key="image-composer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className={styles.imageModePanel}
                  >
                    <div className={styles.imageComposer}>
                      {agentReferenceVideos.length > 0 || agentReferenceAudios.length > 0 ? (
                        <div className={styles.pendingFiles}>
                          {[...agentReferenceVideos, ...agentReferenceAudios].map((item) => (
                            <div key={item.id} className={styles.pendingFileCard}>
                              <div className={styles.pendingFileIcon}>
                                {item.kind === 'video' ? <Square className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              </div>
                              <div className={styles.pendingFileMeta}>
                                <p className={styles.pendingFileName}>{item.name}</p>
                                <p className={styles.pendingFileSub}>
                                  {item.kind === 'video'
                                    ? isZh
                                      ? '视频参考'
                                      : 'Video reference'
                                    : isZh
                                      ? '音频参考'
                                      : 'Audio reference'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setAgentReferences((prev) => prev.filter((reference) => reference.id !== item.id))
                                }
                                className={styles.removePendingFileBtn}
                                title={isZh ? '移除素材' : 'Remove reference'}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className={styles.imageComposerBody}>
                        <div className={styles.imageComposerRail}>
                          <div className={styles.toolsMenuWrap} ref={agentUploadMenuRef}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!canOpenAgentUploadMenu) return
                                setIsAgentUploadMenuOpen((prev) => !prev)
                              }}
                              className={cn(
                                styles.imageComposerUploadTile,
                                !canOpenAgentUploadMenu && styles.imageComposerUploadTileDisabled
                              )}
                              title={t('attachMenu')}
                              disabled={!canOpenAgentUploadMenu}
                            >
                              <span className={styles.imageComposerUploadTileInner}>
                                <AgentUploadTileIcon className="h-5 w-5" />
                                <span className={styles.imageComposerUploadTitle}>{agentUploadTileInfo.label}</span>
                                {agentUploadTileInfo.meta ? (
                                  <span className={styles.imageComposerUploadMeta}>{agentUploadTileInfo.meta}</span>
                                ) : null}
                              </span>
                            </button>

                            {isAgentUploadMenuOpen ? (
                              <div className={styles.toolsMenu}>
                                {selectedAgentReferenceLimits.images > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      imageInputRef.current?.click()
                                      setIsAgentUploadMenuOpen(false)
                                    }}
                                    disabled={isUploadingAgentReferences}
                                    className={cn(
                                      styles.toolsMenuItem,
                                      isUploadingAgentReferences && styles.toolsMenuItemDisabled
                                    )}
                                  >
                                    <span className={styles.toolsMenuItemLeft}>
                                      <ImagePlus className="h-4 w-4" />
                                      <span>{t('menuUploadImage')}</span>
                                    </span>
                                    <span className={styles.toolsMenuItemMeta}>
                                      {agentReferenceImages.length}/{selectedAgentEffectiveImageLimit}
                                    </span>
                                  </button>
                                ) : null}

                                {selectedAgentReferenceLimits.videos > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      videoInputRef.current?.click()
                                      setIsAgentUploadMenuOpen(false)
                                    }}
                                    disabled={isUploadingAgentReferences}
                                    className={cn(
                                      styles.toolsMenuItem,
                                      isUploadingAgentReferences && styles.toolsMenuItemDisabled
                                    )}
                                  >
                                    <span className={styles.toolsMenuItemLeft}>
                                      <Square className="h-4 w-4" />
                                      <span>{isZh ? '上传视频' : 'Upload Video'}</span>
                                    </span>
                                    <span className={styles.toolsMenuItemMeta}>
                                      {agentReferenceVideos.length}/{selectedAgentEffectiveVideoLimit}
                                    </span>
                                  </button>
                                ) : null}

                                {selectedAgentReferenceLimits.audios > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      audioInputRef.current?.click()
                                      setIsAgentUploadMenuOpen(false)
                                    }}
                                    disabled={isUploadingAgentReferences}
                                    className={cn(
                                      styles.toolsMenuItem,
                                      isUploadingAgentReferences && styles.toolsMenuItemDisabled
                                    )}
                                  >
                                    <span className={styles.toolsMenuItemLeft}>
                                      <FileText className="h-4 w-4" />
                                      <span>{isZh ? '上传音频' : 'Upload Audio'}</span>
                                    </span>
                                    <span className={styles.toolsMenuItemMeta}>
                                      {agentReferenceAudios.length}/{selectedAgentDisplayAudioLimit}
                                    </span>
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {agentReferenceImages.length > 0 ? (
                            <div className={styles.imageComposerThumbList}>
                              {agentReferenceImages.map((item) => (
                                <div key={item.id} className={styles.imageComposerThumbItem}>
                                  <img src={item.url} alt={item.name} className={styles.imageComposerThumb} />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAgentReferences((prev) => prev.filter((reference) => reference.id !== item.id))
                                    }
                                    className={styles.imageComposerThumbRemove}
                                    title={t('removeImage')}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.imageComposerMain}>
                          <textarea
                            ref={composerRef}
                            value={composer}
                            onChange={(event) => setComposer(event.target.value)}
                            onInput={resizeComposer}
                            onCompositionStart={() => setIsComposerComposing(true)}
                            onCompositionEnd={() => setIsComposerComposing(false)}
                            onBlur={() => setIsComposerComposing(false)}
                            onKeyDown={handleComposerKeyDown}
                            placeholder={t('imageMode.inputPlaceholder')}
                            className={cn(styles.textarea, styles.textareaImage)}
                            rows={4}
                          />

                          <div className={styles.imageComposerToolbar}>
                            <div className={styles.imageComposerToolbarLeft}>
                              <EnhancedSelect
                                value={selectedAgentModelId}
                                onChange={setSelectedAgentModelId}
                                options={agentModelOptions}
                                placeholder={t('imageMode.modelPlaceholder')}
                                disabled={agentModelOptions.length === 0 || isSending || isSwitchingModel || isUploadingAgentReferences}
                                compact
                                className={cn(styles.inlineModelSelect, styles.inlineModelSelectCompact)}
                              />

                              <button
                                type="button"
                                onClick={() => setIsAgentSettingsModalOpen(true)}
                                disabled={!selectedAgentModelId}
                                className={cn(
                                  styles.preferenceChip,
                                  styles.preferenceChipCompact,
                                  isAgentSettingsModalOpen && styles.preferenceChipActive,
                                  !selectedAgentModelId && styles.preferenceChipDisabled
                                )}
                              >
                                <SlidersHorizontal className="h-4 w-4" />
                                <span>{agentSettingsTriggerLabel}</span>
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (canSend) {
                                  void handleSend()
                                }
                              }}
                              disabled={!canSend}
                              className={cn(
                                styles.imageComposerSend,
                                styles.imageComposerSendCompact,
                                canSend && styles.imageComposerSendActive
                              )}
                              title={t('send')}
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                  </motion.div>
                ) : isAutoMode ? (
                  <motion.div
                    key="auto-composer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className={styles.imageModePanel}
                  >
                    <div className={styles.imageComposer}>
                      <div className={styles.imageComposerMain}>
                        <textarea
                          ref={composerRef}
                          value={composer}
                          onChange={(event) => setComposer(event.target.value)}
                          onInput={resizeComposer}
                          onCompositionStart={() => setIsComposerComposing(true)}
                          onCompositionEnd={() => setIsComposerComposing(false)}
                          onBlur={() => setIsComposerComposing(false)}
                          onKeyDown={handleComposerKeyDown}
                          placeholder={t('autoMode.inputPlaceholder')}
                          className={cn(styles.textarea, styles.textareaImage)}
                          rows={4}
                        />

                        <div className={cn(styles.imageComposerToolbar, styles.autoComposerToolbar)}>
                          <div className={cn(styles.imageComposerToolbarLeft, styles.autoComposerToolbarLeft)}>
                            <EnhancedSelect
                              value={selectedAutoProjectId}
                              onChange={setSelectedAutoProjectId}
                              options={autoProjectOptions}
                              placeholder={t('autoMode.projectPlaceholder')}
                              disabled={isSending || isSwitchingModel || isUploadingAgentReferences}
                              compact
                              className={cn(styles.inlineModelSelect, styles.inlineModelSelectCompact)}
                            />

                            <EnhancedSelect
                              value={selectedAutoImageModelId}
                              onChange={setSelectedAutoImageModelId}
                              options={autoImageModelOptions}
                              placeholder={t('autoMode.imageModelPlaceholder')}
                              disabled={autoImageModelOptions.length === 0 || isSending || isSwitchingModel || isUploadingAgentReferences}
                              compact
                              className={cn(styles.inlineModelSelect, styles.inlineModelSelectCompact)}
                            />

                            <EnhancedSelect
                              value={selectedAutoVideoModelId}
                              onChange={setSelectedAutoVideoModelId}
                              options={autoVideoModelOptions}
                              placeholder={t('autoMode.videoModelPlaceholder')}
                              disabled={autoVideoModelOptions.length === 0 || isSending || isSwitchingModel || isUploadingAgentReferences}
                              compact
                              className={cn(styles.inlineModelSelect, styles.inlineModelSelectCompact)}
                            />

                            <div className={styles.autoComposerInlinePreference}>
                              <span className={styles.autoComposerPreferenceLabel}>
                                {isZh ? '分镜视频生成分辨率' : 'Storyboard Video Resolution'}
                                {isAutoVideoResolutionLocked ? ` (${isZh ? '已锁定' : 'Locked'})` : ''}
                              </span>
                              <EnhancedSelect
                                value={selectedAutoVideoResolution}
                                onChange={setSelectedAutoVideoResolution}
                                options={autoVideoResolutionSelectOptions}
                                placeholder={selectedAutoVideoResolutionOption?.label || (isZh ? '模型默认' : 'Model Default')}
                                disabled={
                                  autoVideoResolutionSelectOptions.length === 0 ||
                                  isSending ||
                                  isSwitchingModel ||
                                  isUploadingAgentReferences ||
                                  isAutoVideoResolutionLocked
                                }
                                compact
                                className={cn(
                                  styles.inlineModelSelect,
                                  styles.inlineModelSelectCompact,
                                  styles.autoComposerPreferenceSelect
                                )}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (showStopButton) {
                                handleStopResponding()
                                return
                              }
                              if (canSend) {
                                void handleSend()
                              }
                            }}
                            disabled={!showStopButton && !canSend}
                            className={cn(
                              styles.imageComposerSend,
                              styles.imageComposerSendCompact,
                              (canSend || showStopButton) && styles.imageComposerSendActive,
                              showStopButton && styles.btnStop
                            )}
                            title={showStopButton ? t('stopResponding') : t('send')}
                          >
                            {showStopButton ? (
                              <Square className="h-4 w-4 fill-current" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat-composer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className={styles.chatComposer}
                  >
                    {pendingImages.length > 0 ? (
                      <div className={styles.pendingImages}>
                        {pendingImages.map((image, index) => (
                          <div key={`${image.slice(0, 32)}-${index}`} className={styles.pendingItem}>
                            <img src={image} alt={`pending-${index + 1}`} className={styles.pendingImage} />
                            <button
                              type="button"
                              onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== index))}
                              className={styles.removePendingBtn}
                              title={t('removeImage')}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {pendingFiles.length > 0 ? (
                      <div className={styles.pendingFiles}>
                        {pendingFiles.map((file, index) => {
                          const ext = normalizeExtension(file.fileName, file.extension)
                          return (
                            <div key={`${file.id}-${index}`} className={styles.pendingFileCard}>
                              <div className={styles.pendingFileIcon}>
                                <FileIcon extension={ext} />
                              </div>
                              <div className={styles.pendingFileMeta}>
                                <p className={styles.pendingFileName}>{file.fileName}</p>
                                <p className={styles.pendingFileSub}>
                                  {ext ? ext.toUpperCase() : 'FILE'} · {formatFileSize(file.fileSize)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                                className={styles.removePendingFileBtn}
                                title={t('removeFile')}
                              >
                                ×
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}

                    {activeProjectContext ? (
                      <div className={styles.projectContextBanner}>
                        <div className={styles.projectContextBannerText}>
                          <span className={styles.projectContextBannerLabel}>
                            {t('importedProjectLabel')}
                          </span>
                          <span className={styles.projectContextBannerName}>
                            {activeProjectContext.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void handleRemoveProjectContext()
                          }}
                          disabled={isUpdatingProjectContext}
                          className={styles.projectContextBannerBtn}
                        >
                          {isUpdatingProjectContext ? t('sending') : t('importProjectRemove')}
                        </button>
                      </div>
                    ) : null}

                    <div className={styles.chatComposerRow}>
                      <div className={styles.chatComposerLeft}>
                        <div className={styles.toolsMenuWrap} ref={attachmentMenuRef}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canOpenAttachmentMenu) return
                              setIsAttachmentMenuOpen((prev) => !prev)
                            }}
                            className={cn(
                              styles.btnIcon,
                              styles.toolsMenuTrigger,
                              isAttachmentMenuOpen && styles.btnIconActive
                            )}
                            title={t('attachMenu')}
                            disabled={!canOpenAttachmentMenu}
                          >
                            <Plus className="h-5 w-5" />
                          </button>

                          {isAttachmentMenuOpen ? (
                            <div className={styles.toolsMenu}>
                              <button
                                type="button"
                                onClick={handleOpenProjectContextModal}
                                disabled={isUpdatingProjectContext}
                                className={cn(
                                  styles.toolsMenuItem,
                                  isUpdatingProjectContext && styles.toolsMenuItemDisabled
                                )}
                              >
                                <span className={styles.toolsMenuItemLeft}>
                                  <FolderOpen className="h-4 w-4" />
                                  <span>{t('menuImportProject')}</span>
                                </span>
                                <span className={styles.toolsMenuItemMeta}>
                                  {activeProjectContext?.name || ''}
                                </span>
                              </button>

                              {supportsImageUpload ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    imageInputRef.current?.click()
                                    setIsAttachmentMenuOpen(false)
                                  }}
                                  className={styles.toolsMenuItem}
                                >
                                  <span className={styles.toolsMenuItemLeft}>
                                    <ImagePlus className="h-4 w-4" />
                                    <span>{t('menuUploadImage')}</span>
                                  </span>
                                  <span className={styles.toolsMenuItemMeta}>
                                    {pendingImages.length > 0 ? pendingImages.length : ''}
                                  </span>
                                </button>
                              ) : null}

                              {supportsFileUpload ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    docInputRef.current?.click()
                                    setIsAttachmentMenuOpen(false)
                                  }}
                                  disabled={isUploadingFiles}
                                  className={cn(
                                    styles.toolsMenuItem,
                                    isUploadingFiles && styles.toolsMenuItemDisabled
                                  )}
                                >
                                  <span className={styles.toolsMenuItemLeft}>
                                    <Paperclip className="h-4 w-4" />
                                    <span>{t('menuUploadFile')}</span>
                                  </span>
                                  <span className={styles.toolsMenuItemMeta}>
                                    {isUploadingFiles ? t('uploadingFile') : pendingFiles.length > 0 ? pendingFiles.length : ''}
                                  </span>
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <textarea
                        ref={composerRef}
                        value={composer}
                        onChange={(event) => setComposer(event.target.value)}
                        onInput={resizeComposer}
                        onCompositionStart={() => setIsComposerComposing(true)}
                        onCompositionEnd={() => setIsComposerComposing(false)}
                        onBlur={() => setIsComposerComposing(false)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={t('inputPlaceholder')}
                        className={styles.textarea}
                        rows={1}
                      />

                      <div className={styles.chatComposerRight}>
                        <button
                          type="button"
                          onClick={() => {
                            if (showStopButton) {
                              handleStopResponding()
                              return
                            }
                            if (canSend) {
                              void handleSend()
                            }
                          }}
                          disabled={!showStopButton && !canSend}
                          className={cn(
                            styles.btnSend,
                            (canSend || showStopButton) && styles.btnSendActive,
                            showStopButton && styles.btnStop
                          )}
                          title={showStopButton ? t('stopResponding') : t('send')}
                        >
                          {showStopButton ? (
                            <Square className="h-[15px] w-[15px] fill-current" />
                          ) : (
                            <Send className="h-[17px] w-[17px]" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </main>

        <Modal
          isOpen={isProjectContextModalOpen}
          onClose={() => setIsProjectContextModalOpen(false)}
          title={t('importProjectTitle')}
          size="sm"
        >
          <div className={styles.projectContextModal}>
            <p className={styles.projectContextModalDesc}>
              {t('importProjectDescription')}
            </p>

            {projects.length > 0 ? (
              <EnhancedSelect
                value={selectedProjectContextId}
                onChange={setSelectedProjectContextId}
                options={projectContextOptions}
                placeholder={t('importProjectPlaceholder')}
                disabled={isUpdatingProjectContext}
              />
            ) : (
              <div className={styles.projectContextModalEmpty}>
                <p className={styles.projectContextModalEmptyTitle}>
                  {t('importProjectEmpty')}
                </p>
                <p className={styles.projectContextModalEmptyDesc}>
                  {t('importProjectEmptyHint')}
                </p>
              </div>
            )}

            <div className={styles.projectContextModalActions}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsProjectContextModalOpen(false)}
                disabled={isUpdatingProjectContext}
              >
                {t('renameCancel')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  void handleApplyProjectContext()
                }}
                disabled={isUpdatingProjectContext || (projects.length === 0 && !activeProjectContext)}
              >
                {isUpdatingProjectContext ? t('sending') : t('importProjectApply')}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={isAgentSettingsModalOpen}
          onClose={() => setIsAgentSettingsModalOpen(false)}
          title={selectedAgentModel?.type === 'video' ? (isZh ? '视频参数' : 'Video Settings') : (isZh ? '图片参数' : 'Image Settings')}
          size="lg"
        >
          <div className="space-y-5">
            <div className="space-y-3">
              <p className={styles.imagePreferencesTitle}>{isZh ? '比例' : 'Aspect Ratio'}</p>
              <div className={styles.aspectRatioGrid}>
                {agentAspectRatioOptions.map((option) => {
                  const Icon = option.icon
                  const isActive = option.value === selectedAgentAspectRatio
                  const previewSize = getAspectRatioPreviewSize(option)
                  return (
                    <button
                      key={`agent-ratio-${option.value}`}
                      type="button"
                      onClick={() => setSelectedAgentAspectRatio(option.value)}
                      className={cn(
                        styles.aspectRatioOption,
                        isActive && styles.aspectRatioOptionActive
                      )}
                    >
                      <span className={styles.aspectRatioPreviewBox}>
                        {option.value === AUTO_AGENT_OPTION_VALUE ? (
                          <Icon className="h-4 w-4" />
                        ) : option.width && option.height ? (
                          <span className={styles.aspectRatioPreviewShape} style={previewSize} />
                        ) : (
                          <Icon className="h-4 w-4" />
                        )}
                      </span>
                      <span className={styles.aspectRatioOptionLabel}>{option.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {agentResolutionOptions.length > 1 ? (
              <div className="space-y-3">
                <p className={styles.imagePreferencesTitle}>{isZh ? '分辨率' : 'Resolution'}</p>
                <div className={styles.aspectRatioGrid}>
                  {agentResolutionOptions.map((option) => {
                    const Icon = option.icon
                    const isActive = option.value === selectedAgentResolution
                    return (
                      <button
                        key={`agent-resolution-${option.value}`}
                        type="button"
                        onClick={() => setSelectedAgentResolution(option.value)}
                        className={cn(
                          styles.aspectRatioOption,
                          isActive && styles.aspectRatioOptionActive
                        )}
                      >
                        <span className={styles.aspectRatioPreviewBox}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className={styles.aspectRatioOptionLabel}>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {selectedAgentModelType === 'video' && agentDurationOptions.length > 1 ? (
              <div className="space-y-3">
                <p className={styles.imagePreferencesTitle}>{isZh ? '时长' : 'Duration'}</p>
                <div className={styles.aspectRatioGrid}>
                  {agentDurationOptions.map((option) => {
                    const Icon = option.icon
                    const isActive = option.value === selectedAgentDuration
                    return (
                      <button
                        key={`agent-duration-${option.value}`}
                        type="button"
                        onClick={() => setSelectedAgentDuration(option.value)}
                        className={cn(
                          styles.aspectRatioOption,
                          isActive && styles.aspectRatioOptionActive
                        )}
                      >
                        <span className={styles.aspectRatioPreviewBox}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className={styles.aspectRatioOptionLabel}>{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button type="button" onClick={() => setIsAgentSettingsModalOpen(false)}>
                {isZh ? '完成' : 'Done'}
              </Button>
            </div>
          </div>
        </Modal>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (event) => {
            await handleUploadImages(event.target.files)
            event.target.value = ''
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={async (event) => {
            await handleUploadAgentSeedanceInputs('video', event.target.files, selectedAgentReferenceLimits.videos)
            event.target.value = ''
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={async (event) => {
            await handleUploadAgentSeedanceInputs('audio', event.target.files, selectedAgentReferenceLimits.audios)
            event.target.value = ''
          }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept={allowedFileExtensions.map((ext) => `.${ext}`).join(',')}
          multiple
          className="hidden"
          onChange={async (event) => {
            await handleUploadFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
    </PageTransition>
  )
}
