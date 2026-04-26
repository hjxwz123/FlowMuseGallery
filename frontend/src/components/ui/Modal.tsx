'use client'

import { cn } from '@/lib/utils/cn'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'

import styles from './Modal.module.css'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  className?: string
  overlayClassName?: string
  headerClassName?: string
  bodyClassName?: string
  titleClassName?: string
  closeButtonClassName?: string
  headerContent?: React.ReactNode
  ariaLabel?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  className,
  overlayClassName,
  headerClassName,
  bodyClassName,
  titleClassName,
  closeButtonClassName,
  headerContent,
  ariaLabel,
  size = 'md',
}: ModalProps) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow

    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  const sizes = {
    sm: 'max-w-[520px]',
    md: 'max-w-[800px]',
    lg: 'max-w-[1100px]',
    xl: 'max-w-[1280px]',
  }
  const shouldRenderHeader = Boolean(headerContent || title)

  return createPortal(
    <div
      className={cn(styles.overlay, overlayClassName)}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          styles.panel,
          'w-full',
          sizes[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : ariaLabel}
      >
        {shouldRenderHeader ? (
          <div className={cn(styles.header, headerClassName)}>
            <div className={styles.headerContent}>
              {headerContent ? (
                headerContent
              ) : (
                <h2 className={cn('font-display', styles.title, styles.titleText, titleClassName)}>{title}</h2>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={cn(styles.closeButton, closeButtonClassName)}
              aria-label="Close"
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ) : null}

        <div className={cn(styles.body, bodyClassName)}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
