/**
 * 瀑布流组件 - Masonry Grid
 * 使用纯CSS实现瀑布流布局，支持响应式列数
 */

'use client'

import { cn } from '@/lib/utils/cn'

interface MasonryGridProps {
  children: React.ReactNode
  columns?: 2 | 3 | 4
  gap?: number
  className?: string
}

export const MasonryGrid = ({
  children,
  columns = 3,
  gap = 6,
  className,
}: MasonryGridProps) => {
  // 根据列数设置响应式样式
  const getColumnClass = () => {
    switch (columns) {
      case 2:
        return 'masonry-grid-2'
      case 3:
        return 'masonry-grid-3'
      case 4:
        return 'masonry-grid-4'
      default:
        return 'masonry-grid-3'
    }
  }

  return (
    <div
      className={cn('masonry-grid', getColumnClass(), className)}
      style={{
        columnGap: `${gap * 0.25}rem`,
      }}
    >
      {children}
    </div>
  )
}

interface MasonryItemProps {
  children: React.ReactNode
  className?: string
}

export const MasonryItem = ({ children, className }: MasonryItemProps) => {
  return (
    <div
      className={cn('break-inside-avoid mb-6', className)}
      style={{ breakInside: 'avoid' }}
    >
      {children}
    </div>
  )
}
