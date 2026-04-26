/**
 * 图片压缩工具
 * 用于压缩超过指定大小的图片
 */

interface CompressOptions {
  maxSizeMB?: number // 目标最大文件大小（MB）
  maxWidthOrHeight?: number // 最大宽度或高度
  quality?: number // 压缩质量 0-1
  mimeType?: string // 输出格式
}

/**
 * 压缩图片文件
 * @param file 原始文件
 * @param options 压缩选项
 * @returns 压缩后的文件
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxSizeMB = 2, // 降低到 2MB（base64 后约 2.6MB，多张图也不会超限）
    maxWidthOrHeight = 1920, // 降低到 1920px（对 AI 识别足够了）
    quality = 0.75, // 降低质量到 0.75（更小的文件）
    mimeType = 'image/jpeg',
  } = options

  // 如果文件已经小于目标大小，直接返回
  if (file.size <= maxSizeMB * 1024 * 1024) {
    return file
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      const img = new Image()

      img.onload = () => {
        try {
          // 计算压缩后的尺寸
          let { width, height } = img

          if (width > maxWidthOrHeight || height > maxWidthOrHeight) {
            if (width > height) {
              height = Math.round((height * maxWidthOrHeight) / width)
              width = maxWidthOrHeight
            } else {
              width = Math.round((width * maxWidthOrHeight) / height)
              height = maxWidthOrHeight
            }
          }

          // 创建 Canvas 进行压缩
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法获取 Canvas 上下文'))
            return
          }

          // 绘制图片
          ctx.drawImage(img, 0, 0, width, height)

          // 转换为 Blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('图片压缩失败'))
                return
              }

              // 创建新文件
              const compressedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, '.jpg'), // 统一使用 .jpg 扩展名
                { type: mimeType }
              )

              console.log(
                `图片压缩: ${(file.size / 1024 / 1024).toFixed(2)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`
              )

              resolve(compressedFile)
            },
            mimeType,
            quality
          )
        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => {
        reject(new Error('图片加载失败'))
      }

      img.src = e.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('文件读取失败'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * 批量压缩图片
 * @param files 文件数组
 * @param options 压缩选项
 * @returns 压缩后的文件数组
 */
export async function compressImages(
  files: File[],
  options: CompressOptions = {}
): Promise<File[]> {
  const promises = files.map((file) => compressImage(file, options))
  return Promise.all(promises)
}
