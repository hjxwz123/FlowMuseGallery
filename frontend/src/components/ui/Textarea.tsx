/**
 * Textarea Component - Canvas Design
 * 多行文本输入框：与 MagicInput 相同的设计风格
 */

'use client'

import { cn } from '@/lib/utils/cn'
import { TextareaHTMLAttributes, forwardRef, useState } from 'react'

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full rounded-2xl px-6 py-3 font-ui text-base',
            'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm',
            'border-2 border-stone-200 dark:border-stone-600',
            'text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500',
            'shadow-canvas',
            'transition-all duration-300 ease-out',
            'focus:outline-none focus:border-transparent',
            'focus:ring-2 focus:ring-aurora-purple',
            'hover:shadow-canvas-lg hover:border-stone-300 dark:hover:border-stone-500',
            'resize-none',
            isFocused && 'shadow-aurora',
            error && 'border-red-300 dark:border-red-500 focus:ring-red-400',
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
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-ui">{error}</p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
