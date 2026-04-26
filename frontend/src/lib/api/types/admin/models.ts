/**
 * 管理员 - AI 模型管理类型定义（匹配后端 API）
 */

import type { Channel } from './channels'

// 模型类型
export type ModelType = 'image' | 'video' | 'chat'

// AI 模型
export interface Model {
  id: string
  name: string // 模型展示名称
  modelKey: string // 模型标识（唯一）
  icon: string | null
  type: ModelType
  provider: string // 提供商标识
  channelId: string
  defaultParams: Record<string, unknown> | null
  paramConstraints: Record<string, unknown> | null
  isActive: boolean
  sortOrder: number
  description: string | null
  supportsImageInput: boolean | null
  supportsResolutionSelect: boolean | null
  supportsSizeSelect: boolean | null
  supportsQuickMode: boolean | null
  supportsAgentMode: boolean | null
  supportsAutoMode: boolean | null
  maxContextRounds: number | null
  createdAt: string
  updatedAt: string
  // 关联数据
  channel?: Channel
}

// 模型列表筛选参数
export interface ModelFilterParams {
  type?: ModelType
  provider?: string
  isActive?: boolean
}
