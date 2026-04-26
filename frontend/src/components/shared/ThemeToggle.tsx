/**
 * 主题切换按钮组件
 * 用于切换亮色/暗黑/系统主题
 */

'use client'

import { useThemeStore } from '@/lib/store/themeStore'
import { cn } from '@/lib/utils/cn'

export function ThemeToggle({
  className,
  showNativeTitle = true,
}: {
  className?: string
  showNativeTitle?: boolean
}) {
  const { theme, setTheme } = useThemeStore()

  const handleToggle = () => {
    // 循环切换: light -> dark -> system -> light
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  return (
    <button
      onClick={handleToggle}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
        'bg-stone-100 text-stone-700 hover:bg-stone-200',
        'dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-aurora-purple/40',
        className
      )}
      aria-label="切换主题"
      title={showNativeTitle ? `当前主题: ${theme === 'light' ? '亮色' : theme === 'dark' ? '暗黑' : '跟随系统'}` : undefined}
    >
      {/* 太阳图标 (亮色模式) */}
      {theme === 'light' && (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      )}

      {/* 月亮图标 (暗黑模式) */}
      {theme === 'dark' && (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}

      {/* 电脑图标 (系统模式) */}
      {theme === 'system' && (
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  )
}
