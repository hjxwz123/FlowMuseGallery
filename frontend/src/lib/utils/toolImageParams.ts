/**
 * 根据模型 provider/modelKey 将 base64 图片数组转换为提交参数
 * 与 SimplifiedCreateContent 中的逻辑保持一致
 */
export function buildImageParameters(
  provider: string,
  modelKey: string,
  type: 'image' | 'video',
  images: string[], // base64 data URIs
): Record<string, unknown> {
  const params: Record<string, unknown> = {}

  if (type === 'image') {
    const clean = (b: string) => (b.includes(',') ? b.split(',')[1] : b)

    if (provider.includes('midjourney')) {
      params.base64Array = images.map(clean)
    } else if (
      modelKey.toLowerCase().includes('gpt') ||
      modelKey.toLowerCase().includes('dall-e') ||
      provider.includes('openai')
    ) {
      params.image = images.length === 1 ? images[0] : images
    } else if (provider.includes('doubao')) {
      params.image = images.length === 1 ? images[0] : images
    } else if (provider.includes('nano') || provider.includes('gemini')) {
      params.images = images
      params.imageFirst = true
    } else {
      // 通用 fallback
      if (images.length === 1) {
        params.imageBase64 = images[0]
      } else {
        params.images = images
      }
    }
  } else {
    // video providers
    if (provider.includes('wanx') || provider.includes('wanxiang')) {
      params.referenceImages = images
    } else if (provider.includes('doubao')) {
      if (images.length > 1) {
        params.referenceImages = images
      } else {
        params.firstFrame = images[0]
      }
    } else {
      params.referenceImage = images[0]
    }
  }

  return params
}

/** 将 File 转为 base64 data URI */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
  })
}
