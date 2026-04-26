/**
 * 提示词卡片组件
 * 展示单个提示词的预览信息
 */

'use client'

import { useState } from 'react'
import { useTranslations } from '@/i18n/client'
import type { Prompt } from '@/lib/types/prompt'
import { cn } from '@/lib/utils/cn'
import { AnimatedCard } from '@/components/shared/AnimatedCard'

interface PromptCardProps {
  prompt: Prompt
  onClick: () => void
}

export function PromptCard({ prompt, onClick }: PromptCardProps) {
  const t = useTranslations('prompts.card')
  const [imageError, setImageError] = useState(false)

  // 截断提示词文本
  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // 判断是否显示图片
  const shouldShowImage = prompt.preview && !imageError

  return (
    <AnimatedCard>
      <div
        onClick={onClick}
        className="cursor-pointer group overflow-hidden bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700 hover:border-aurora-purple dark:hover:border-aurora-purple transition-all duration-300 hover:shadow-aurora"
      >
        {/* 预览图容器 */}
        <div className="relative w-full pt-[100%] bg-gradient-to-br from-stone-100 to-stone-200 overflow-hidden">
          {shouldShowImage ? (
            /* 实际图片 */
            <img
              src={prompt.preview}
              alt={prompt.title}
              className="absolute top-0 left-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => {
                console.error('Image failed to load:', prompt.preview)
                setImageError(true)
              }}
              onLoad={() => console.log('Image loaded:', prompt.preview)}
            />
          ) : (
            /* 占位符 */
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-gradient-to-br from-aurora-pink/10 via-aurora-purple/10 to-aurora-blue/10">
              <svg
                className="w-24 h-24 text-stone-300"
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

          {/* 模式标签 - 始终在最上层 */}
          <div className="absolute top-3 right-3 z-10">
            <span
              className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium backdrop-blur-sm shadow-sm',
                prompt.mode === 'generate'
                  ? 'bg-green-100/90 text-green-800'
                  : 'bg-blue-100/90 text-blue-800'
              )}
            >
              {t(`mode.${prompt.mode}`)}
            </span>
          </div>
        </div>

        {/* 内容 */}
        <div className="p-4 space-y-3">
          {/* 标题 */}
          <h3 className="font-display text-lg font-semibold text-stone-900 line-clamp-2 group-hover:text-aurora-purple transition-colors">
            {prompt.title}
          </h3>

          {/* 提示词预览 */}
          <p className="font-ui text-sm text-stone-600 line-clamp-3">
            {truncateText(prompt.prompt, 120)}
          </p>

          {/* 作者和分类 */}
          <div className="flex items-center justify-between text-xs text-stone-500">
            <div className="flex items-center gap-1">
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span className="font-medium">{prompt.author}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 font-medium">
                {prompt.category}
              </span>
            </div>
          </div>

          {/* 查看详情按钮 */}
          <div className="pt-2 border-t border-stone-100">
            <span className="text-sm font-medium text-aurora-purple group-hover:text-aurora-pink transition-colors">
              {t('viewDetail')} →
            </span>
          </div>
        </div>
      </div>
    </AnimatedCard>
  )
}
