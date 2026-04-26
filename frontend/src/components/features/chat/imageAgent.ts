import type { ModelWithCapabilities } from '@/lib/api/types/modelCapabilities'

import {
  getAspectRatioOptions,
  getImageSizeOptions,
  NANO_BANANA_IMAGE_SIZE_OPTIONS,
  type AspectRatioOption,
} from '@/components/features/create/config/aspectRatioOptions'

type ImageAgentLocale = 'zh' | 'en'

export type ImageAgentQuestionKey = 'style' | 'composition' | 'scene' | 'ratio' | 'quality'

export type ImageAgentParameterState = {
  aspectRatio?: string
  aspectRatioLabel?: string
  imageSize?: string
  imageSizeLabel?: string
  mjStyle?: string
  mjQuality?: string
  mjBotType?: string
}

export type ImageAgentQuestionOption = {
  id: string
  label: string
  description: string
  chip?: string
  promptFragment?: string
  parameterPatch?: Partial<ImageAgentParameterState>
  skip?: boolean
}

export type ImageAgentQuestion = {
  key: ImageAgentQuestionKey
  title: string
  description: string
  options: ImageAgentQuestionOption[]
}

export type ImageAgentTurn = {
  id: string
  role: 'assistant' | 'user'
  text: string
}

export type ImageAgentSession = {
  initialPrompt: string
  optimizedPrompt: string
  promptFragments: string[]
  summaryChips: string[]
  turns: ImageAgentTurn[]
  currentQuestion: ImageAgentQuestion | null
  remainingMandatoryKeys: ImageAgentQuestionKey[]
  remainingOptionalKeys: ImageAgentQuestionKey[]
  parameters: ImageAgentParameterState
  status: 'questioning' | 'ready'
}

export type ImageAgentStartResult = {
  session: ImageAgentSession
  shouldAutoCreate: boolean
}

export type ImageAgentTaskDraft = {
  prompt: string
  negativePrompt?: string
  parameters?: Record<string, unknown>
  userMessageContent: string
}

type PromptSignals = {
  hasStyle: boolean
  hasComposition: boolean
  hasScene: boolean
  hasLighting: boolean
  hasQuality: boolean
  hasAspectRatio: boolean
  detailScore: number
}

