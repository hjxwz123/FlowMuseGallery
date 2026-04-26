/**
 * Button Component - Canvas Design
 * 主要按钮：主题纯色背景 + 柔和阴影
 * 次要按钮：透明玻璃效果 + 边框
 */

import { cn } from '@/lib/utils/cn'
import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  loadingText?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText = '加载中...',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-full font-ui font-medium transition-all duration-300 ease-out disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-aurora-purple focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-stone-900'

    const variants = {
      primary:
        'theme-solid-control theme-solid-shadow hover:scale-[1.02] active:scale-[0.98]',
      secondary:
        'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-600 shadow-canvas hover:bg-white dark:hover:bg-stone-800 hover:shadow-canvas-lg hover:border-stone-300 dark:hover:border-stone-500',
      ghost:
        'bg-transparent text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100',
    }

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    }

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span>{loadingText}</span>
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
