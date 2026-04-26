/**
 * Sonner 全局 Toast 容器
 */

'use client'

import { Toaster } from 'sonner'

export function ToastProvider() {
  return <Toaster richColors position="top-right" />
}

