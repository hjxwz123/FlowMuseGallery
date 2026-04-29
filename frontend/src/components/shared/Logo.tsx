/**
 * Logo 组件
 * Canvas Design System - 品牌标识
 */

'use client'

import Link from '@/lib/compat/link'
import { useLocale } from '@/i18n/client'
import { cn } from '@/lib/utils/cn'
import { PERSONAL_SITE_TITLE } from '@/lib/utils/siteSettings'

interface LogoProps {
  className?: string
  variant?: 'default' | 'light'
}

export const Logo = ({ className, variant = 'default' }: LogoProps) => {
  const locale = useLocale()

  return (
    <Link
      href={`/${locale}`}
      className={cn(
        'flex items-center gap-3 transition-all duration-300 ease-out hover:scale-105',
        className
      )}
    >
      {/* Logo Icon */}
      <div className="relative h-10 w-10 overflow-hidden rounded-xl">
        <img
          src="/icons/icon-192x192.png"
          alt=""
          className="h-full w-full object-cover"
          aria-hidden="true"
        />
      </div>

      {/* Brand Name */}
      <span
        className={cn(
          'font-display text-2xl font-bold transition-colors duration-300',
          variant === 'light' ? 'text-white' : 'text-stone-900 dark:text-stone-100'
        )}
      >
        {PERSONAL_SITE_TITLE}
      </span>
    </Link>
  )
}
