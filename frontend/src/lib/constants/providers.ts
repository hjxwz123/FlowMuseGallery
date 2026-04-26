/**
 * 预定义的 AI Provider 配置
 * 基于后端 AdapterFactory 中定义的 adapters
 */

export type ProviderSupportType = 'image' | 'video'

export interface ProviderConfig {
  key: string
  displayName: string
  adapterClass: string
  supportTypes: ProviderSupportType[]
  icon?: string
  description?: string
}

const ADMIN_MODELS_HIDDEN_PROVIDER_KEYS = new Set<string>()

function normalizeProviderKey(key: string) {
  return key.toLowerCase().trim()
}

/**
 * 所有支持的 Providers
 */
export const AVAILABLE_PROVIDERS: ProviderConfig[] = [
  // 图片生成 Providers
  {
    key: 'mj',
    displayName: 'midjourney',
    adapterClass: 'MidjourneyImageAdapter',
    supportTypes: ['image'],
    description: 'Midjourney格式',
  },
  {
    key: 'doubao',
    displayName: '豆包',
    adapterClass: 'DoubaoImageAdapter',
    supportTypes: ['image','video'],
    description: '豆包格式',
  },
  {
    key: 'nanobanana',
    displayName: 'Nanobanana (Gemini)',
    adapterClass: 'NanobananaImageAdapter',
    supportTypes: ['image'],
    description: 'Google Gemini格式',
  },
  {
    key: 'gptimage',
    displayName: 'GPT Image',
    adapterClass: 'GptImageAdapter',
    supportTypes: ['image'],
    description: 'GPT 格式',
  },
  {
    key: 'qwen',
    displayName: 'Qwen (通义千问)',
    adapterClass: 'QianwenImageAdapter',
    supportTypes: ['image'],
    description: '阿里云通义千问图片生成',
  },

  {
    key: 'wanx',
    displayName: '万相',
    adapterClass: 'WanxVideoAdapter',
    supportTypes: ['video'],
    description: '阿里云百炼万相参考生视频',
  },
]

export function isAdminModelsHiddenProvider(key?: string | null) {
  if (!key) return false
  return ADMIN_MODELS_HIDDEN_PROVIDER_KEYS.has(normalizeProviderKey(key))
}

/**
 * 根据 supportType 过滤 providers
 */
export function getProvidersByType(type: ProviderSupportType): ProviderConfig[] {
  return AVAILABLE_PROVIDERS.filter((p) => p.supportTypes.includes(type))
}

/**
 * 根据 key 获取 provider 配置
 */
export function getProviderConfig(key: string): ProviderConfig | undefined {
  return AVAILABLE_PROVIDERS.find((p) => p.key === key)
}
