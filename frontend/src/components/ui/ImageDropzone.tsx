/**
 * 图片拖拽上传组件
 * 支持拖拽和点击上传
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, X, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { compressImage } from '@/lib/utils/image-compress'

interface ImageDropzoneProps {
  value: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  maxSize?: number // MB
  accept?: string
  disabled?: boolean
  className?: string
}

export function ImageDropzone({
  value,
  onChange,
  maxFiles = 1,
  maxSize = 10,
  accept = 'image/*',
  disabled = false,
  className,
}: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [previews, setPreviews] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // 生成预览
  const generatePreviews = useCallback((files: File[]) => {
    const newPreviews = files.map((file) => URL.createObjectURL(file))
    setPreviews(newPreviews)
    return () => {
      newPreviews.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  // 处理文件
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || disabled) return

      const fileArray = Array.from(files)

      // 处理并压缩文件
      const processedFiles: File[] = []
      let compressedCount = 0

      for (const file of fileArray) {
        // 检查文件大小是否超过最大限制
        if (file.size > maxSize * 1024 * 1024) {
          continue
        }

        // 如果文件超过 2MB，自动压缩（考虑 base64 编码后体积增加 33%）
        if (file.size > 2 * 1024 * 1024) {
          try {
            const originalSize = (file.size / 1024 / 1024).toFixed(2)
            console.log(`文件 ${file.name} 超过 2MB，开始压缩...`)
            const compressedFile = await compressImage(file, {
              maxSizeMB: 2, // 压缩到 2MB，base64 后约 2.6MB
              maxWidthOrHeight: 1920,
              quality: 0.75,
            })
            const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2)
            console.log(`压缩成功: ${originalSize}MB -> ${compressedSize}MB`)
            processedFiles.push(compressedFile)
            compressedCount++
          } catch (error) {
            console.error('图片压缩失败:', error)
          }
        } else {
          processedFiles.push(file)
        }
      }

      // 限制文件数量
      const filesToAdd = processedFiles.slice(0, maxFiles - value.length)
      const newFiles = [...value, ...filesToAdd]

      if (newFiles.length > maxFiles) {
        alert(`最多只能上传 ${maxFiles} 张图片`)
        return
      }


      onChange(newFiles)
      generatePreviews(newFiles)
    },
    [value, onChange, maxFiles, maxSize, disabled, generatePreviews]
  )

  // 拖拽处理
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(false)
  }, [disabled])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (disabled) return

      const files = e.dataTransfer.files
      handleFiles(files)
    },
    [disabled, handleFiles]
  )

  // 点击上传
  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click()
    }
  }, [disabled])

  // 删除图片
  const handleRemove = useCallback(
    (index: number) => {
      const newFiles = value.filter((_, i) => i !== index)
      onChange(newFiles)
      generatePreviews(newFiles)
    },
    [value, onChange, generatePreviews]
  )

  return (
    <div className={cn('space-y-2.5 sm:space-y-3', className)}>
      {/* 拖拽区域 */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-5 sm:p-8',
          'transition-all duration-300 cursor-pointer',
          'flex flex-col items-center justify-center gap-2.5 sm:gap-3',
          'min-h-[152px] sm:min-h-[180px]',
          isDragging && !disabled
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-stone-300 dark:border-stone-600 bg-stone-50/50 dark:bg-stone-800/50',
          !disabled && 'hover:border-primary hover:bg-primary/5',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled}
          className="hidden"
        />

        <Upload
          className={cn(
            'h-10 w-10 transition-colors sm:h-12 sm:w-12',
            isDragging && !disabled ? 'text-primary' : 'text-stone-400'
          )}
        />

        <div className="text-center">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {isDragging ? '松开鼠标上传图片' : '拖拽图片到这里，或点击上传'}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
            支持 JPG、PNG、GIF 格式，最多 {maxFiles} 张，单个文件不超过 {maxSize}MB
          </p>
          <p className="text-xs text-aurora-purple mt-1">
            超过 2MB 的图片将自动压缩
          </p>
        </div>
      </div>

      {/* 预览区域 */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
          {value.map((file, index) => (
            <div
              key={index}
              className="relative group rounded-lg overflow-hidden border-2 border-stone-200 dark:border-stone-600 bg-stone-100 dark:bg-stone-700"
            >
              <div className="aspect-square relative">
                {previews[index] ? (
                  <img
                    src={previews[index]}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-stone-400" />
                  </div>
                )}

                {/* 删除按钮 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(index)
                  }}
                  className={cn(
                    'absolute top-2 right-2',
                    'h-7 w-7 rounded-full sm:h-6 sm:w-6',
                    'bg-red-500 text-white',
                    'flex items-center justify-center',
                    'opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
                    'transition-opacity duration-200',
                    'hover:bg-red-600'
                  )}
                >
                  <X className="w-4 h-4" />
                </button>

                {/* 文件信息 */}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1.5 text-white sm:p-2">
                  <p className="text-xs truncate">{file.name}</p>
                  <p className="text-xs text-stone-300">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
