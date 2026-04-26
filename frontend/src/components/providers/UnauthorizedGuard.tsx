'use client'

import { useEffect } from 'react'
import { handleUnauthorizedStatus } from '@/lib/local/session'

type WrappedFetch = typeof window.fetch & {
  __auth401Wrapped?: boolean
}

export function UnauthorizedGuard() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const currentFetch = window.fetch as WrappedFetch
    if (currentFetch.__auth401Wrapped) return

    const originalFetch = window.fetch.bind(window)
    const wrappedFetch = (async (...args: Parameters<typeof window.fetch>) => {
      const response = await originalFetch(...args)
      handleUnauthorizedStatus(response.status)

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('application/json')) {
        try {
          const payload = (await response.clone().json()) as { code?: number } | null
          handleUnauthorizedStatus(payload?.code)
        } catch {
          // ignore malformed JSON bodies
        }
      }

      return response
    }) as WrappedFetch

    wrappedFetch.__auth401Wrapped = true
    window.fetch = wrappedFetch

    return () => {
      if (window.fetch === wrappedFetch) {
        window.fetch = originalFetch
      }
    }
  }, [])

  return null
}