function resolveLocale(locale: string): ImageAgentLocale {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function createTurnId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeProviderFamily(providerValue?: string | null) {
  const normalized = (providerValue || '').toLowerCase().trim()
  if (normalized === 'qianwen') return 'qwen'
  if (normalized === 'mj') return 'midjourney'
  return normalized
}

function isNanoBananaProModel(model: ModelWithCapabilities) {
  const provider = model.provider?.toLowerCase() || ''
  const remoteModel = model.capabilities?.remoteModel?.toLowerCase() || ''
  const modelKey = model.modelKey?.toLowerCase() || ''
  const combined = `${provider} ${remoteModel} ${modelKey}`

  return (
    combined.includes('nanobananapro') ||
    combined.includes('nano_banana_pro') ||
    combined.includes('nano-banana-pro') ||
    (combined.includes('gemini') && combined.includes('pro'))
  )
}

function getPromptSignals(prompt: string) {
  const normalized = prompt.toLowerCase()
  const segments = prompt
    .split(/[\n,.;，。；]/)
    .map((item) => item.trim())
    .filter(Boolean)

  const stylePattern =
    /(写实|写实摄影|电影感|插画|动漫|海报|水彩|油画|3d|cg|render|photoreal|realistic|cinematic|illustration|anime|poster|watercolor|oil painting|editorial|product shot)/
  const compositionPattern =
    /(特写|近景|半身|全身|广角|俯拍|仰拍|居中构图|海报构图|portrait|close-up|close up|medium shot|full body|wide shot|centered composition|hero shot|top-down|low angle)/
  const scenePattern =
    /(室内|室外|街头|棚拍|影棚|背景|城市|森林|海边|霓虹|夜景|咖啡馆|客厅|工作室|studio|indoor|outdoor|street|city|forest|beach|neon|night|background|living room|cafe)/
  const lightingPattern =
    /(柔光|逆光|轮廓光|电影光|自然光|冷光|暖光|dramatic lighting|soft lighting|rim light|backlight|natural light|warm light|cool light)/
  const qualityPattern =
    /(高清|超清|高细节|细腻|精致|8k|4k|high detail|ultra detailed|sharp focus|crisp detail|highly detailed)/
  const ratioPattern =
    /(\b\d{1,2}:\d{1,2}\b|\b\d{3,4}[x*]\d{3,4}\b|\bauto\b)/

  const detailScore = [
    prompt.trim().length >= 18,
    prompt.trim().length >= 40,
    segments.length >= 2,
    stylePattern.test(normalized),
    compositionPattern.test(normalized),
    scenePattern.test(normalized),
    lightingPattern.test(normalized),
    qualityPattern.test(normalized),
    ratioPattern.test(normalized),
  ].filter(Boolean).length

  return {
    hasStyle: stylePattern.test(normalized),
    hasComposition: compositionPattern.test(normalized),
    hasScene: scenePattern.test(normalized),
    hasLighting: lightingPattern.test(normalized),
    hasQuality: qualityPattern.test(normalized),
    hasAspectRatio: ratioPattern.test(normalized),
    detailScore,
  } satisfies PromptSignals
}

function mergePrompt(basePrompt: string, fragments: string[], locale: ImageAgentLocale) {
  const nextParts: string[] = [basePrompt.trim()]
  const seen = new Set(nextParts.map((item) => item.toLowerCase()))

  for (const fragment of fragments) {
    const normalized = fragment.trim()
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    nextParts.push(normalized)
  }

  return nextParts.filter(Boolean).join(locale === 'zh' ? '，' : ', ')
}

function pickAspectRatioOptions(options: AspectRatioOption[]) {
  const preferredValues = [
    '1:1',
    '4:5',
    '9:16',
    '16:9',
    '1024x1024',
    '1024x1536',
    '1536x1024',
    '1024*1024',
    '1024*1536',
    '1536*1024',
    '768*1152',
    '1152*768',
    '16x9',
    '9x16',
    '1x1',
  ]

  const selected: AspectRatioOption[] = []
  const seen = new Set<string>()

  for (const value of preferredValues) {
    const matched = options.find((item) => item.value === value)
    if (!matched || seen.has(matched.value)) continue
    seen.add(matched.value)
    selected.push(matched)
    if (selected.length >= 4) return selected
  }

  for (const option of options) {
    if (seen.has(option.value)) continue
    selected.push(option)
    seen.add(option.value)
    if (selected.length >= 4) break
  }

  return selected
}

function resolveImageSizeOptions(model: ModelWithCapabilities) {
  const providerOptions = getImageSizeOptions(model.provider)
  if (providerOptions && providerOptions.length > 0) return providerOptions

  const provider = normalizeProviderFamily(model.provider)
  const remoteModel = model.capabilities?.remoteModel?.toLowerCase() || ''
  const supportsResolutionSelect = Boolean(model.capabilities?.supports?.resolutionSelect)

  if (
    supportsResolutionSelect &&
    (provider.includes('nanobanana') ||
      provider.includes('gemini') ||
      provider.includes('google') ||
      remoteModel.includes('gemini'))
  ) {
    return NANO_BANANA_IMAGE_SIZE_OPTIONS
  }

  return null
}

function buildStyleQuestion(locale: ImageAgentLocale): ImageAgentQuestion {
  return {
    key: 'style',
    title:
      locale === 'zh'
        ? '这张图更接近哪种视觉风格？'
        : 'Which visual direction should this image lean toward?',
    description:
      locale === 'zh'
        ? '先定风格，后面的光线、构图和模型参数才会更稳定。'
        : 'Setting the style first makes composition, lighting, and model params more reliable.',
    options: [
      {
        id: 'style-photoreal',
        label: locale === 'zh' ? '写实摄影' : 'Photoreal',
        description:
          locale === 'zh'
            ? '真实材质、自然细节、商业摄影质感'
            : 'Real textures, natural details, polished photography feel',
        chip: locale === 'zh' ? '写实摄影' : 'Photoreal',
        promptFragment:
          locale === 'zh'
            ? '写实摄影风格，真实材质与皮肤纹理，细腻光影，高级商业摄影质感'
            : 'photoreal style, realistic texture and skin detail, refined lighting, premium commercial photography quality',
        parameterPatch: { mjStyle: 'raw' },
      },
      {
        id: 'style-cinematic',
        label: locale === 'zh' ? '电影感' : 'Cinematic',
        description:
          locale === 'zh'
            ? '更强叙事、氛围和镜头语言'
            : 'Stronger narrative mood and cinematic framing',
        chip: locale === 'zh' ? '电影感' : 'Cinematic',
        promptFragment:
          locale === 'zh'
            ? '电影级画面，叙事感构图，戏剧化光影，强氛围'
            : 'cinematic frame, narrative composition, dramatic lighting, immersive atmosphere',
      },
      {
        id: 'style-anime',
        label: locale === 'zh' ? '插画动漫' : 'Illustration / Anime',
        description:
          locale === 'zh'
            ? '适合角色、海报和高完成度插画'
            : 'Great for characters, posters, and polished illustration work',
        chip: locale === 'zh' ? '插画动漫' : 'Illustration',
        promptFragment:
          locale === 'zh'
            ? '高完成度数字插画风格，造型明确，色彩干净，画面冲击力强'
            : 'high-finish digital illustration style, strong shapes, clean color design, striking visual impact',
        parameterPatch: { mjBotType: 'NIJI_JOURNEY' },
      },
      {
        id: 'style-3d',
        label: locale === 'zh' ? '3D 渲染' : '3D Render',
        description:
          locale === 'zh'
            ? '强调体积、材质和光泽'
            : 'Emphasizes volume, materials, and polished surfaces',
        chip: locale === 'zh' ? '3D 渲染' : '3D Render',
        promptFragment:
          locale === 'zh'
            ? '高质量 3D 渲染，材质清晰，结构明确，体积光细腻'
            : 'high-quality 3D render, clear materials, precise forms, refined volumetric lighting',
      },
      {
        id: 'style-product',
        label: locale === 'zh' ? '产品广告' : 'Product Ad',
        description:
          locale === 'zh'
            ? '更适合电商、品牌和主视觉展示'
            : 'Best for e-commerce, branding, and key visuals',
        chip: locale === 'zh' ? '产品广告' : 'Product Ad',
        promptFragment:
          locale === 'zh'
            ? '商业广告视觉，主体突出，背景克制，适合品牌与电商展示'
            : 'commercial advertising visual, clearly isolated subject, restrained background, suitable for branding and e-commerce',
      },
    ],
  }
}

function buildCompositionQuestion(locale: ImageAgentLocale): ImageAgentQuestion {
  return {
    key: 'composition',
    title:
      locale === 'zh'
        ? '你想让画面怎么取景？'
        : 'How should the shot be framed?',
    description:
      locale === 'zh'
        ? '这个选择会直接影响主体大小、镜头距离和构图重心。'
        : 'This directly affects subject scale, camera distance, and composition balance.',
    options: [
      {
        id: 'composition-closeup',
        label: locale === 'zh' ? '特写近景' : 'Close-up',
        description:
          locale === 'zh'
            ? '更强调脸部、细节或产品材质'
            : 'Focuses on face, details, or product materials',
        chip: locale === 'zh' ? '特写近景' : 'Close-up',
        promptFragment:
          locale === 'zh'
            ? '特写近景构图，主体占画面较大面积，突出细节'
            : 'close-up framing, large subject presence, detail-focused composition',
      },
      {
        id: 'composition-medium',
        label: locale === 'zh' ? '半身主体' : 'Medium Shot',
        description:
          locale === 'zh'
            ? '兼顾人物/主体与氛围信息'
            : 'Balances the subject with some environmental context',
        chip: locale === 'zh' ? '半身主体' : 'Medium Shot',
        promptFragment:
          locale === 'zh'
            ? '半身主体构图，画面层次清晰，主体与环境关系平衡'
            : 'medium shot framing, clear layers, balanced relationship between subject and environment',
      },
      {
        id: 'composition-full',
        label: locale === 'zh' ? '全身/完整主体' : 'Full Subject',
        description:
          locale === 'zh'
            ? '适合服装、姿态和全貌展示'
            : 'Great for outfits, posture, and full-form presentation',
        chip: locale === 'zh' ? '完整主体' : 'Full Subject',
        promptFragment:
          locale === 'zh'
            ? '完整主体展示，姿态清楚，留出足够空间表现全貌'
            : 'full subject presentation, clear pose, enough space to show the entire form',
      },
      {
        id: 'composition-wide',
        label: locale === 'zh' ? '广角场景' : 'Wide Scene',
        description:
          locale === 'zh'
            ? '更强调环境、空间和故事感'
            : 'Highlights environment, space, and storytelling',
        chip: locale === 'zh' ? '广角场景' : 'Wide Scene',
        promptFragment:
          locale === 'zh'
            ? '广角场景构图，环境信息丰富，空间纵深明确'
            : 'wide scene composition, rich environmental context, strong sense of depth',
      },
      {
        id: 'composition-poster',
        label: locale === 'zh' ? '海报主视觉' : 'Hero Poster',
        description:
          locale === 'zh'
            ? '适合主 KV、封面和品牌画面'
            : 'Ideal for hero images, covers, and key visuals',
        chip: locale === 'zh' ? '海报主视觉' : 'Hero Poster',
        promptFragment:
          locale === 'zh'
            ? '海报级主视觉构图，主体明确，留白合理，视觉冲击强'
            : 'hero-poster composition, clear focal subject, intentional negative space, strong visual impact',
      },
    ],
  }
}

function buildSceneQuestion(locale: ImageAgentLocale): ImageAgentQuestion {
  return {
    key: 'scene',
    title:
      locale === 'zh'
        ? '希望画面氛围更像哪一种？'
        : 'What kind of scene or atmosphere should it have?',
    description:
      locale === 'zh'
        ? '这一步会补足光线、背景和整体情绪。'
        : 'This fills in lighting, background, and overall mood.',
    options: [
      {
        id: 'scene-studio',
        label: locale === 'zh' ? '干净棚拍' : 'Clean Studio',
        description:
          locale === 'zh'
            ? '背景克制，适合产品和高级肖像'
            : 'Restrained background, great for products and premium portraits',
        chip: locale === 'zh' ? '干净棚拍' : 'Clean Studio',
        promptFragment:
          locale === 'zh'
            ? '干净影棚背景，柔和棚拍光线，主体边缘清晰，画面克制高级'
            : 'clean studio backdrop, soft studio lighting, crisp subject edges, restrained premium look',
      },
      {
        id: 'scene-indoor',
        label: locale === 'zh' ? '室内氛围' : 'Indoor Mood',
        description:
          locale === 'zh'
            ? '更生活化、温暖、有叙事情绪'
            : 'Warmer, more lived-in, and more narrative',
        chip: locale === 'zh' ? '室内氛围' : 'Indoor Mood',
        promptFragment:
          locale === 'zh'
            ? '有氛围感的室内场景，柔和暖光，细节丰富，生活化但不杂乱'
            : 'atmospheric interior scene, soft warm lighting, rich details, lived-in but not cluttered',
      },
      {
        id: 'scene-daylight',
        label: locale === 'zh' ? '户外自然光' : 'Outdoor Daylight',
        description:
          locale === 'zh'
            ? '自然、通透、层次舒服'
            : 'Natural, airy, and comfortably layered',
        chip: locale === 'zh' ? '户外自然光' : 'Outdoor Daylight',
        promptFragment:
          locale === 'zh'
            ? '户外自然光环境，通透空气感，真实阴影与层次'
            : 'outdoor natural light setting, airy atmosphere, realistic shadows and depth',
      },
      {
        id: 'scene-neon',
        label: locale === 'zh' ? '夜景霓虹' : 'Neon Night',
        description:
          locale === 'zh'
            ? '更强城市感、色彩反差和戏剧氛围'
            : 'More urban energy, color contrast, and drama',
        chip: locale === 'zh' ? '夜景霓虹' : 'Neon Night',
        promptFragment:
          locale === 'zh'
            ? '夜景霓虹环境，冷暖对比明显，反射与氛围光丰富'
            : 'neon night environment, strong warm-cool contrast, rich reflections and ambient light',
      },
      {
        id: 'scene-dream',
        label: locale === 'zh' ? '梦幻超现实' : 'Dreamlike',
        description:
          locale === 'zh'
            ? '更艺术、更抽象，也更偏概念表达'
            : 'More artistic, abstract, and concept-driven',
        chip: locale === 'zh' ? '梦幻超现实' : 'Dreamlike',
        promptFragment:
          locale === 'zh'
            ? '梦幻超现实氛围，层叠光效，情绪化色彩，带轻微概念艺术表达'
            : 'dreamlike surreal atmosphere, layered glow, emotive color palette, subtle conceptual-art expression',
      },
    ],
  }
}

function buildRatioQuestion(locale: ImageAgentLocale, options: AspectRatioOption[]): ImageAgentQuestion | null {
  if (options.length === 0) return null

  return {
    key: 'ratio',
    title:
      locale === 'zh'
        ? '这张图准备做成什么画幅？'
        : 'What canvas ratio should we generate for?',
    description:
      locale === 'zh'
        ? '比例会影响构图裁切，建议按使用场景来选。'
        : 'Ratio changes crop behavior and composition, so choose based on the final use case.',
    options: options.map((option) => ({
      id: `ratio-${option.value || 'default'}`,
      label: option.label,
      description: option.description,
      chip: locale === 'zh' ? `画幅 ${option.label}` : `Ratio ${option.label}`,
      parameterPatch: {
        aspectRatio: option.value,
        aspectRatioLabel: option.label,
      },
    })),
  }
}

function buildQualityQuestion(
  locale: ImageAgentLocale,
  model: ModelWithCapabilities,
  sizeOptions: AspectRatioOption[] | null,
): ImageAgentQuestion | null {
  const provider = normalizeProviderFamily(model.provider)

  if (sizeOptions && sizeOptions.length > 0) {
    const shortlisted = sizeOptions.slice(0, 3)
    return {
      key: 'quality',
      title:
        locale === 'zh'
          ? '你更偏向哪种清晰度档位？'
          : 'How much image fidelity do you want?',
      description:
        locale === 'zh'
          ? '更高档位通常更清晰，但生成时间可能更长。'
          : 'Higher settings usually look sharper, but generation may take longer.',
      options: shortlisted.map((option, index) => ({
        id: `quality-size-${option.value || index}`,
        label: option.label,
        description: option.description,
        chip: locale === 'zh' ? `清晰度 ${option.label}` : `Quality ${option.label}`,
        promptFragment:
          index >= 1
            ? locale === 'zh'
              ? '高细节表达，边缘清晰，材质刻画完整'
              : 'high-detail rendering, crisp edges, complete material definition'
            : undefined,
        parameterPatch: {
          imageSize: option.value,
          imageSizeLabel: option.label,
        },
      })),
    }
  }

  if (provider.includes('midjourney')) {
    return {
      key: 'quality',
      title:
        locale === 'zh'
          ? 'Midjourney 这次更偏向哪种出图节奏？'
          : 'How should Midjourney balance speed and detail here?',
      description:
        locale === 'zh'
          ? '我会把你的选择映射到 Midjourney 的参数。'
          : 'Your choice will be mapped to Midjourney parameters.',
      options: [
        {
          id: 'quality-mj-fast',
          label: locale === 'zh' ? '快速草稿' : 'Fast Draft',
          description:
            locale === 'zh'
              ? '更快试方向'
              : 'Faster to explore direction',
          chip: locale === 'zh' ? '快速草稿' : 'Fast Draft',
          parameterPatch: {
            mjQuality: '.5',
          },
        },
        {
          id: 'quality-mj-balanced',
          label: locale === 'zh' ? '标准平衡' : 'Balanced',
          description:
            locale === 'zh'
              ? '默认推荐'
              : 'Recommended default balance',
          chip: locale === 'zh' ? '标准平衡' : 'Balanced',
          parameterPatch: {
            mjQuality: '1',
          },
        },
        {
          id: 'quality-mj-detail',
          label: locale === 'zh' ? '高细节' : 'High Detail',
          description:
            locale === 'zh'
              ? '更重细节和材质'
              : 'Pushes more detail and material fidelity',
          chip: locale === 'zh' ? '高细节' : 'High Detail',
          promptFragment:
            locale === 'zh'
              ? '高细节表达，边缘锐利，材质与纹理清晰'
              : 'high detail rendering, crisp edges, clear texture and material definition',
          parameterPatch: {
            mjQuality: '2',
            mjStyle: 'raw',
          },
        },
      ],
    }
  }

  return null
}

function buildQuestionMap(
  locale: ImageAgentLocale,
  model: ModelWithCapabilities,
) {
  const aspectOptions = pickAspectRatioOptions(getAspectRatioOptions(model.provider))
  const sizeOptions = resolveImageSizeOptions(model)

  return {
    style: buildStyleQuestion(locale),
    composition: buildCompositionQuestion(locale),
    scene: buildSceneQuestion(locale),
    ratio: buildRatioQuestion(locale, aspectOptions),
    quality: buildQualityQuestion(locale, model, sizeOptions),
  } satisfies Partial<Record<ImageAgentQuestionKey, ImageAgentQuestion | null>>
}

function getKickoffText(
  locale: ImageAgentLocale,
  signals: PromptSignals,
  hasReferenceImages: boolean,
) {
  const missing: string[] = []
  if (!signals.hasStyle) missing.push(locale === 'zh' ? '风格' : 'style')
  if (!signals.hasComposition) missing.push(locale === 'zh' ? '构图' : 'composition')
  if (!signals.hasScene && !signals.hasLighting) {
    missing.push(locale === 'zh' ? '场景和光线' : 'scene and lighting')
  }

  if (locale === 'zh') {
    const suffix = hasReferenceImages ? '我也会把你上传的参考图一起纳入。' : ''
    if (missing.length === 0) {
      return `我先不急着直接出图，我会补几个关键执行细节再帮你生成。${suffix}`.trim()
    }
    return `你的想法已经有主体了，但还缺少${missing.join('、')}这些关键信息。我会用按钮快速补齐，再帮你生成。${suffix}`.trim()
  }

  const suffix = hasReferenceImages ? 'I will also use your uploaded reference images.' : ''
  if (missing.length === 0) {
    return `I will tighten a few execution details before creating the image. ${suffix}`.trim()
  }
  return `You already have the core subject, but the prompt still needs clearer ${missing.join(', ')}. I will fill those in with a few quick buttons before generating. ${suffix}`.trim()
}

function getNextQuestion(
  keys: ImageAgentQuestionKey[],
  map: Partial<Record<ImageAgentQuestionKey, ImageAgentQuestion | null>>,
) {
  for (const key of keys) {
    const question = map[key]
    if (question) return question
  }
  return null
}

export function createImageAgentSession(params: {
  prompt: string
  model: ModelWithCapabilities
  locale: string
  hasReferenceImages: boolean
}): ImageAgentStartResult {
  const locale = resolveLocale(params.locale)
  const initialPrompt = params.prompt.trim()
  const signals = getPromptSignals(initialPrompt)
  const shouldAutoCreate =
    signals.detailScore >= 5 ||
    (signals.detailScore >= 4 && initialPrompt.length >= 40) ||
    (params.hasReferenceImages && signals.detailScore >= 3)

  const questionMap = buildQuestionMap(locale, params.model)
  const mandatoryKeys: ImageAgentQuestionKey[] = []
  const optionalKeys: ImageAgentQuestionKey[] = []

  if (!signals.hasStyle && questionMap.style) mandatoryKeys.push('style')
  if (!signals.hasComposition && questionMap.composition) mandatoryKeys.push('composition')
  if (!signals.hasScene && !signals.hasLighting && questionMap.scene) mandatoryKeys.push('scene')
  if (!signals.hasQuality && questionMap.quality) optionalKeys.push('quality')

  const currentQuestion = shouldAutoCreate
    ? null
    : getNextQuestion(mandatoryKeys, questionMap)

  const remainingMandatoryKeys = currentQuestion
    ? mandatoryKeys.filter((key) => key !== currentQuestion.key)
    : mandatoryKeys

  const baseTurns: ImageAgentTurn[] = shouldAutoCreate
    ? []
    : [
        {
          id: createTurnId('image-agent-user'),
          role: 'user',
          text: initialPrompt,
        },
        {
          id: createTurnId('image-agent-assistant'),
          role: 'assistant',
          text: getKickoffText(locale, signals, params.hasReferenceImages),
        },
      ]

  return {
    shouldAutoCreate,
    session: {
      initialPrompt,
      optimizedPrompt: initialPrompt,
      promptFragments: [],
      summaryChips: [],
      turns: baseTurns,
      currentQuestion,
      remainingMandatoryKeys,
      remainingOptionalKeys: optionalKeys,
      parameters: {},
      status: currentQuestion ? 'questioning' : 'ready',
    },
  }
}

export function answerImageAgentQuestion(params: {
  session: ImageAgentSession
  optionId: string
  model: ModelWithCapabilities
  locale: string
}): ImageAgentSession {
  const locale = resolveLocale(params.locale)
  const currentQuestion = params.session.currentQuestion
  if (!currentQuestion) return params.session

  const selectedOption = currentQuestion.options.find((option) => option.id === params.optionId)
  if (!selectedOption) return params.session

  const nextFragments = selectedOption.promptFragment
    ? [...params.session.promptFragments, selectedOption.promptFragment]
    : [...params.session.promptFragments]
  const nextSummaryChips =
    selectedOption.skip || !selectedOption.chip
      ? [...params.session.summaryChips]
      : [...params.session.summaryChips, selectedOption.chip]

  const nextParameters: ImageAgentParameterState = {
    ...params.session.parameters,
    ...(selectedOption.parameterPatch ?? {}),
  }

  const questionMap = buildQuestionMap(locale, params.model)
  const nextQuestion = getNextQuestion(params.session.remainingMandatoryKeys, questionMap)
  const remainingMandatoryKeys = nextQuestion
    ? params.session.remainingMandatoryKeys.filter((key) => key !== nextQuestion.key)
    : []

  const nextTurns: ImageAgentTurn[] = [
    ...params.session.turns,
    {
      id: createTurnId('image-agent-answer'),
      role: 'user',
      text:
        selectedOption.label ||
        (locale === 'zh' ? '跳过这一项' : 'Skip this one'),
    },
  ]

  if (nextQuestion) {
    nextTurns.push({
      id: createTurnId('image-agent-assistant'),
      role: 'assistant',
      text:
        locale === 'zh'
          ? '收到，我继续补一个关键画面设定。'
          : 'Got it. Let me lock one more important visual detail.',
    })
  } else {
    nextTurns.push({
      id: createTurnId('image-agent-ready'),
      role: 'assistant',
      text:
        locale === 'zh'
          ? '现在信息已经足够，我已经整理成可以直接创作的版本。'
          : 'That is enough context. I have turned it into a version that is ready to generate.',
    })
  }

  return {
    ...params.session,
    optimizedPrompt: mergePrompt(params.session.initialPrompt, nextFragments, locale),
    promptFragments: nextFragments,
    summaryChips: nextSummaryChips,
    turns: nextTurns,
    currentQuestion: nextQuestion,
    remainingMandatoryKeys,
    parameters: nextParameters,
    status: nextQuestion ? 'questioning' : 'ready',
  }
}

export function continueImageAgentRefinement(params: {
  session: ImageAgentSession
  model: ModelWithCapabilities
  locale: string
}): ImageAgentSession {
  const locale = resolveLocale(params.locale)
  if (params.session.currentQuestion) return params.session
  if (params.session.remainingOptionalKeys.length === 0) return params.session

  const questionMap = buildQuestionMap(locale, params.model)
  const nextKey = params.session.remainingOptionalKeys[0]
  const nextQuestion = questionMap[nextKey]

  if (!nextQuestion) {
    return {
      ...params.session,
      remainingOptionalKeys: params.session.remainingOptionalKeys.slice(1),
    }
  }

  return {
    ...params.session,
    currentQuestion: nextQuestion,
    remainingOptionalKeys: params.session.remainingOptionalKeys.slice(1),
    status: 'questioning',
    turns: [
      ...params.session.turns,
      {
        id: createTurnId('image-agent-refine'),
        role: 'assistant',
        text:
          locale === 'zh'
            ? '如果你愿意，我再补一个更偏执行层的设置，让出图更稳。'
            : 'If you want, I can refine one more production-level setting to make the result steadier.',
      },
    ],
  }
}

export function hasImageAgentOptionalRefinements(session: ImageAgentSession) {
  return session.remainingOptionalKeys.length > 0
}

export function buildImageAgentTaskDraft(params: {
  session: ImageAgentSession
  model: ModelWithCapabilities
  hasReferenceImages: boolean
  locale: string
  preferredAspectRatio?: string | null
}): ImageAgentTaskDraft {
  const locale = resolveLocale(params.locale)
  const provider = normalizeProviderFamily(params.model.provider)
  const remoteModel = params.model.capabilities?.remoteModel || ''
  const supportsResolutionSelect = Boolean(params.model.capabilities?.supports?.resolutionSelect)
  const supportsSizeSelect = Boolean(params.model.capabilities?.supports?.sizeSelect)
  const isQwenImage = provider.includes('qwen')
  const isGptImage = provider.includes('gpt') || provider.includes('openai')
  const isNanoBananaPro = isNanoBananaProModel(params.model)
  const isNanoBanana =
    (provider.includes('nanobanana') || provider.includes('gemini') || provider.includes('google')) &&
    !isNanoBananaPro
  const isDoubao =
    provider.includes('doubao') || provider.includes('bytedance') || provider.includes('ark')
  const isMidjourney = provider.includes('midjourney') || provider.includes('mj')

  const sizeOptions = resolveImageSizeOptions(params.model)
  const defaultImageSize = sizeOptions?.[0]?.value || (isDoubao ? '2K' : undefined)

  const aspectRatioValue =
    params.preferredAspectRatio === null
      ? undefined
      : (params.preferredAspectRatio ?? params.session.parameters.aspectRatio)
  const imageSizeValue = params.session.parameters.imageSize ?? defaultImageSize
  const parameters: Record<string, unknown> = {}

  if (isQwenImage) {
    if (aspectRatioValue) parameters.size = aspectRatioValue
    parameters.n = 1
    parameters.watermark = false
    if (remoteModel) parameters.model = remoteModel
  } else if (isGptImage) {
    if (aspectRatioValue) parameters.size = aspectRatioValue
    parameters.gptImageOperation = params.hasReferenceImages ? 'edits' : 'generations'
    parameters.model = remoteModel || 'gpt-image-1.5'
  } else if (isNanoBananaPro) {
    if (supportsSizeSelect && aspectRatioValue) {
      parameters.aspectRatio = aspectRatioValue
    }
    parameters.responseModalities = ['IMAGE']
    if (supportsResolutionSelect && imageSizeValue) {
      parameters.imageSize = imageSizeValue
    }
  } else if (isNanoBanana) {
    if (supportsSizeSelect && aspectRatioValue) {
      parameters.aspectRatio = aspectRatioValue
    }
    if (supportsResolutionSelect && imageSizeValue) {
      parameters.imageSize = imageSizeValue
    }
    parameters.responseModalities = ['IMAGE']
  } else if (isDoubao) {
    if (imageSizeValue) parameters.size = imageSizeValue
    parameters.response_format = 'url'
    parameters.watermark = false
    if (remoteModel) parameters.model = remoteModel
  } else if (isMidjourney) {
    parameters.botType = params.session.parameters.mjBotType || 'MID_JOURNEY'
    if (aspectRatioValue) parameters.aspectRatio = aspectRatioValue
    if (params.session.parameters.mjQuality) parameters.quality = params.session.parameters.mjQuality
    if (params.session.parameters.mjStyle) parameters.style = params.session.parameters.mjStyle
  } else if (aspectRatioValue) {
    parameters.aspectRatio = aspectRatioValue
  }

  const userMessageContent = params.session.summaryChips.length > 0
    ? locale === 'zh'
      ? `${params.session.initialPrompt}\n\n创作设定：${params.session.summaryChips.join(' · ')}`
      : `${params.session.initialPrompt}\n\nCreative settings: ${params.session.summaryChips.join(' · ')}`
    : params.session.initialPrompt

  return {
    prompt: params.session.optimizedPrompt,
    parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    userMessageContent,
  }
}
