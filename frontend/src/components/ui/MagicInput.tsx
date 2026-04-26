/**
 * MagicInput Component - Canvas Design
 * 魔法输入框：Aurora 光晕 + 柔和边框 + 玻璃效果
 */

'use client'

import { cn } from '@/lib/utils/cn'
import { InputHTMLAttributes, forwardRef, useState } from 'react'

export interface MagicInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const MagicInput = forwardRef<HTMLInputElement, MagicInputProps>(
  ({ className, label, error, icon, type = 'text', ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            type={type}
            className={cn(
              'w-full rounded-full px-6 py-3 font-ui text-base',
              'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm',
              'border-2 border-stone-200 dark:border-stone-600',
              'text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500',
              'shadow-canvas',
              'transition-all duration-300 ease-out',
              'focus:outline-none focus:border-transparent',
              'focus:ring-2 focus:ring-aurora-purple',
              'hover:shadow-canvas-lg hover:border-stone-300 dark:hover:border-stone-500',
              isFocused && 'shadow-aurora',
              error && 'border-red-300 dark:border-red-500 focus:ring-red-400',
              icon && 'pl-12',
              className
            )}
            onFocus={(e) => {
              setIsFocused(true)
              props.onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              props.onBlur?.(e)
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-ui">{error}</p>
        )}
      </div>
    )
  }
)

MagicInput.displayName = 'MagicInput'
