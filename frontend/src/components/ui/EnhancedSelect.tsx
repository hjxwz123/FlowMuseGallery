/**
 * Enhanced Select Component - 美化的下拉选择框
 * 支持图标、描述、标签等丰富内容
 */

'use client'

import { useState, useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'
import { useDropdownDirection } from './useDropdownDirection'

export interface EnhancedSelectOption {
  value: string
  label: string
  description?: string
  icon?: string | null
  iconType?: 'image' | 'video'
  badge?: string
  badgeColor?: string
  meta?: ReactNode
}

export interface EnhancedSelectProps {
  value: string
  onChange: (value: string) => void
  options: EnhancedSelectOption[]
  placeholder?: string
  label?: string
  compact?: boolean
  disabled?: boolean
  portal?: boolean
  className?: string
}

export function EnhancedSelect({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  label,
  compact = false,
  disabled = false,
  portal = true,
  className,
}: EnhancedSelectProps) {
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

  const dropdownBody = (
    <div
      ref={menuRef}
      className={cn(
        'overflow-y-auto rounded-[20px] border border-stone-200 bg-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.38)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_28px_70px_-30px_rgba(2,6,23,0.78)]',
        'animate-in fade-in duration-200',
        openUpwards ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2'
      )}
      style={menuStyle}
    >
      {options.map((option, index) => (
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
          {option.icon ? (
            <img
              src={option.icon}
              alt=""
              className="h-7 w-7 flex-shrink-0 object-contain sm:h-8 sm:w-8"
            />
          ) : option.iconType === 'image' ? (
            <svg className="h-7 w-7 flex-shrink-0 text-stone-400 sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : option.iconType === 'video' ? (
            <svg className="h-7 w-7 flex-shrink-0 text-stone-400 sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          ) : null}
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
              {option.badge && (
                <span
                  className={cn(
                    'hidden flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block',
                    option.badgeColor || 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
                  )}
                >
                  {option.badge}
                </span>
              )}
            </div>
            {option.description && (
              <p className="line-clamp-1 text-xs text-stone-500 dark:text-stone-400">
                {option.description}
              </p>
            )}
            {option.meta && (
              <div className="mt-0.5 text-xs text-stone-400 dark:text-stone-500">{option.meta}</div>
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
      ))}
    </div>
  )

  const dropdownMenu = isMounted && isOpen
    ? (portal ? createPortal(dropdownBody, document.body) : dropdownBody)
    : null

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {label && (
        <label
          className={cn(
            'block font-ui font-medium text-stone-700 dark:text-stone-300',
            compact ? 'mb-1.5 text-xs' : 'mb-2 text-sm'
          )}
        >
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex w-full items-start justify-between gap-2 border border-stone-200 bg-white font-ui text-left text-stone-900 shadow-[0_14px_38px_-30px_rgba(15,23,42,0.34)] transition-all duration-300 ease-out sm:items-center sm:gap-3 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:shadow-[0_18px_44px_-32px_rgba(2,6,23,0.86)]',
          compact
            ? 'rounded-lg px-3 py-2.5 sm:px-3.5 sm:py-2.5'
            : 'rounded-xl px-4 py-3 sm:px-5 sm:py-3.5',
          isOpen && 'border-aurora-purple ring-2 ring-aurora-purple/20',
          !disabled && 'cursor-pointer hover:border-stone-300 hover:shadow-[0_20px_48px_-32px_rgba(15,23,42,0.4)] dark:hover:border-stone-500 dark:hover:shadow-[0_24px_56px_-34px_rgba(2,6,23,0.9)]',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
          {selectedOption ? (
            <>
              {selectedOption.icon ? (
                <img
                  src={selectedOption.icon}
                  alt=""
                  className={cn(
                    'flex-shrink-0 object-contain',
                    compact ? 'h-6 w-6 sm:h-6 sm:w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
                  )}
                />
              ) : selectedOption.iconType === 'image' ? (
                <svg
                  className={cn(
                    'flex-shrink-0 text-stone-400',
                    compact ? 'h-6 w-6 sm:h-6 sm:w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : selectedOption.iconType === 'video' ? (
                <svg
                  className={cn(
                    'flex-shrink-0 text-stone-400',
                    compact ? 'h-6 w-6 sm:h-6 sm:w-6' : 'h-7 w-7 sm:h-8 sm:w-8'
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="truncate font-medium">{selectedOption.label}</span>
                  {selectedOption.badge && (
                    <span
                      className={cn(
                        'hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block',
                        selectedOption.badgeColor || 'bg-stone-100 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
                      )}
                    >
                      {selectedOption.badge}
                    </span>
                  )}
                </div>
                {!compact && selectedOption.meta && (
                  <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                    {selectedOption.meta}
                  </div>
                )}
              </div>
            </>
          ) : (
            <span className="text-stone-400 dark:text-stone-500">{placeholder}</span>
          )}
        </div>

        <svg
          className={cn(
            'h-5 w-5 flex-shrink-0 text-stone-400 transition-transform duration-300',
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
