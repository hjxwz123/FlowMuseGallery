/**
 * 主题提供者组件
 * 负责初始化主题并应用到 DOM
 */

'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/lib/store/themeStore'

function syncDarkReaderLock(resolvedTheme: 'light' | 'dark') {
  const root = window.document.documentElement
  const head = window.document.head
  if (!head) return

  root.style.colorScheme = resolvedTheme

  let lockMeta = head.querySelector('meta[name="darkreader-lock"]')
  if (resolvedTheme === 'dark') {
    if (!lockMeta) {
      lockMeta = window.document.createElement('meta')
      lockMeta.setAttribute('name', 'darkreader-lock')
      head.appendChild(lockMeta)
    }
    return
  }

  lockMeta?.remove()
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, _hasHydrated, setHasHydrated } = useThemeStore()

  useEffect(() => {
    // 确保组件已挂载
    setHasHydrated(true)

    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
      syncDarkReaderLock(systemTheme)

      // 监听系统主题变化
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark')
        const nextTheme = e.matches ? 'dark' : 'light'
        root.classList.add(nextTheme)
        syncDarkReaderLock(nextTheme)
      }

      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    } else {
      root.classList.add(theme)
      syncDarkReaderLock(theme)
    }
  }, [theme, setHasHydrated])

  // 在客户端水合完成前，避免闪烁
  if (!_hasHydrated) {
    return null
  }

  return <>{children}</>
}
