/**
 * 图片生成 Images 类型定义
 * 基于 docs/api/08-images.md
 */

// 任务状态
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

// 用户信息（管理员接口返回）
export interface TaskUser {
  id: string
  email: string
  username: string | null
}

// 图片任务（对应后端 serializeImageTask 返回结构）
export interface ImageTask {
  type: 'image'
  id: string
  userId: string
  modelId: string
  channelId: string
  projectId?: string | null
  taskNo: string
  provider: string
  providerTaskId: string | null
  prompt: string
  negativePrompt: string | null
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
  deletedAt?: string | null
  createdAt: string
  user?: TaskUser // 管理员接口会包含用户信息
}

// 图片生成请求 DTO
export interface GenerateImageDto {
  modelId: string
  prompt: string
  negativePrompt?: string
  parameters?: Record<string, unknown>
  projectId?: string
  skipProjectPromptTransform?: boolean
}

// Midjourney 操作请求 DTO
export interface MidjourneyActionDto {
  customId: string
}

// Midjourney Modal 请求 DTO
export interface MidjourneyModalDto {
  prompt?: string
  maskBase64?: string
}

// Midjourney Edits 请求 DTO（新 API）
export interface MidjourneyEditsDto {
  prompt: string
  image: string // 原图 URL
  maskBase64?: string // 蒙版（原图在需要编辑的地方变为透明）
}
