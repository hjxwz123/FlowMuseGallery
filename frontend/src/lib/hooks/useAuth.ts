/**
 * 认证 Hook
 * 简化认证状态访问
 */

'use client'

import { useAuthStore } from '@/lib/store/authStore'
import { useCallback, useMemo } from 'react'

export const useAuth = () => {
  const {
    user,
    isAuthenticated,
    _hasHydrated,
    logout: storeLogout,
  } = useAuthStore()
  // 检查是否为管理员
  const isAdmin = useMemo(() => {
    return user?.role === 'admin'
  }, [user])

  const logout = useCallback(() => {
    storeLogout()
  }, [storeLogout])

  const requireAuth = useCallback(() => true, [])

  return {
    user,
    isAuthenticated,
    isAdmin,
    isReady: _hasHydrated,
    logout,
    requireAuth,
  }
}
