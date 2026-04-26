/**
 * Skeleton 骨架屏组件库
 * 用于在内容加载时显示占位符
 */

import { cn } from '@/lib/utils/cn'
import { Card } from './Card'

/**
 * 基础 Skeleton 组件
 * 可以通过 className 自定义尺寸和样式
 */
export const Skeleton = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100',
        className
      )}
      {...props}
    />
  )
}

/**
 * 作品卡片骨架屏
 * 用于画廊列表页面
 */
export const SkeletonCard = () => {
  return (
    <div className="rounded-3xl overflow-hidden bg-white border border-stone-200 shadow-canvas">
      {/* 图片区域 */}
      <Skeleton className="w-full aspect-square" />

      {/* 文本区域 */}
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

/**
 * 任务卡片骨架屏
 * 用于任务列表页面
 */
export const SkeletonTaskCard = () => {
  return (
    <Card variant="glass" className="p-6">
      {/* 预览图区域 */}
      <Skeleton className="w-full aspect-video mb-4 rounded-lg" />

      {/* 标题 */}
      <Skeleton className="h-5 w-2/3 mb-2" />

      {/* 描述 */}
      <Skeleton className="h-4 w-full mb-4" />

      {/* 按钮组 */}
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
    </Card>
  )
}

/**
 * 详情页骨架屏
 * 用于画廊详情页面
 */
export const SkeletonDetailPage = () => {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 左侧：大图 */}
        <Skeleton className="aspect-square rounded-2xl" />

        {/* 右侧：信息区域 */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      </div>
    </div>
  )
}
