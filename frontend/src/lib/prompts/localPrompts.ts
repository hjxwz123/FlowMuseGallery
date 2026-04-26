import type { Prompt } from '@/lib/types/prompt'

type NetworkPromptType = 'image' | 'video'

const LOCAL_IMAGE_PROMPTS_URL = '/json/prompts.json'
const LOCAL_VIDEO_PROMPTS_URL = '/json/prompts-videos.json'

export const LOCAL_NETWORK_PROMPTS: Prompt[] = [
  {
    title: '电影感人物肖像',
    preview: '',
    prompt:
      'cinematic portrait of a thoughtful character, soft rim light, shallow depth of field, detailed skin texture, elegant color grading, 85mm lens, high quality',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: '人像',
    sub_category: '电影感',
    created: '2026-04-25',
  },
  {
    title: '高级静物海报',
    preview: '',
    prompt:
      'premium still-life product poster, clean studio lighting, reflective surface, minimal composition, refined material details, sharp focus, editorial photography',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: '静物摄影',
    sub_category: '产品',
    created: '2026-04-25',
  },
  {
    title: '东方幻想场景',
    preview: '',
    prompt:
      'eastern fantasy landscape, ancient pavilion above misty mountains, dramatic clouds, warm sunrise, delicate ink painting texture mixed with cinematic realism',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: '场景',
    sub_category: '幻想',
    created: '2026-04-25',
  },
  {
    title: '赛博朋克城市',
    preview: '',
    prompt:
      'cyberpunk city street at night, neon signs, rain reflections, dense atmosphere, cinematic lighting, futuristic details, high contrast, ultra detailed',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: '场景',
    sub_category: '科幻',
    created: '2026-04-25',
  },
  {
    title: '参考图风格强化',
    preview: '',
    prompt:
      'keep the main subject and composition from the reference image, enhance lighting, improve material details, refine color harmony, preserve identity and structure',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'edit',
    category: '图像编辑',
    sub_category: '风格强化',
    created: '2026-04-25',
  },
  {
    title: '海报级构图优化',
    preview: '',
    prompt:
      'transform this image into a poster-ready composition, stronger focal point, balanced negative space, refined typography-safe area, professional visual hierarchy',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'edit',
    category: '图像编辑',
    sub_category: '构图',
    created: '2026-04-25',
  },
]

export const LOCAL_VIDEO_NETWORK_PROMPTS: Prompt[] = [
  {
    title: '雨夜赛博朋克街头推镜',
    preview: '',
    prompt:
      '8秒，16:9。雨夜赛博朋克街头，霓虹招牌倒映在湿漉漉的柏油路上，一名穿黑色长风衣的人撑伞缓慢前行。镜头从远景缓慢推入中景，雨滴与地面积水产生真实反射，背景有轻微车流光轨。电影级构图，青紫色霓虹，高对比，轻微胶片颗粒。无文字，无水印，人物比例稳定。',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: 'cinematic',
    sub_category: 'cyberpunk',
    created: '2026-04-26',
  },
  {
    title: '高端香水 360° 产品广告',
    preview: '',
    prompt:
      '使用参考图中的香水瓶作为唯一产品主体，6秒高端产品广告。香水瓶放置在黑色镜面亚克力台面上，瓶身缓慢 360 度旋转，周围有轻薄雾气和金色轮廓光。镜头固定在产品正前方，轻微推近，强调玻璃折射、液体质感和瓶盖金属高光。奢侈品广告质感，干净背景，无文字，无水印，产品外形保持一致。',
    author: 'FlowMuse Personal',
    link: '',
    mode: 'generate',
    category: 'product_ad',
    sub_category: 'commercial',
    created: '2026-04-26',
  },
]

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeMode(value: unknown): Prompt['mode'] {
  return value === 'edit' ? 'edit' : 'generate'
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const urls = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return urls.length > 0 ? urls : undefined
}

function normalizePrompt(value: unknown): Prompt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const prompt = readString(row.prompt).trim()
  if (!prompt) return null

  const title = readString(row.title).trim() || prompt.slice(0, 32)
  const category = readString(row.category).trim() || '默认'

  return {
    title,
    preview: readString(row.preview).trim(),
    reference_image_urls: normalizeStringArray(row.reference_image_urls),
    prompt,
    author: readString(row.author).trim() || 'FlowMuse',
    link: readString(row.link).trim(),
    mode: normalizeMode(row.mode),
    category,
    sub_category: readString(row.sub_category).trim(),
    created: readString(row.created).trim() || new Date(0).toISOString(),
  }
}

function normalizePromptPayload(value: unknown) {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { prompts?: unknown }).prompts)
      ? (value as { prompts: unknown[] }).prompts
      : []

  return rows.map(normalizePrompt).filter((item): item is Prompt => item !== null)
}

function normalizeVideoPrompt(value: unknown, fallbackCreated: string): Prompt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const seedance = row.seedance && typeof row.seedance === 'object' && !Array.isArray(row.seedance)
    ? row.seedance as Record<string, unknown>
    : {}
  const source = row.source && typeof row.source === 'object' && !Array.isArray(row.source)
    ? row.source as Record<string, unknown>
    : {}
  const preview = row.preview && typeof row.preview === 'object' && !Array.isArray(row.preview)
    ? row.preview as Record<string, unknown>
    : {}

  const prompt = readString(seedance.prompt).trim()
  if (!prompt) return null

  const title = readString(row.title).trim() || prompt.slice(0, 32)
  const category = readString(row.category).trim() || 'video'
  const tags = Array.isArray(row.tags)
    ? row.tags.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    title,
    preview: readString(preview.thumbnail_url).trim(),
    prompt,
    author: readString(source.inspired_by).trim() || 'FlowMuse',
    link: readString(source.url).trim(),
    mode: 'generate',
    category,
    sub_category: tags.join(', '),
    created: fallbackCreated,
  }
}

function normalizeVideoPromptPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const payload = value as Record<string, unknown>
  const meta = payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? payload.meta as Record<string, unknown>
    : {}
  const fallbackCreated = readString(meta.created_at).trim() || new Date(0).toISOString()
  const rows = Array.isArray(payload.templates) ? payload.templates : []

  return rows.map((row) => normalizeVideoPrompt(row, fallbackCreated)).filter((item): item is Prompt => item !== null)
}

export async function loadNetworkPrompts(type: NetworkPromptType = 'image') {
  const url = type === 'video' ? LOCAL_VIDEO_PROMPTS_URL : LOCAL_IMAGE_PROMPTS_URL
  const fallback = type === 'video' ? LOCAL_VIDEO_NETWORK_PROMPTS : LOCAL_NETWORK_PROMPTS

  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Failed to load local ${type} prompts: ${response.status}`)
    }

    const prompts = type === 'video'
      ? normalizeVideoPromptPayload(await response.json())
      : normalizePromptPayload(await response.json())
    return prompts.length > 0 ? prompts : fallback
  } catch (error) {
    console.error(`[Prompts] Failed to load local ${type} prompts JSON:`, error)
    return fallback
  }
}
