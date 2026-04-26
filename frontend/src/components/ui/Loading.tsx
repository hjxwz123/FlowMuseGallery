/**
 * Loading Component - Canvas Design
 * 加载状态指示器：Aurora 渐变动画
 */

import { cn } from '@/lib/utils/cn'

export interface LoadingProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  className?: string
}

export const Loading = ({ size = 'md', text, className }: LoadingProps) => {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative">
        {/* 外圈 - Aurora 渐变 */}
        <div
          className={cn(
            sizes[size],
            'rounded-full border-4 border-transparent bg-gradient-to-r from-aurora-pink via-aurora-purple to-aurora-blue bg-clip-padding',
            'animate-spin',
            'dark:[background:linear-gradient(rgb(41_37_36),rgb(41_37_36))_padding-box,linear-gradient(to_right,#FF6B9D,#B794F6,#60A5FA)_border-box]'
          )}
          style={{
            background:
              'linear-gradient(rgb(255 255 255), rgb(255 255 255)) padding-box, linear-gradient(to right, #FF6B9D, #B794F6, #60A5FA) border-box',
          }}
        />
        {/* 内圈 - 白色/暗色 */}
        <div className="absolute inset-1 rounded-full bg-canvas dark:bg-stone-800" />
      </div>
      {text && (
        <p className="font-ui text-sm text-stone-600 dark:text-stone-400 animate-pulse">{text}</p>
      )}
    </div>
  )
}

export const LoadingOverlay = ({ text }: { text?: string }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm">
      <div className="rounded-3xl bg-white/95 dark:bg-stone-800/95 backdrop-blur-md p-8 shadow-canvas-lg">
        <Loading size="lg" text={text} />
      </div>
    </div>
  )
}
