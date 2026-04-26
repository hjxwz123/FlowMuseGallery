/**
 * 个人版固定本地用户状态。
 * 后端已绕过 JWT 守卫，前端保持本地可用视图以复用现有页面。
 */

import { create } from 'zustand'
import type { UserProfile } from '../api/types'

const LOCAL_USER: UserProfile = {
  id: '1',
  email: 'local@flowmuse.personal',
  username: 'Local User',
  avatar: null,
  role: 'admin',
  status: 'active',
  createdAt: new Date(0).toISOString(),
}

interface AuthState {
  user: UserProfile
  accessToken: string
  refreshToken: string
  isAuthenticated: boolean
  _hasHydrated: boolean
  login: (data: {
    user: UserProfile
    accessToken: string
    refreshToken: string
  }) => void
  logout: () => void
  updateUser: (user: Partial<UserProfile>) => void
  updateToken: (accessToken: string) => void
  setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: LOCAL_USER,
  accessToken: 'local-personal-token',
  refreshToken: 'local-personal-token',
  isAuthenticated: true,
  _hasHydrated: true,

  login: ({ user, accessToken, refreshToken }) => {
    set({
      user: { ...LOCAL_USER, ...user, role: 'admin', status: 'active' },
      accessToken: accessToken || 'local-personal-token',
      refreshToken: refreshToken || 'local-personal-token',
      isAuthenticated: true,
      _hasHydrated: true,
    })
  },

  logout: () => {
    set({
      user: LOCAL_USER,
      accessToken: 'local-personal-token',
      refreshToken: 'local-personal-token',
      isAuthenticated: true,
      _hasHydrated: true,
    })
  },

  updateUser: (userData) => {
    set((state) => ({
      user: { ...state.user, ...userData, role: 'admin', status: 'active' },
    }))
  },

  updateToken: (accessToken) => {
    set({ accessToken: accessToken || 'local-personal-token' })
  },

  setHasHydrated: () => {
    set({ _hasHydrated: true })
  },
}))
