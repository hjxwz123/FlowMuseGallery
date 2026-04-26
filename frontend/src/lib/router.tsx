import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type LocationState = {
  pathname: string
  search: string
  hash: string
}

type NavigateOptions = {
  replace?: boolean
  scroll?: boolean
}

type RouterContextValue = {
  location: LocationState
  navigate: (href: string, options?: NavigateOptions) => void
}

const RouterContext = createContext<RouterContextValue | null>(null)
const NAVIGATION_EVENT = 'flowmuse:navigation'

function readLocation(): LocationState {
  return {
    pathname: window.location.pathname || '/',
    search: window.location.search || '',
    hash: window.location.hash || '',
  }
}

function isExternalHref(href: string) {
  if (/^(mailto:|tel:|blob:|data:)/i.test(href)) return true
  try {
    const url = new URL(href, window.location.href)
    return url.origin !== window.location.origin
  } catch {
    return false
  }
}

function dispatchNavigationEvent() {
  window.dispatchEvent(new Event(NAVIGATION_EVENT))
}

export function BrowserRouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LocationState>(() => readLocation())

  useEffect(() => {
    const syncLocation = () => setLocation(readLocation())
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args)
      dispatchNavigationEvent()
      return result
    }

    window.history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args)
      dispatchNavigationEvent()
      return result
    }

    window.addEventListener('popstate', syncLocation)
    window.addEventListener(NAVIGATION_EVENT, syncLocation)

    return () => {
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
      window.removeEventListener('popstate', syncLocation)
      window.removeEventListener(NAVIGATION_EVENT, syncLocation)
    }
  }, [])

  const navigate = useCallback((href: string, options: NavigateOptions = {}) => {
    if (!href) return

    if (isExternalHref(href)) {
      if (options.replace) {
        window.location.replace(href)
      } else {
        window.location.assign(href)
      }
      return
    }

    const url = new URL(href, window.location.href)
    const nextPath = `${url.pathname}${url.search}${url.hash}`
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (nextPath !== currentPath) {
      if (options.replace) {
        window.history.replaceState(null, '', nextPath)
      } else {
        window.history.pushState(null, '', nextPath)
      }
    } else {
      dispatchNavigationEvent()
    }

    if (options.scroll !== false && url.hash.length === 0) {
      window.scrollTo({ top: 0, left: 0 })
    }
  }, [])

  const value = useMemo<RouterContextValue>(() => ({ location, navigate }), [location, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

function useRouterContext() {
  const context = useContext(RouterContext)
  if (!context) {
    throw new Error('Router hooks must be used within BrowserRouterProvider')
  }
  return context
}

export function usePathname() {
  return useRouterContext().location.pathname
}

export function useSearchParams() {
  const { search } = useRouterContext().location
  return useMemo(() => new URLSearchParams(search), [search])
}

export function useRouter() {
  const { navigate } = useRouterContext()

  return useMemo(
    () => ({
      push: (href: string, options?: { scroll?: boolean }) => navigate(href, { scroll: options?.scroll }),
      replace: (href: string, options?: { scroll?: boolean }) =>
        navigate(href, { replace: true, scroll: options?.scroll }),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      refresh: () => dispatchNavigationEvent(),
      prefetch: async () => undefined,
    }),
    [navigate],
  )
}

export function redirect(href: string): never {
  window.location.replace(href)
  throw new Error(`Redirected to ${href}`)
}

export function notFound(): never {
  throw new Error('Not found')
}
