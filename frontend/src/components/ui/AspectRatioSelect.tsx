/**
 * Aspect Ratio Select Component - 可视化的尺寸/比例选择组件
 * 支持图标、比例预览、描述等
 */

'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'
import type { AspectRatioOption } from '@/components/features/create/config/aspectRatioOptions'
import { useDropdownDirection } from './useDropdownDirection'

export interface AspectRatioSelectProps {
  value: string
  onChange: (value: string) => void
  options: AspectRatioOption[]
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
  showPreview?: boolean
}

export function AspectRatioSelect({
  value,
  onChange,
  options,
  placeholder = '请选择尺寸...',
  label,
  disabled = false,
  className,
  showPreview = true,
}: AspectRatioSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { openUpwards, menuStyle } = useDropdownDirection({
    containerRef,
    isOpen,
  })

  const selectedOption = options.find((opt) => opt.value === value)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setIsOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const renderPreview = (option: AspectRatioOption) => {
    if (!showPreview || !option.width || !option.height) return null

    const maxSize = 32
    const aspectRatio = option.width / option.height

    const width = aspectRatio >= 1 ? maxSize : maxSize * aspectRatio
    const height = aspectRatio >= 1 ? maxSize / aspectRatio : maxSize

    return (
      <div
        className="flex flex-shrink-0 items-center justify-center"
        style={{ width: maxSize, height: maxSize }}
      >
        <div
          className={cn(
            'rounded-sm border-2 border-stone-300 bg-gradient-to-br from-aurora-purple/20 to-aurora-pink/20 transition-colors dark:border-stone-600'
          )}
          style={{ width: `${width}px`, height: `${height}px` }}
        />
      </div>
    )
  }

  const dropdownMenu = isMounted && isOpen
    ? createPortal(
        <div
          ref={menuRef}
          className={cn(
            'overflow-y-auto rounded-xl border-2 border-stone-200 bg-white/95 shadow-canvas-lg backdrop-blur-md dark:border-stone-600 dark:bg-stone-800/95 dark:shadow-canvas-dark-lg',
            'animate-in fade-in duration-200',
            openUpwards ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'
          )}
          style={menuStyle}
        >
          {options.map((option, index) => {
            const IconComponent = option.icon

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'flex w-full items-start gap-2 border-b border-stone-100 px-4 py-3 text-left transition-all duration-200 last:border-0 sm:items-center sm:gap-3 sm:px-5 sm:py-3.5 dark:border-stone-700',
                  option.value === value
                    ? 'bg-stone-100/90 text-stone-950 shadow-[inset_0_0_0_1px_rgba(231,229,228,0.95)] dark:bg-stone-700/70 dark:text-stone-50 dark:shadow-[inset_0_0_0_1px_rgba(87,83,78,0.95)]'
                    : 'hover:bg-stone-50 dark:hover:bg-stone-700',
                  index === 0 && 'rounded-t-xl',
                  index === options.length - 1 && 'rounded-b-xl'
                )}
              >
                {renderPreview(option)}
                {IconComponent && (
                  <IconComponent
                    className={cn(
                      'h-6 w-6 flex-shrink-0',
                      option.value === value ? 'text-stone-700 dark:text-stone-200' : 'text-stone-400'
                    )}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span
                      className={cn(
                        'truncate font-ui font-medium',
                        option.value === value ? 'text-stone-950 dark:text-stone-50' : 'text-stone-900 dark:text-stone-100'
                      )}
                    >
                      {option.label}
                    </span>
                  </div>
                  {option.description && (
                    <p className="line-clamp-1 text-xs text-stone-500 dark:text-stone-400">
                      {option.description}
                    </p>
                  )}
                </div>
                {option.value === value && (
                  <svg
                    className="h-5 w-5 flex-shrink-0 text-stone-700 dark:text-stone-200"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>,
        document.body
      )
    : null

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {label && (
        <label className="mb-2 block font-ui text-sm font-medium text-stone-700 dark:text-stone-300">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex w-full items-start justify-between gap-2 rounded-xl border-2 border-stone-200 bg-white/80 px-4 py-3 font-ui text-left text-stone-900 shadow-canvas backdrop-blur-sm transition-all duration-300 ease-out sm:items-center sm:gap-3 sm:px-5 sm:py-3.5 dark:border-stone-600 dark:bg-stone-800/80 dark:text-stone-100 dark:shadow-canvas-dark',
          isOpen && 'border-aurora-purple ring-2 ring-aurora-purple/20',
          !disabled && 'cursor-pointer hover:border-stone-300 hover:shadow-canvas-lg dark:hover:border-stone-500 dark:hover:shadow-canvas-dark-lg',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
          {selectedOption ? (
            <>
              {renderPreview(selectedOption)}
              {selectedOption.icon && (
                <selectedOption.icon className="h-6 w-6 flex-shrink-0 text-aurora-purple" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="truncate font-medium">{selectedOption.label}</span>
                </div>
                {selectedOption.description && (
                  <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                    {selectedOption.description}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-stone-400 dark:text-stone-500">{placeholder}</span>
          )}
        </div>

        <svg
          className={cn(
            'h-5 w-5 flex-shrink-0 text-stone-400 transition-transform duration-300 dark:text-stone-500',
            isOpen && 'rotate-180'
          )}
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
      </button>

      {dropdownMenu}
    </div>
  )
}
