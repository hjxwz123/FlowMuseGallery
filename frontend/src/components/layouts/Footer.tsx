'use client'

import { cn } from '@/lib/utils/cn'
import { PERSONAL_SITE_FOOTER } from '@/lib/utils/siteSettings'

export const Footer = () => {
  return (
    <footer
      className={cn(
        'w-full border-t pb-16 backdrop-blur-sm md:pb-0',
        'border-stone-200 bg-canvas/95 dark:border-stone-800 dark:bg-canvas-dark/95',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <p className="text-center font-ui text-sm text-stone-600 dark:text-stone-400">{PERSONAL_SITE_FOOTER}</p>
      </div>
    </footer>
  )
}
