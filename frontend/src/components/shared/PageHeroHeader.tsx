'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export interface PageHeroHeaderProps {
  id?: string
  badge?: ReactNode
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
  actionsClassName?: string
}

export function PageHeroHeader({
  id,
  badge,
  title,
  description,
  meta,
  actions,
  className,
  actionsClassName,
}: PageHeroHeaderProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative overflow-hidden rounded-[30px] border border-stone-200/80 bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.12),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(251,146,60,0.12),_transparent_28%),linear-gradient(180deg,_rgba(255,255,255,0.94),_rgba(248,250,252,0.98))] px-4 py-5 shadow-canvas sm:px-6 sm:py-6 lg:px-8 lg:py-7 dark:border-stone-800 dark:bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.18),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(20,184,166,0.14),_transparent_26%),linear-gradient(180deg,_rgba(10,12,18,0.98),_rgba(16,23,42,0.98))]',
        className,
      )}
    >
      <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.48),_transparent_65%)] lg:block dark:bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.06),_transparent_68%)]" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          {badge ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-xs font-medium text-stone-600 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-stone-300">
              {badge}
            </span>
          ) : null}

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl lg:text-4xl dark:text-white">
              {title}
            </h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-300 sm:text-base">
                {description}
              </p>
            ) : null}
          </div>

          {meta ? (
            <div className="flex flex-wrap items-center gap-2">
              {meta}
            </div>
          ) : null}
        </div>

        {actions ? (
          <div className={cn('w-full lg:w-auto', actionsClassName)}>
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  )
}
