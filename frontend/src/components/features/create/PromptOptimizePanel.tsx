'use client'

import { Wand2 } from 'lucide-react'
import { useTranslations } from '@/i18n/client'

interface PromptOptimizePanelProps {
  isOptimizing: boolean
  showOptimizeResult: boolean
  optimizeText: string
  optimizedPrompts: string[]
  hasRequestPrompt: boolean
  onOptimizePrompt: () => void
  onUsePrompt: (nextPrompt: string) => void
  canIncludeImages?: boolean
  includeImages?: boolean
  onToggleIncludeImages?: (checked: boolean) => void
}

export function PromptOptimizePanel({
  isOptimizing,
  showOptimizeResult,
  optimizeText,
  optimizedPrompts,
  hasRequestPrompt,
  onOptimizePrompt,
  onUsePrompt,
  canIncludeImages = false,
  includeImages = false,
  onToggleIncludeImages,
}: PromptOptimizePanelProps) {
  const t = useTranslations('create')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onOptimizePrompt}
          disabled={isOptimizing || !hasRequestPrompt}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-aurora-purple px-3 py-2 text-sm font-medium text-white transition-all hover:bg-aurora-purple/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1.5"
        >
          <Wand2 className="h-3.5 w-3.5" />
          {isOptimizing ? t('form.prompt.optimizing') : t('form.prompt.optimize')}
        </button>

        {canIncludeImages && onToggleIncludeImages ? (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeImages}
              onChange={(event: { target: { checked: boolean } }) =>
                onToggleIncludeImages(event.target.checked)
              }
              className="h-3.5 w-3.5 rounded border-stone-300 bg-white text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-800"
            />
            {t('form.prompt.includeImages')}
          </label>
        ) : null}
      </div>

      {showOptimizeResult ? (
        <div className="space-y-2">
          {isOptimizing ? (
            <div className="rounded-lg border border-stone-200 bg-muted/50 p-3 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-300">
              {optimizeText || t('form.prompt.optimizing')}
            </div>
          ) : null}

          {!isOptimizing && optimizedPrompts.length > 0 ? (
            <>
              <p className="text-sm font-medium">{t('form.prompt.optimizedResult')}</p>
              <div className="grid gap-2">
                {optimizedPrompts.map((optimizedPrompt: string, index: number) => (
                  <div
                    key={index}
                    className="group relative rounded-lg border border-stone-200 bg-white p-3 transition-colors hover:border-aurora-purple/50 dark:border-stone-700 dark:bg-stone-900/90 dark:hover:border-aurora-purple/40 dark:hover:bg-stone-800/90"
                  >
                    <p className="whitespace-pre-wrap pr-0 text-sm sm:pr-16">{optimizedPrompt}</p>
                    <button
                      type="button"
                      onClick={() => onUsePrompt(optimizedPrompt)}
                      className="mt-3 w-full rounded-md bg-aurora-purple/10 px-2.5 py-1.5 text-xs font-medium text-aurora-purple transition-colors hover:bg-aurora-purple/20 sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:w-auto sm:py-1"
                    >
                      {t('form.prompt.useOptimized')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
