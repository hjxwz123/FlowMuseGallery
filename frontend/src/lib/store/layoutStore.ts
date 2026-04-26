/**
 * 布局偏好状态管理 (Zustand)
 * 用户可在前端切换顶部导航 / 侧边导航
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type NavLayout = 'top' | 'side'

interface LayoutState {
  navLayout: NavLayout
  sideNavCollapsed: boolean
  _hasHydrated: boolean

  setNavLayout: (layout: NavLayout) => void
  toggleNavLayout: () => void
  setSideNavCollapsed: (collapsed: boolean) => void
  toggleSideNavCollapsed: () => void
  setHasHydrated: (state: boolean) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      navLayout: 'top',
      sideNavCollapsed: false,
      _hasHydrated: false,

      setNavLayout: (navLayout) => set({ navLayout }),
      toggleNavLayout: () =>
        set((state) => ({ navLayout: state.navLayout === 'top' ? 'side' : 'top' })),
      setSideNavCollapsed: (sideNavCollapsed) => set({ sideNavCollapsed }),
      toggleSideNavCollapsed: () =>
        set((state) => ({ sideNavCollapsed: !state.sideNavCollapsed })),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'layout-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        navLayout: state.navLayout,
        sideNavCollapsed: state.sideNavCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
