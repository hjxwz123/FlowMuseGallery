/**
 * 用户相关类型定义
 * 基于 docs/api/03-user.md 和 00-common.md 5.2 UserProfile
 */

import type { UserRole, UserStatus } from './common'

// 用户资料
export interface UserProfile {
  id: string
  email: string
  username: string
  avatar: string | null
  role: UserRole
  status: UserStatus
  createdAt: string
}
