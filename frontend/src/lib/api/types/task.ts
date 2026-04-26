/**
 * 任务相关类型定义
 * 基于 docs/api/00-common.md 5.1 ApiTask
 */

import type { TaskStatus, TaskType } from './common'

// Re-export types needed by other modules
export type { TaskStatus, TaskType }

// API 任务（图片/视频统一结构）
export interface ApiTask {
  type: Extract<TaskType, 'image' | 'video'>
  id: string
  userId: string
  modelId: string
  channelId: string
  projectId?: string | null
  taskNo: string
  provider: string
  modelName?: string | null
  providerTaskId: string | null
  prompt: string
  negativePrompt: string | null
  parameters: Record<string, unknown> | null
  providerData?: Record<string, unknown> | null
  status: TaskStatus
  resultUrl: string | null
  thumbnailUrl: string | null
  storageKey: string | null
  errorMessage: string | null
  retryCount: number
  startedAt: string | null
  completedAt: string | null
  deletedAt: string | null
  createdAt: string
  canCancel?: boolean
  cancelSupported?: boolean
}

// 生成图片 DTO
export interface GenerateImageDto {
  modelId: string
  prompt: string
  negativePrompt?: string
  parameters?: Record<string, unknown>
  projectId?: string
}

// 生成视频 DTO
export interface GenerateVideoDto {
  modelId: string
  prompt: string
  negativePrompt?: string
  parameters?: Record<string, unknown>
  projectId?: string
}

// Midjourney 操作 DTO
export interface MidjourneyActionDto {
  customId: string
}

// Midjourney Modal DTO
export interface MidjourneyModalDto {
  prompt?: string
  maskBase64?: string
}
