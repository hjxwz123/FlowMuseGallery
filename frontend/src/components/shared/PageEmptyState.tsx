'use client'

import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

interface PageEmptyStateProps {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function PageEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: PageEmptyStateProps) {
  return (
    <section
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 bg-stone-50/70 px-6 py-16 text-center dark:border-stone-800 dark:bg-stone-950/70',
        className,
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-400 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
        {icon}
      </div>
      <h3 className="font-display text-2xl text-stone-900 dark:text-stone-100">
        {title}
      </h3>
      {description ? (
        <p className="mt-2 max-w-md font-ui text-sm leading-6 text-stone-600 dark:text-stone-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}
