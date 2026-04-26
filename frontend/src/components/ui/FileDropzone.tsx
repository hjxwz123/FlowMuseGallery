'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Image as ImageIcon, Music2, Upload, Video, X } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

interface FileDropzoneProps {
  value: File[]
  onChange: (files: File[]) => void
  maxFiles?: number
  maxSize?: number
  accept?: string
  disabled?: boolean
  className?: string
  idleText?: string
  draggingText?: string
  description?: string
}

function getFileIcon(file: File) {
  if (file.type.startsWith('image/')) return ImageIcon
  if (file.type.startsWith('video/')) return Video
  if (file.type.startsWith('audio/')) return Music2
  return FileText
}

export function FileDropzone({
  value,
  onChange,
  maxFiles = 1,
  maxSize = 10,
  accept,
  disabled = false,
  className,
  idleText = '拖拽文件到这里，或点击上传',
  draggingText = '松开鼠标上传文件',
  description,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({})

  const fileKeys = useMemo(
    () => value.map((file) => `${file.name}_${file.size}_${file.lastModified}`),
    [value],
  )

  useEffect(() => {
    const nextPreviews: Record<string, string> = {}
    for (const file of value) {
      if (!file.type.startsWith('image/')) continue
      const key = `${file.name}_${file.size}_${file.lastModified}`
      nextPreviews[key] = URL.createObjectURL(file)
    }

    setPreviewUrls(nextPreviews)
    return () => {
      Object.values(nextPreviews).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [value])

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || disabled) return

      const acceptedFiles = Array.from(fileList).filter((file) => file.size <= maxSize * 1024 * 1024)
      const nextFiles = [...value, ...acceptedFiles].slice(0, maxFiles)
      onChange(nextFiles)
    },
    [disabled, maxFiles, maxSize, onChange, value],
  )

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, fileIndex) => fileIndex !== index))
    },
    [onChange, value],
  )

  return (
    <div className={cn('space-y-3', className)}>
      <div
        onClick={handleClick}
        onDragEnter={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!disabled) setIsDragging(false)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setIsDragging(false)
          if (!disabled) handleFiles(event.dataTransfer.files)
        }}
        className={cn(
          'relative min-h-[148px] cursor-pointer rounded-xl border-2 border-dashed p-5 transition-all duration-300',
          'flex flex-col items-center justify-center gap-3 text-center',
          isDragging && !disabled
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-stone-300 bg-stone-50/60 dark:border-stone-600 dark:bg-stone-800/50',
          !disabled && 'hover:border-primary hover:bg-primary/5',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          disabled={disabled}
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />

        <Upload
          className={cn(
            'h-10 w-10 transition-colors',
            isDragging && !disabled ? 'text-primary' : 'text-stone-400',
          )}
        />

        <div className="space-y-1">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {isDragging ? draggingText : idleText}
          </p>
          {description ? (
            <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>
          ) : null}
        </div>
      </div>

      {value.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {value.map((file, index) => {
            const key = fileKeys[index]
            const previewUrl = previewUrls[key]
            const Icon = getFileIcon(file)

            return (
              <div
                key={key}
                className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white/90 p-3 dark:border-stone-700 dark:bg-stone-900/70"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
                  {previewUrl ? (
                    <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                  ) : (
                    <Icon className="h-6 w-6 text-stone-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{file.name}</p>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handleRemove(index)
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
