/**
 * 蒙版编辑器组件
 * 用于 Midjourney Vary Region 功能
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from '@/i18n/client'
import { Button, Modal } from '@/components/ui'

interface MaskEditorProps {
  isOpen: boolean
  imageUrl: string
  onClose: () => void
  onSubmit: (maskBase64: string, prompt: string, actualImageUrl: string) => Promise<void>
  mode?: 'midjourney' | 'gptimage' // 编辑模式，决定蒙版格式
}

export function MaskEditor({ isOpen, imageUrl, onClose, onSubmit, mode = 'midjourney' }: MaskEditorProps) {
  const t = useTranslations('tasks.maskEditor')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(30)
  const [prompt, setPrompt] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 }) // 原图尺寸

  // 初始化画布（使用原图尺寸）
  useEffect(() => {
    if (!isOpen) return

    const loadImage = async () => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous' // 必须设置，否则无法调用 getImageData

      // 尝试加载图片
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          console.log('[MaskEditor] Image loaded successfully:', {
            url: imageUrl,
            width: img.naturalWidth,
            height: img.naturalHeight,
          })

          // 使用原图的实际尺寸
          const width = img.naturalWidth
          const height = img.naturalHeight

          if (width === 0 || height === 0) {
            reject(new Error('Invalid image dimensions'))
            return
          }

          setImageSize({ width, height })
          setCanvasSize({ width, height })

          // 初始化画布
          const canvas = canvasRef.current
          if (canvas) {
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
          }

          resolve()
        }

        img.onerror = (err) => {
          console.error('[MaskEditor] Image load error:', {
            url: imageUrl,
            error: err,
          })
          reject(new Error('Failed to load image. Please check CORS configuration.'))
        }

        img.src = imageUrl
      })
    }

    loadImage().catch((err) => {
      console.error('[MaskEditor] Failed to initialize canvas:', err)
      alert('图片加载失败，请检查图片 URL 和 CORS 配置')
    })
  }, [isOpen, imageUrl])

  // 开始绘制
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    draw(e)
  }

  // 绘制蒙版（白色）
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing && e.type !== 'mousedown') return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 获取 canvas 显示尺寸和内部分辨率的比例
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    // 将鼠标坐标从显示空间转换到 canvas 内部坐标空间
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    // 画笔大小也需要按比例缩放
    const scaledBrushSize = brushSize * Math.max(scaleX, scaleY)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)' // 半透明白色
    ctx.beginPath()
    ctx.arc(x, y, scaledBrushSize, 0, Math.PI * 2)
    ctx.fill()
  }

  // 停止绘制
  const stopDrawing = () => {
    setIsDrawing(false)
  }

  // 清空画布
  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // 生成蒙版并提交（根据 mode 生成不同格式）
  const handleSubmit = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setIsSubmitting(true)

    try {
      // Midjourney 模式：原图在编辑区域变透明
      if (mode === 'midjourney') {
        // 加载原图
        const img = new window.Image()
        img.crossOrigin = 'anonymous' // 必须设置，否则 getImageData 会报 tainted canvas 错误

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            console.log('[MaskEditor] Image loaded for mask generation:', {
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              imageSize,
              canvasSize: { width: canvas.width, height: canvas.height }
            })

            // 验证尺寸是否一致
            if (img.naturalWidth !== imageSize.width || img.naturalHeight !== imageSize.height) {
              console.error('[MaskEditor] Size mismatch detected!', {
                imageNatural: { width: img.naturalWidth, height: img.naturalHeight },
                imageSize,
              })
            }

            resolve()
          }
          img.onerror = (err) => {
            console.error('[MaskEditor] Failed to load image for mask generation:', err)
            reject(new Error('Failed to load image. Please check CORS configuration.'))
          }
          img.src = imageUrl
        })

        // 使用实际加载的图片尺寸（而不是 imageSize state）
        const actualWidth = img.naturalWidth
        const actualHeight = img.naturalHeight

        // 创建目标画布（使用实际图片尺寸）
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = actualWidth
        maskCanvas.height = actualHeight

        const maskCtx = maskCanvas.getContext('2d')
        if (!maskCtx) return

        // 1. 绘制原图到画布（不缩放，1:1）
        maskCtx.drawImage(img, 0, 0, actualWidth, actualHeight)

        // 2. 获取用户绘制的蒙版（画布已经是原图尺寸，直接使用）
        const canvasImageData = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height)
        if (!canvasImageData) return

        // 3. 将用户绘制的区域在原图上变为透明
        const finalImageData = maskCtx.getImageData(0, 0, actualWidth, actualHeight)
        const finalData = finalImageData.data
        const userMask = canvasImageData.data

        // 如果画布和图片尺寸不一致，需要按比例映射
        const scaleX = actualWidth / canvas.width
        const scaleY = actualHeight / canvas.height

        console.log('[MaskEditor] Processing mask with scale:', { scaleX, scaleY })

        for (let y = 0; y < actualHeight; y++) {
          for (let x = 0; x < actualWidth; x++) {
            const finalIndex = (y * actualWidth + x) * 4

            // 映射到用户画布的坐标
            const canvasX = Math.floor(x / scaleX)
            const canvasY = Math.floor(y / scaleY)
            const canvasIndex = (canvasY * canvas.width + canvasX) * 4

            const userAlpha = userMask[canvasIndex + 3]
            // 如果用户在此处绘制过（有透明度），将该位置变为透明
            if (userAlpha > 10) {
              finalData[finalIndex + 3] = 0 // 设置 alpha 为 0（完全透明）
            }
          }
        }

        maskCtx.putImageData(finalImageData, 0, 0)

        // 4. 转换为 base64
        const maskBase64 = maskCanvas.toDataURL('image/png')

        console.log('[MaskEditor] Mask generated:', {
          maskSize: { width: maskCanvas.width, height: maskCanvas.height },
          base64Length: maskBase64.length
        })

        await onSubmit(maskBase64, prompt, imageUrl)
      } else {
        // GPT Image / Ideogram 模式：纯黑白蒙版（白色=编辑区域，使用原图尺寸）

        // 先加载图片获取实际尺寸
        const img = new window.Image()
        img.crossOrigin = 'anonymous'

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            console.log('[MaskEditor] Image loaded for GPT/Ideogram mask:', {
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              canvasSize: { width: canvas.width, height: canvas.height }
            })
            resolve()
          }
          img.onerror = (err) => {
            console.error('[MaskEditor] Failed to load image:', err)
            reject(new Error('Failed to load image. Please check CORS configuration.'))
          }
          img.src = imageUrl
        })

        const actualWidth = img.naturalWidth
        const actualHeight = img.naturalHeight

        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = actualWidth
        maskCanvas.height = actualHeight

        const maskCtx = maskCanvas.getContext('2d')
        if (!maskCtx) return

        // 填充黑色背景
        maskCtx.fillStyle = 'black'
        maskCtx.fillRect(0, 0, actualWidth, actualHeight)

        // 绘制白色蒙版区域（如果画布和图片尺寸不同，需要缩放）
        maskCtx.drawImage(canvas, 0, 0, actualWidth, actualHeight)

        // 转换为纯黑白
        const imageData = maskCtx.getImageData(0, 0, actualWidth, actualHeight)
        const data = imageData.data
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3]
          // 如果有透明度（绘制过），设为白色；否则设为黑色
          if (alpha > 10) {
            data[i] = 255 // R
            data[i + 1] = 255 // G
            data[i + 2] = 255 // B
            data[i + 3] = 255 // A
          } else {
            data[i] = 0
            data[i + 1] = 0
            data[i + 2] = 0
            data[i + 3] = 255
          }
        }
        maskCtx.putImageData(imageData, 0, 0)

        const maskBase64 = maskCanvas.toDataURL('image/png')

        console.log('[MaskEditor] GPT/Ideogram mask generated:', {
          maskSize: { width: maskCanvas.width, height: maskCanvas.height },
          base64Length: maskBase64.length
        })

        await onSubmit(maskBase64, prompt, imageUrl)
      }
    } catch (err) {
      console.error('Failed to submit mask:', err)
      alert(t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="space-y-3">
        <h3 className="font-display text-lg font-bold text-stone-900">
          {t('title')}
        </h3>

        <p className="font-ui text-sm text-stone-600">
          {t('description')}
        </p>

        {/* 画布容器：分层结构 - img 背景 + Canvas 蒙版覆盖层 */}
        <div
          ref={containerRef}
          className="relative border-2 border-stone-300 rounded-lg overflow-hidden bg-stone-100"
          style={{
            width: '100%',
            aspectRatio: '1',
            maxWidth: '500px',
            maxHeight: '50vh',
            margin: '0 auto'
          }}
        >
          {/* 背景图片 - 使用原生 img 标签，避免图片代理导致的 CORS 问题 */}          <img
            src={imageUrl}
            alt="Source image"
            className="absolute inset-0 w-full h-full object-contain"
            onError={() => {
              console.error('[MaskEditor] Background image load error:', imageUrl)
            }}
          />

          {/* 蒙版绘制层 - 透明 Canvas 覆盖在图片上方 */}
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{ pointerEvents: 'all' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </div>

        {/* 画笔大小控制 */}
        <div className="space-y-2">
          <label className="block font-ui text-sm font-medium text-stone-700">
            {t('brushSize')}: {brushSize}px
          </label>
          <input
            type="range"
            min="10"
            max="100"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Prompt 输入 */}
        <div className="space-y-2">
          <label className="block font-ui text-sm font-medium text-stone-700">
            {t('prompt')}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('promptPlaceholder')}
            rows={3}
            className="w-full px-4 py-2 rounded-lg border border-stone-300 focus:border-aurora-purple focus:ring-1 focus:ring-aurora-purple font-ui text-sm"
          />
          <p className="font-ui text-xs text-stone-500">
            {t('promptHint')}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={clearCanvas}
            className="flex-1"
          >
            {t('clear')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
            isLoading={isSubmitting}
          >
            {t('submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
