/**
 * 模型 Models 类型定义
 * 基于 docs/api/07-models.md
 */

// 模型类型
export type ModelType = 'image' | 'video' | 'chat'

// 模型
export interface AiModel {
  id: string
  name: string
  modelKey: string
  icon: string | null
  type: ModelType
  provider: string
  channelId: string
  defaultParams: Record<string, unknown> | null
  paramConstraints: Record<string, unknown> | null
  isActive: boolean
  sortOrder: number
  description: string | null
  supportsImageInput: boolean | null
  supportsResolutionSelect: boolean | null
  supportsSizeSelect: boolean | null
  maxContextRounds: number | null
  createdAt: string
  updatedAt: string
  channel?: ApiChannel
}

// API 渠道
export interface ApiChannel {
  id: string
  name: string
  provider: string
  baseUrl: string
  apiKey: string | null
  apiSecret: string | null
  extraHeaders: Record<string, string> | null
  timeout: number
  maxRetry: number
  rateLimit: number | null
  status: 'active' | 'disabled'
  priority: number
  description: string | null
  createdAt: string
  updatedAt: string
}
