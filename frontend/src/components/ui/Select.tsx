/**
 * Select Component - Canvas Design
 * 下拉选择框：与 MagicInput 相同的设计风格
 */

'use client'

import { cn } from '@/lib/utils/cn'
import { SelectHTMLAttributes, forwardRef } from 'react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string }>
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block font-ui text-sm font-medium text-stone-700 dark:text-stone-300 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'w-full rounded-full px-6 py-3 font-ui text-base',
              'bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm',
              'border-2 border-stone-200 dark:border-stone-600',
              'text-stone-900 dark:text-stone-100',
              'shadow-canvas',
              'transition-all duration-300 ease-out',
              'focus:outline-none focus:border-transparent',
              'focus:ring-2 focus:ring-aurora-purple',
              'hover:shadow-canvas-lg hover:border-stone-300 dark:hover:border-stone-500',
              'appearance-none cursor-pointer',
              error && 'border-red-300 dark:border-red-500 focus:ring-red-400',
              className
            )}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {/* 下拉箭头 */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400 dark:text-stone-500">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-ui">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'
