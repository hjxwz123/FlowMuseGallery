/**
 * 提示词详情模态框组件
 * 展示提示词的完整信息
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from '@/i18n/client'
import type { Prompt } from '@/lib/types/prompt'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui'

interface PromptDetailModalProps {
  prompt: Prompt
  onClose: () => void
}

export function PromptDetailModal({ prompt, onClose }: PromptDetailModalProps) {
  const t = useTranslations('prompts.modal')
  const [imageError, setImageError] = useState(false)
  const [copied, setCopied] = useState(false)

  // 阻止背景滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // 复制提示词
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors"
        >
          <svg
            className="w-6 h-6 text-stone-600"
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
        </button>

        {/* 预览图 - 始终显示 */}
        <div className="relative w-full pt-[56.25%] overflow-hidden rounded-t-3xl bg-gradient-to-br from-stone-100 to-stone-200">
          {prompt.preview && !imageError ? (
            <img
              src={prompt.preview}
              alt={prompt.title}
              className="absolute top-0 left-0 w-full h-full object-cover"
              onError={() => {
                console.error('Image failed to load:', prompt.preview)
                setImageError(true)
              }}
              onLoad={() => console.log('Image loaded:', prompt.preview)}
            />
          ) : (
            // 占位图
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-aurora-pink/10 via-aurora-purple/10 to-aurora-blue/10">
              <svg
                className="w-32 h-32 text-stone-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* 内容 */}
        <div className="p-8 space-y-6">
          {/* 标题和模式 */}
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-display text-3xl font-bold text-stone-900">
              {prompt.title}
            </h2>
            <span
              className={cn(
                'inline-flex items-center px-4 py-2 rounded-full text-sm font-medium',
                prompt.mode === 'generate'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-100 text-blue-800'
              )}
            >
              {t(`mode.${prompt.mode}`)}
            </span>
          </div>

          {/* 提示词 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-ui font-semibold text-stone-900">
                {t('prompt')}
              </h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCopy}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
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
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {t('copied')}
                  </>
                ) : (
                  <>
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    {t('copyPrompt')}
                  </>
                )}
              </Button>
            </div>
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
              <p className="font-ui text-stone-700 whitespace-pre-wrap">
                {prompt.prompt}
              </p>
            </div>
          </div>

          {/* 元信息 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 作者 */}
            <div className="space-y-1">
              <p className="font-ui text-sm text-stone-600">{t('author')}</p>
              <p className="font-ui font-medium text-stone-900">
                {prompt.author}
              </p>
            </div>

            {/* 分类 */}
            <div className="space-y-1">
              <p className="font-ui text-sm text-stone-600">{t('category')}</p>
              <p className="font-ui font-medium text-stone-900">
                {prompt.category}
                {prompt.sub_category && ` / ${prompt.sub_category}`}
              </p>
            </div>

            {/* 创建时间 */}
            <div className="space-y-1">
              <p className="font-ui text-sm text-stone-600">{t('created')}</p>
              <p className="font-ui font-medium text-stone-900">
                {new Date(prompt.created).toLocaleDateString()}
              </p>
            </div>

            {/* 原始链接 */}
            {prompt.link && (
              <div className="space-y-1">
                <p className="font-ui text-sm text-stone-600">{t('link')}</p>
                <a
                  href={prompt.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-ui font-medium text-aurora-purple hover:text-aurora-pink transition-colors inline-flex items-center gap-1"
                >
                  {t('visitLink')}
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            )}
          </div>

          {/* 关闭按钮 */}
          <div className="pt-4 border-t border-stone-200">
            <Button variant="ghost" onClick={onClose} className="w-full">
              {t('close')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
