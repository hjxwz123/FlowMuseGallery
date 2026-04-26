/**
 * 管理员 - API 渠道管理类型定义（匹配后端 API）
 */

// 渠道状态
export type ChannelStatus = 'active' | 'disabled'

// API 渠道
export interface Channel {
  id: string
  name: string
  provider: string // 提供商标识
  baseUrl: string
  apiKey: string | null // configured 表示已配置，null 表示未配置
  apiSecret: string | null // 个人版固定为 null
  extraHeaders: Record<string, string> | null
  timeout: number // 超时时间(ms)
  maxRetry: number // 最大重试次数
  rateLimit: number | null // 每分钟速率限制
  status: ChannelStatus
  priority: number // 优先级（越小越优先）
  description: string | null
  createdAt: string
  updatedAt: string
}

// 创建渠道 DTO
export interface CreateChannelDto {
  name: string
  provider: string
  baseUrl: string
  apiKey?: string | null
  apiSecret?: string | null
  extraHeaders?: Record<string, string> | null
  timeout?: number
  maxRetry?: number
  rateLimit?: number | null
  status?: ChannelStatus
  priority?: number
  description?: string | null
}

// 更新渠道 DTO
export interface UpdateChannelDto {
  name?: string
  provider?: string
  baseUrl?: string
  apiKey?: string | null
  apiSecret?: string | null
  extraHeaders?: Record<string, string> | null
  timeout?: number
  maxRetry?: number
  rateLimit?: number | null
  status?: ChannelStatus
  priority?: number
  description?: string | null
}

// 渠道测试结果
export interface ChannelTestResult {
  ok: boolean
  baseUrl: string
  provider: string
  status?: number
  error?: string
  ms: number
}

// 渠道统计
export interface ChannelStatistics {
  images: {
    total: number
    failed: number
    completed: number
    processing: number
    pending: number
    avgMs: number | null
  }
  videos: {
    total: number
    failed: number
    completed: number
    processing: number
    pending: number
    avgMs: number | null
  }
  health: unknown | null
}
