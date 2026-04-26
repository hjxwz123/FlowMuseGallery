/**
 * Card Component - Canvas Design
 * 通用卡片组件：玻璃效果 + 柔和阴影 + 圆角
 */

import { cn } from '@/lib/utils/cn'
import { HTMLAttributes, forwardRef } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered'
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-white dark:bg-stone-800 shadow-canvas dark:shadow-canvas-dark',
      glass: 'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm shadow-canvas dark:shadow-canvas-dark',
      bordered: 'bg-white dark:bg-stone-800 border-2 border-stone-200 dark:border-stone-700 shadow-canvas dark:shadow-canvas-dark',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl p-6 transition-all duration-300 ease-out',
          'hover:shadow-canvas-lg dark:hover:shadow-canvas-dark-lg',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('mb-4 pb-4 border-b border-stone-100 dark:border-stone-700', className)}
      {...props}
    >
      {children}
    </div>
  )
})

CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={cn('font-display text-2xl text-stone-900 dark:text-stone-100', className)}
      {...props}
    >
      {children}
    </h3>
  )
})

CardTitle.displayName = 'CardTitle'

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn('font-ui text-stone-700 dark:text-stone-300', className)} {...props}>
      {children}
    </div>
  )
})

CardContent.displayName = 'CardContent'
