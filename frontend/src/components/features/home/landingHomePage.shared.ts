export type LandingMode = 'image' | 'video'

export type LandingHomeCopy = {
  enterCreate: string
  imageMode: string
  imagePlaceholder: string
  projects: string
  quick: string
  subtitle: string
  tasks: string
  title: string
  videoMode: string
  videoPlaceholder: string
  workflow: string
  workspace: string
}

export const HOME_NAV_TRANSITION_MS = 520
export const HOME_HERO_IMAGE_BACKGROUNDS = [
  'https://images.unsplash.com/photo-1519608487953-e999c86e7455?q=80&w=1920&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1920&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=1920&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?q=80&w=1920&auto=format&fit=crop',
  '/images/9.png',
]
export const HOME_HERO_VIDEO_BACKGROUND = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'


export function getLandingHomeCopy(locale: string): LandingHomeCopy {
  const isZh = locale.toLowerCase().startsWith('zh')

  if (isZh) {
    return {
      title: '重塑你的想象力',
      subtitle: '一键生成惊艳的超清图像与动态视频，在色彩秩序里保留作品本身的光感与节奏。',
      enterCreate: '进入创作',
      workspace: '工作台',
      quick: '快速',
      workflow: '工作流',
      tasks: '任务',
      projects: '项目',
      imageMode: '图片生成',
      videoMode: '视频生成',
      imagePlaceholder: '描述你想要生成的图像画面细节...',
      videoPlaceholder: '描述视频的动作轨迹、情绪推进与镜头语言...',
    }
  }

  return {
    title: 'Reshape Your Imagination',
    subtitle: 'Generate cinematic images and motion-rich videos in one click, while the interface stays crisp in a visual system.',
    enterCreate: 'Create',
    workspace: 'Workspace',
    quick: 'Quick',
    workflow: 'Workflow',
    tasks: 'Tasks',
    projects: 'Projects',
    imageMode: 'Image',
    videoMode: 'Video',
    imagePlaceholder: 'Describe the image you want to create...',
    videoPlaceholder: 'Describe motion, emotion, and camera language for the video...',
  }
}

export function buildCreateHref(locale: string, mode: LandingMode, prompt: string) {
  const params = new URLSearchParams()
  params.set('mode', mode)

  const normalizedPrompt = prompt.trim()
  if (normalizedPrompt) {
    params.set('prompt', normalizedPrompt)
  }

  const query = params.toString()
  return `/${locale}/create${query ? `?${query}` : ''}`
}
