/**
 * 主题状态管理 (Zustand)
 * 管理应用的暗黑/亮色模式
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  // 状态
  theme: Theme
  _hasHydrated: boolean

  // 操作
  setTheme: (theme: Theme) => void
  setHasHydrated: (state: boolean) => void
}

function syncDarkReaderLock(theme: 'light' | 'dark') {
  if (typeof window === 'undefined') return

  const root = window.document.documentElement
  const head = window.document.head
  if (!head) return

  root.style.colorScheme = theme

  let lockMeta = head.querySelector('meta[name="darkreader-lock"]')
  if (theme === 'dark') {
    if (!lockMeta) {
      lockMeta = window.document.createElement('meta')
      lockMeta.setAttribute('name', 'darkreader-lock')
      head.appendChild(lockMeta)
    }
    return
  }

  lockMeta?.remove()
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      // 初始状态
      theme: 'system',
      _hasHydrated: false,

      // 设置主题
      setTheme: (theme) => {
        set({ theme })
        // 立即应用主题到 DOM
        if (typeof window !== 'undefined') {
          const root = window.document.documentElement
          root.classList.remove('light', 'dark')

          if (theme === 'system') {
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'dark'
              : 'light'
            root.classList.add(systemTheme)
            syncDarkReaderLock(systemTheme)
          } else {
            root.classList.add(theme)
            syncDarkReaderLock(theme)
          }
        }
      },

      // 设置水合状态
      setHasHydrated: (state) => {
        set({ _hasHydrated: state })
      },
    }),
    {
      name: 'theme-storage', // localStorage 键名
      storage: createJSONStorage(() => localStorage),
      // 只持久化主题字段
      partialize: (state) => ({
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
