/**
 * 任务卡片组件
 * 显示单个任务的详细信息和操作按钮
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/i18n/client'
import { Button, Card } from '@/components/ui'
import { imageService, videoService } from '@/lib/api/services'
import type { ApiTask } from '@/lib/api/types/task'
import { cn } from '@/lib/utils/cn'
import { MaskEditor } from './MaskEditor'
import { PromptEditModal } from './PromptEditModal'
import { toast } from 'sonner'

interface TaskCardProps {
  task: ApiTask
  onUpdate: (nextTask?: ApiTask) => void
  onDelete?: () => void
}

export function TaskCard({ task, onUpdate, onDelete }: TaskCardProps) {
  const t = useTranslations('tasks')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showMaskEditor, setShowMaskEditor] = useState(false)
  const [showPromptEdit, setShowPromptEdit] = useState(false) // 显示prompt编辑弹窗（nanobanana）
  const [varyRegionCustomId, setVaryRegionCustomId] = useState<string | null>(null)
  const [pendingMjActionId, setPendingMjActionId] = useState<string | null>(null)
  const [isGptImageEdit, setIsGptImageEdit] = useState(false) // 标记是否为GPT Image编辑
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false) // 图片加载状态
  const mjActionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const service = task.type === 'image' ? imageService : videoService
  const operationBaseTime = task.completedAt || task.createdAt
  const operationBaseMs = new Date(operationBaseTime).getTime()
  const isOperationExpired =
    Number.isFinite(operationBaseMs) && Date.now() - operationBaseMs > 24 * 60 * 60 * 1000
  const isMjActionPending = pendingMjActionId !== null
  const failureReason = (() => {
    const raw = task.errorMessage?.trim()
    if (!raw) return t('failure.unknown')
    if (raw === 'CANCELED') return t('failure.canceled')
    if (raw === 'MODEL_REMOVED') return t('failure.modelRemoved')
    if (raw === 'MODAL') return t('failure.modalRequired')
    return raw
  })()

  useEffect(() => {
    return () => {
      if (mjActionResetTimerRef.current) {
        clearTimeout(mjActionResetTimerRef.current)
      }
    }
  }, [])

  // 状态颜色
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    processing: 'bg-blue-100 text-blue-800 border-blue-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
  }

  // 删除任务
  const handleDelete = async () => {
    setIsActionLoading(true)
    try {
      await service.deleteTask(task.id)
      onDelete?.()
      setShowConfirmDelete(false)
    } catch (err) {
      console.error('Failed to delete task:', err)
    } finally {
      setIsActionLoading(false)
    }
  }

  // 重试任务
  const handleRetry = async () => {
    setIsActionLoading(true)
    try {
      const nextTask = await service.retryTask(task.id)
      onUpdate(nextTask)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('Failed to retry task:', err)
      toast.error(errorMessage || t('errors.retry'))
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleCancel = async () => {
    if (task.type !== 'video') return

    setIsActionLoading(true)
    try {
      const updatedTask = await videoService.cancelTask(task.id)
      onUpdate(updatedTask)
    } catch (err) {
      console.error('Failed to cancel task:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      toast.error(errorMessage || t('errors.cancel'))
    } finally {
      setIsActionLoading(false)
    }
  }

  // Midjourney U/V 操作
  const handleMjAction = async (customId: string, label?: string) => {
    if (task.type !== 'image') return
    if (isMjActionPending || isActionLoading) return
    if (isOperationExpired) {
      alert('生成时间超过24小时，无法继续操作')
      return
    }

    // 检测是否是 Vary (Region) / Inpaint 按钮
    // MJ 的局部重绘 customId 格式: MJ::Inpaint::...
    const isVaryRegion = customId.includes('::Inpaint::') ||
                         (label?.toLowerCase().includes('vary') && label?.toLowerCase().includes('region'))

    if (isVaryRegion) {
      // Vary Region：打开蒙版编辑器，但不立即提交任务
      setVaryRegionCustomId(customId)
      setShowMaskEditor(true)
      return
    }

    // 普通按钮操作：直接提交
    if (mjActionResetTimerRef.current) {
      clearTimeout(mjActionResetTimerRef.current)
    }
    setPendingMjActionId(customId)
    setIsActionLoading(true)
    try {
      const nextTask = await imageService.midjourneyAction(task.id, { customId })
      onUpdate(nextTask)
    } catch (err) {
      console.error('Failed to execute MJ action:', err)
      toast.error(t('errors.mjAction'))
    } finally {
      setIsActionLoading(false)
      mjActionResetTimerRef.current = setTimeout(() => {
        setPendingMjActionId((current) => (current === customId ? null : current))
      }, 12_000)
    }
  }

  // 处理蒙版提交（使用新的 edits API，一步到位）
  const handleMaskSubmit = async (maskBase64: string, prompt: string, actualImageUrl: string) => {
    if (!actualImageUrl) {
      console.error('[TaskCard] No image URL provided')
      return
    }

    setIsSubmitting(true)
    try {
      // 使用新的 edits API，一次请求完成
      const nextTask = await imageService.midjourneyEdits(task.id, {
        prompt: prompt || task.prompt,
        image: actualImageUrl, // 使用实际加载的图片 URL（与蒙版尺寸完全一致）
        maskBase64, // 蒙版（基于 actualImageUrl 生成，需要编辑的地方变为透明）
      })

      setShowMaskEditor(false)
      setVaryRegionCustomId(null)
      onUpdate(nextTask)
    } catch (err) {
      console.error('[TaskCard] Failed to submit mask:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      alert(`提交失败：${errorMessage}`)
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  // 处理 GPT Image 编辑 - 打开蒙版编辑器
  const handleGptImageEdit = () => {
    if (!task.resultUrl) return

    // 打开蒙版编辑器
    setIsGptImageEdit(true)
    setShowMaskEditor(true)
  }

  // 处理 GPT Image 蒙版提交
  const handleGptImageMaskSubmit = async (maskBase64: string, prompt: string, actualImageUrl: string) => {
    if (!actualImageUrl) {
      console.error('[TaskCard] No image URL provided for GPT Image edit')
      return
    }

    setIsSubmitting(true)
    try {
      // 构建请求参数
      const requestData = {
        modelId: task.modelId, // 使用原任务的modelId
        prompt: prompt || task.prompt,
        parameters: {
          gptImageOperation: 'edits',
          imageUrl: actualImageUrl, // 使用实际加载的图片 URL
          maskBase64: maskBase64,
        },
      }

      // 调用图片生成API
      const nextTask = await imageService.generate(requestData)

      setShowMaskEditor(false)
      setIsGptImageEdit(false)
      onUpdate(nextTask)
    } catch (err) {
      console.error('Failed to submit GPT Image edit:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      alert(`编辑失败：${errorMessage}`)
      throw err
    } finally {
      setIsSubmitting(false)
    }
  }

  // 处理 nanobanana 重绘 - 打开prompt编辑弹窗
  const handleNanobananaRemix = () => {
    setShowPromptEdit(true)
  }

  // 处理 nanobanana prompt提交
  const handleNanobananaPromptSubmit = async (newPrompt: string) => {
    if (!task.resultUrl) return

    try {
      // 构建请求参数
      const requestData = {
        modelId: task.modelId, // 使用原任务的modelId
        prompt: newPrompt,
        parameters: {
          imageUrl: task.resultUrl, // 原图URL
        },
      }

      // 调用图片生成API
      const nextTask = await imageService.generate(requestData)

      setShowPromptEdit(false)
      onUpdate(nextTask)
    } catch (err) {
      console.error('Failed to submit nanobanana remix:', err)
      const errorMessage = err instanceof Error ? err.message : String(err)
      alert(`重绘失败：${errorMessage}`)
      throw err
    }
  }

  // 处理下载
  const handleDownload = async () => {
    if (!task.resultUrl) return

    try {
      // 获取文件扩展名
      const fileExt = task.type === 'image' ? 'png' : 'mp4'
      const fileName = `flowmuse_${task.taskNo}_${Date.now()}.${fileExt}`

      // 尝试通过 fetch 下载（支持同源或配置了 CORS 的资源）
      try {
        const response = await fetch(task.resultUrl)
        if (!response.ok) throw new Error('Failed to fetch')
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } catch (fetchError) {
        // 如果 fetch 失败（CORS 问题），使用直接链接方式
        console.log('Fetch failed, trying direct link download:', fetchError)
        const a = document.createElement('a')
        a.href = task.resultUrl
        a.download = fileName
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } catch (err) {
      console.error('Failed to download:', err)
      alert('下载失败，请在新标签页中打开并手动保存')
      // 最后的备选方案：在新标签页中打开
      window.open(task.resultUrl, '_blank', 'noopener,noreferrer')
    }
  }

  // 解析 MJ 按钮
  const mjButtons = task.providerData?.buttons as Array<{
    customId: string
    emoji?: string
    label?: string
    type?: number
  }> | undefined

  // 从 customId 提取按钮文本的辅助函数
  const getButtonLabel = (button: { customId: string; emoji?: string; label?: string }) => {
    // 如果有 label，先尝试映射到翻译键
    if (button.label) {
      const translationKey = mapLabelToTranslationKey(button.label)
      if (translationKey) {
        return t(`midjourney.buttons.${translationKey}`)
      }
      // 如果没有映射，返回原始 label
      return button.label
    }

    // 如果没有 label，从 customId 解析
    const parts = button.customId.split('::')
    if (parts.length >= 3) {
      const action = parts[2] // upsample, variation, reroll, Inpaint, etc.
      const index = parts[3] || '' // 1, 2, 3, 4

      // Inpaint (局部重绘)
      if (action === 'Inpaint') {
        return t('midjourney.buttons.inpaint')
      }

      // 根据 action 类型返回翻译
      if (action === 'upsample') {
        return index ? t(`midjourney.buttons.u${index}`) : t('midjourney.buttons.upscale')
      }
      if (action === 'variation') {
        return index ? t(`midjourney.buttons.v${index}`) : t('midjourney.buttons.variation')
      }
      if (action === 'reroll') {
        return button.emoji || t('midjourney.buttons.reroll')
      }
      if (action.startsWith('high_variation')) {
        return button.emoji || t('midjourney.buttons.varyStrong')
      }
      if (action.startsWith('low_variation')) {
        return button.emoji || t('midjourney.buttons.varySubtle')
      }
    }

    // 最后使用 emoji 或默认显示前8位 customId
    return button.emoji || button.customId.substring(0, 8)
  }

  // 将英文 label 映射到翻译键
  const mapLabelToTranslationKey = (label: string): string | null => {
    // 规范化：转小写并移除所有非字母数字字符（包括空格、括号等）
    const normalizedLabel = label.toLowerCase().replace(/[^a-z0-9]/g, '')

    const labelMap: Record<string, string> = {
      // Upscale variations
      'upscale2x': 'upscale2x',
      'upscale4x': 'upscale4x',
      '2xupscale': 'upscale2x',
      '4xupscale': 'upscale4x',

      // Variations
      'makevariations': 'variations',
      'variations': 'variations',
      'varyregion': 'varyRegion',
      'varysubtle': 'varySubtle',
      'varystrong': 'varyStrong',

      // Zoom
      'zoomout2x': 'zoomOut2x',
      'zoomout15x': 'zoomOut1_5x',
      '2xzoomout': 'zoomOut2x',
      '15xzoomout': 'zoomOut1_5x',
      'customzoom': 'customZoom',

      // Square
      'makesquare': 'makeSquare',
      'square': 'makeSquare',

      // Pan
      'panleft': 'panLeft',
      'panright': 'panRight',
      'panup': 'panUp',
      'pandown': 'panDown',

      // Reroll
      'reroll': 'reroll',

      // Inpaint
      'inpaint': 'inpaint',

      // U/V buttons
      'u1': 'u1',
      'u2': 'u2',
      'u3': 'u3',
      'u4': 'u4',
      'v1': 'v1',
      'v2': 'v2',
      'v3': 'v3',
      'v4': 'v4',
    }

    return labelMap[normalizedLabel] || null
  }

  return (
    <>
    <Card variant="glass" className="relative overflow-hidden">
      <div className="flex flex-col h-full">
        {/* 预览图 */}
        {task.status === 'completed' && (task.thumbnailUrl || task.resultUrl) && (
          <div className="relative w-full mb-4 rounded-lg overflow-hidden">
            {task.type === 'image' ? (
              <div className="aspect-video bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100">
                {/* 占位符 */}
                {!imageLoaded && (
                  <div className="absolute inset-0 w-full h-full flex items-center justify-center animate-pulse">
                    <svg className="w-12 h-12 text-stone-300" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
                <img
                  src={task.thumbnailUrl || task.resultUrl || ''}
                  alt={task.prompt}
                  loading="lazy"
                  className={cn(
                    'w-full h-auto object-contain transition-opacity duration-300',
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  )}
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    console.error('[TaskCard] Image load error for task:', task.id, 'url:', task.thumbnailUrl || task.resultUrl)
                    setImageLoaded(true) // 即使错误也标记为已加载
                  }}
                />
              </div>
            ) : (
              <video
                src={task.resultUrl || ''}
                controls
                preload="metadata"
                className="w-full h-auto"
                poster={task.thumbnailUrl || undefined}
                onError={(e) => {
                  console.error('[TaskCard] Video load error for task:', task.id, 'url:', task.resultUrl)
                }}
              />
            )}
          </div>
        )}

        {/* 调试信息：显示为什么没有预览图 */}
        {task.status === 'completed' && !task.resultUrl && !task.thumbnailUrl && (
          <div className="relative w-full aspect-video mb-4 rounded-lg overflow-hidden bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center">
            <div className="text-center p-4">
              <p className="text-yellow-800 font-medium mb-2">⚠️ 任务已完成但无结果文件</p>
              <p className="text-xs text-yellow-600">resultUrl 和 thumbnailUrl 都为空</p>
              <p className="text-xs text-yellow-600 mt-1">任务ID: {task.id}</p>
            </div>
          </div>
        )}

        {/* 任务信息 */}
        <div className="flex-1">
          {/* 状态标签 */}
          <div className="flex items-center justify-between mb-3">
            <span
              className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border',
                statusColors[task.status]
              )}
            >
              {t(`status.${task.status}`)}
            </span>
            <span className="text-xs text-stone-500">
              {task.type === 'image' ? '图片' : '视频'}
            </span>
          </div>

          <p className="font-ui text-sm text-stone-900 dark:text-stone-100 mb-3 line-clamp-2">
            {task.prompt}
          </p>

          {/* 错误信息 */}
          {task.status === 'failed' && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/30">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-200">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  />
                </svg>
                <span>{t('failure.reason')}</span>
              </div>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-ui text-xs leading-5 text-red-700 dark:text-red-100">
                {failureReason}
              </p>
            </div>
          )}

          {/* 详细信息 */}
          <div className="grid grid-cols-1 gap-2 text-xs text-stone-600 dark:text-stone-400 mb-4">
            <div>
              <span className="font-medium">{t('info.createdAt')}:</span>{' '}
              {new Date(task.createdAt).toLocaleDateString()}
            </div>
          </div>

          {/* Midjourney U/V 按钮 */}
          {task.status === 'completed' &&
            (task.provider === 'midjourney' || task.provider === 'mj') &&
            mjButtons &&
            mjButtons.length > 0 && (
              <div className="mb-4">
                <p className="font-ui text-xs font-medium text-stone-700 mb-2">
                  {t('midjourney.actions')}:
                </p>
                {isOperationExpired ? (
                  <p className="font-ui text-xs text-stone-500 mb-2">
                    生成时间超过24小时，无法继续操作
                  </p>
                ) : null}
                <div className="grid grid-cols-4 gap-2">
                  {mjButtons.map((button, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant="secondary"
                      onClick={() => handleMjAction(button.customId, button.label)}
                      disabled={isActionLoading || isOperationExpired || isMjActionPending}
                      className="text-xs"
                    >
                      {pendingMjActionId === button.customId
                        ? t('midjourney.submitting')
                        : getButtonLabel(button)}
                    </Button>
                  ))}
                </div>
              </div>
            )}

          {/* GPT Image 编辑按钮 */}
          {task.status === 'completed' &&
            task.type === 'image' &&
            task.provider === 'gptimage' &&
            task.resultUrl && (
              <div className="mb-4">
                <p className="font-ui text-xs font-medium text-stone-700 mb-2">
                  GPT Image 操作:
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleGptImageEdit}
                  disabled={isActionLoading}
                  className="w-full"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  编辑图片
                </Button>
              </div>
            )}

          {/* Nanobanana 重绘按钮 */}
          {task.status === 'completed' &&
            task.type === 'image' &&
            task.provider === 'nanobanana' &&
            task.resultUrl && (
              <div className="mb-4">
                <p className="font-ui text-xs font-medium text-stone-700 mb-2">
                  Nanobanana 操作:
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleNanobananaRemix}
                  disabled={isActionLoading}
                  className="w-full"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  重绘图片
                </Button>
              </div>
            )}

          {/* 操作按钮 */}
          <div className="flex flex-wrap gap-2">
            {task.type === 'video' && task.canCancel && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancel}
                disabled={isActionLoading}
                className="flex-1 min-w-[100px]"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                {t('actions.cancel')}
              </Button>
            )}

            {/* 下载按钮 */}
            {task.status === 'completed' && task.resultUrl && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleDownload}
                disabled={isActionLoading}
                className="flex-1 min-w-[100px]"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                {t('actions.download')}
              </Button>
            )}

            {/* 重试按钮 */}
            {task.status === 'failed' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRetry}
                disabled={isActionLoading}
                className="flex-1 min-w-[80px]"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {t('actions.retry')}
              </Button>
            )}

            {/* 删除按钮 */}
            {!showConfirmDelete ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowConfirmDelete(true)}
                disabled={isActionLoading}
                className="shrink-0 whitespace-nowrap text-red-600 hover:bg-red-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </Button>
            ) : (
              <div className="ml-auto inline-flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowConfirmDelete(false)}
                  className="whitespace-nowrap"
                >
                  {t('confirm.delete.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={isActionLoading}
                  className="whitespace-nowrap bg-red-600 hover:bg-red-700 text-white"
                >
                  {t('confirm.delete.confirm')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>

    {/* 蒙版编辑器 */}
    {showMaskEditor && (
      <MaskEditor
        isOpen={showMaskEditor}
        imageUrl={
          // MJ 使用缩略图，其他使用高清图
          isGptImageEdit
            ? task.resultUrl || ''
            : task.thumbnailUrl || task.resultUrl || ''
        }
        mode={
          isGptImageEdit
            ? 'gptimage'
            : 'midjourney'
        }
        onClose={() => {
          setShowMaskEditor(false)
          setVaryRegionCustomId(null)
          setIsGptImageEdit(false)
        }}
        onSubmit={
          isGptImageEdit
            ? handleGptImageMaskSubmit
            : handleMaskSubmit
        }
      />
    )}

    {/* Prompt编辑弹窗（nanobanana重绘） */}
    {showPromptEdit && (
      <PromptEditModal
        isOpen={showPromptEdit}
        title="重绘图片"
        label="图片描述"
        initialPrompt={task.prompt}
        placeholder="输入新的描述，基于原图重新生成..."
        helperText="描述你想要在图片中看到的内容"
        submitText="开始重绘"
        onClose={() => setShowPromptEdit(false)}
        onSubmit={handleNanobananaPromptSubmit}
      />
    )}
  </>
  )
}
