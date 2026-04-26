/**
 * 视频生成 Videos 类型定义
 * 基于 docs/api/09-videos.md
 */

import type { TaskStatus, TaskUser } from './images'

// 视频任务（对应后端 serializeVideoTask 返回结构）
export interface VideoTask {
  type: 'video'
  id: string
  userId: string
  modelId: string
  channelId: string
  projectId?: string | null
  taskNo: string
  provider: string
  providerTaskId: string | null
  prompt: string
  negativePrompt: null // 视频任务不支持负面提示词
  parameters?: Record<string, unknown> | null  // 仅在详情接口返回
  providerData?: unknown | null  // 仅部分需要前台继续操作的模型返回
  status: TaskStatus
  resultUrl: string | null
  thumbnailUrl: string | null
  storageKey: string | null
  errorMessage: string | null
  retryCount: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  user?: TaskUser // 管理员接口会包含用户信息
}

// 视频生成请求 DTO
export interface GenerateVideoDto {
  modelId: string
  prompt: string
  negativePrompt?: string
  parameters?: Record<string, unknown>
  projectId?: string
}

export type SeedanceInputUploadKind = 'image' | 'video' | 'audio'
export type ReferenceInputUploadProvider = 'seedance' | 'wanx'

export interface SeedanceUploadedFile {
  kind: SeedanceInputUploadKind
  fileName: string
  url: string
  storageKey: string
  contentType?: string
  size?: number
}

export interface UploadSeedanceInputsResponse {
  files: SeedanceUploadedFile[]
}
