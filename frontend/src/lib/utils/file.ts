/**
 * 文件处理工具函数
 */

/**
 * 将 File 转换为 base64 字符串
 * @param file 文件对象
 * @returns base64 字符串（不包含 data:image/xxx;base64, 前缀）
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result as string
      // 移除 data:image/xxx;base64, 前缀
      const base64 = result.split(',')[1]
      resolve(base64)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsDataURL(file)
  })
}

/**
 * 将多个 File 转换为 base64 数组
 * @param files 文件数组
 * @returns base64 字符串数组
 */
export async function filesToBase64Array(files: File[]): Promise<string[]> {
  return Promise.all(files.map(file => fileToBase64(file)))
}

/**
 * 验证文件类型是否为图片
 * @param file 文件对象
 * @returns 是否为图片
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/**
 * 验证文件大小
 * @param file 文件对象
 * @param maxSizeMB 最大文件大小（MB）
 * @returns 是否符合大小限制
 */
export function validateFileSize(file: File, maxSizeMB: number): boolean {
  const maxBytes = maxSizeMB * 1024 * 1024
  return file.size <= maxBytes
}
