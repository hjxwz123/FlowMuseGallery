/**
 * 语言切换器 - 下拉列表
 * 根据 locales 配置动态显示可用语言
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import { usePathname, useRouter, useSearchParams } from '@/lib/router'
import { cn } from '@/lib/utils/cn'
import { locales } from '@/i18n/locales'
import { ChevronDown, Check, Globe } from 'lucide-react'

interface LanguageSwitcherProps {
  className?: string
  variant?: 'full' | 'icon'
  showNativeTitle?: boolean
}

export const LanguageSwitcher = ({
  className,
  variant = 'full',
  showNativeTitle = true,
}: LanguageSwitcherProps) => {
  const t = useTranslations('nav.language')
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) {
      setIsOpen(false)
      return
    }

    const nextPathname = pathname.startsWith(`/${locale}`)
      ? pathname.replace(`/${locale}`, `/${newLocale}`)
      : `/${newLocale}${pathname}`
    const query = searchParams.toString()
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    const nextUrl = `${nextPathname}${query ? `?${query}` : ''}${hash}`

    router.replace(nextUrl)
    router.refresh()
    setIsOpen(false)
  }

  // 获取语言显示名称
  const getLanguageName = (localeCode: string) => {
    try {
      return t(`languages.${localeCode}`)
    } catch {
      // 如果翻译不存在，返回 locale code
      return localeCode
    }
  }

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* 触发按钮 */}
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
            'bg-stone-100 text-stone-700 hover:bg-stone-200',
            'dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
            'transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-aurora-purple/40'
          )}
          aria-label={t('title')}
          aria-expanded={isOpen}
          title={showNativeTitle ? `${t('title')}: ${getLanguageName(locale)}` : undefined}
        >
          <Globe className="h-5 w-5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'group relative flex items-center gap-2 rounded-full px-4 py-2',
            'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm border border-stone-200 dark:border-stone-700',
            'shadow-canvas hover:shadow-canvas-lg',
            'transition-all duration-300 ease-out',
            'hover:scale-105 hover:border-aurora-purple/30',
            isOpen && 'border-aurora-purple/30 shadow-canvas-lg'
          )}
          aria-label={t('title')}
          aria-expanded={isOpen}
        >
          {/* Globe Icon */}
          <Globe className="h-5 w-5 text-stone-600 transition-colors duration-300 group-hover:text-aurora-purple" />

          {/* Current Language */}
          <span className="font-ui text-sm font-medium text-stone-700 dark:text-stone-200 transition-colors duration-300 group-hover:text-aurora-purple dark:group-hover:text-aurora-purple">
            {getLanguageName(locale)}
          </span>

          {/* Chevron */}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-stone-400 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      )}

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 min-w-[140px]',
            variant === 'icon'
              ? 'left-full bottom-0 ml-2 origin-bottom-left'
              : 'right-0 top-full mt-2 origin-top-right',
            'rounded-xl overflow-hidden',
            'bg-white/95 dark:bg-stone-900/95 backdrop-blur-sm border border-stone-200 dark:border-stone-700',
            'shadow-lg shadow-stone-200/50',
            variant === 'icon'
              ? 'animate-in fade-in-0 zoom-in-95 slide-in-from-left-2 duration-200'
              : 'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
        >
          <div className="py-1">
            {locales.map((localeCode) => (
              <button
                key={localeCode}
                onClick={() => switchLocale(localeCode)}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-2.5',
                  'font-ui text-sm transition-colors duration-150',
                  localeCode === locale
                    ? 'bg-aurora-purple/10 text-aurora-purple font-medium'
                    : 'text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100'
                )}
              >
                <span>{getLanguageName(localeCode)}</span>
                {localeCode === locale && (
                  <Check className="h-4 w-4 text-aurora-purple" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
