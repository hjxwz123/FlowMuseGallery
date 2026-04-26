/**
 * 状态标签组件
 * 用于显示用户状态、任务状态等
 */

import { cn } from '@/lib/utils'

export type StatusVariant =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'banned'
  | 'enabled'
  | 'disabled'
  | 'public'
  | 'private'

const statusConfig: Record<
  StatusVariant,
  { label: string; className: string }
> = {
  // User status
  active: {
    label: '正常',
    className: 'border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300',
  },
  inactive: {
    label: '未激活',
    className: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },
  banned: {
    label: '已禁用',
    className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300',
  },

  // Task status
  pending: {
    label: '等待中',
    className: 'border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/15 dark:text-yellow-300',
  },
  processing: {
    label: '处理中',
    className: 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
  },
  completed: {
    label: '已完成',
    className: 'border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300',
  },
  failed: {
    label: '失败',
    className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300',
  },

  // General status
  enabled: {
    label: '已启用',
    className: 'border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300',
  },
  disabled: {
    label: '已禁用',
    className: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },

  // Visibility
  public: {
    label: '公开',
    className: 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300',
  },
  private: {
    label: '私密',
    className: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300',
  },
}

interface StatusBadgeProps {
  status: StatusVariant
  customLabel?: string
  className?: string
}

export const StatusBadge = ({
  status,
  customLabel,
  className,
}: StatusBadgeProps) => {
  const config = statusConfig[status]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5',
        'font-ui text-xs font-semibold',
        'transition-colors',
        config.className,
        className
      )}
    >
      {customLabel || config.label}
    </span>
  )
}
