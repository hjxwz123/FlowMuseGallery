/**
 * 模型能力类型定义
 * 用于前端根据不同模型显示/隐藏功能
 */

// 操作执行方式
export type OperationExecution = 'sync' | 'async'

// 模型操作
export interface ModelOperation {
  key: string
  execution: OperationExecution
  description: string
  requiredParameters?: string[]
  optionalParameters?: string[]
}

// 模型支持的功能
export interface ModelSupports {
  textToImage: boolean // 文生图
  imageToImage: boolean // 图生图
  imageInput: boolean // 垫图输入（管理员可配置）
  videoInput: boolean // 视频参考输入
  audioInput: boolean // 音频参考输入
  multiImageInput: boolean // 多图输入
  mask: boolean // 蒙版
  async: boolean // 异步
  webhook: boolean // Webhook
  followUpActions: boolean // 后续操作
  highRes: boolean // 高分辨率
  resolutionSelect: boolean // 分辨率选择器
  sizeSelect: boolean // 尺寸/比例选择器
  contextualEdit: boolean // 支持上下文编辑/参考输入工作流
}

// 模型限制
export interface ModelLimits {
  maxInputImages?: number
  maxInputVideos?: number
  maxInputAudios?: number
  imageSizes?: string[] // 例如: ["2K", "4K"]
}

// 模型能力
export interface ModelCapabilities {
  modelId: string
  provider: string
  providerIcon: string | null
  type: 'image' | 'video' | 'chat'
  remoteModel: string
  operationParamKey: string | null
  operations: ModelOperation[]
  supports: ModelSupports
  limits: ModelLimits
  followUp: unknown | null
  providerSchema: unknown | null
}

// 带能力信息的模型
export interface ModelWithCapabilities {
  id: string
  name: string
  modelKey: string
  icon: string | null
  type: 'image' | 'video' | 'chat'
  provider: string
  channelId: string
  defaultParams: Record<string, unknown>
  paramConstraints: unknown | null
  isActive: boolean
  sortOrder: number
  description: string | null
  supportsImageInput: boolean | null
  supportsResolutionSelect: boolean | null
  supportsSizeSelect: boolean | null
  supportsQuickMode: boolean | null
  supportsAgentMode: boolean | null
  supportsAutoMode: boolean | null
  createdAt: string
  updatedAt: string
  capabilities: ModelCapabilities
}

// 模型能力列表响应
export interface ModelCapabilitiesListResponse {
  code: number
  msg: string
  data: ModelWithCapabilities[]
}

// 单个模型能力响应
export interface ModelCapabilitiesResponse {
  code: number
  msg: string
  data: ModelCapabilities
}
