import { useEffect, useMemo, useState } from 'react'
import Link from '@/lib/compat/link'
import { usePathname, useRouter } from '@/lib/router'
import { CanvasBoardContent } from '@/components/features/canvas/CanvasBoardContent'
import { ChatContent } from '@/components/features/chat/ChatContent'
import { SimplifiedCreateContent } from '@/components/features/create/SimplifiedCreateContent'
import { GalleryContent } from '@/components/features/gallery/GalleryContent'
import { LandingHomePage } from '@/components/features/home/LandingHomePage'
import { ProjectDetailContent } from '@/components/features/projects/ProjectDetailContent'
import { ProjectsContent } from '@/components/features/projects/ProjectsContent'
import { TasksContent } from '@/components/features/tasks/TasksContent'
import { TemplatesContent } from '@/components/features/templates/TemplatesContent'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { UnauthorizedGuard } from '@/components/providers/UnauthorizedGuard'
import { ConditionalLayout } from '@/components/layouts/ConditionalLayout'
import { I18nProvider, useTranslations } from '@/i18n/client'
import { defaultLocale, locales, type Locale } from '@/i18n/locales'
import { tasksService } from '@/lib/api/services/tasks'
import type { ApiTask } from '@/lib/api/types'

const SITE_TITLE = 'FlowMuse'
const HOME_HERO_TASK_PAGE_SIZE = 48

type RouteMatch = {
  locale: Locale
  redirectTo?: string
  routeKey: string
  element: React.ReactNode
}

function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale)
}

function withDefaultLocalePath(pathname: string) {
  if (pathname === '/') return `/${defaultLocale}`
  return `/${defaultLocale}${pathname.startsWith('/') ? pathname : `/${pathname}`}`
}

function HomeRoute({ locale }: { locale: Locale }) {
  const [heroTasks, setHeroTasks] = useState<ApiTask[]>([])

  useEffect(() => {
    let cancelled = false

    tasksService
      .getFeed({
        page: 1,
        limit: HOME_HERO_TASK_PAGE_SIZE,
        status: 'completed',
      })
      .then((result) => {
        if (!cancelled) {
          setHeroTasks(result.data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHeroTasks([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <LandingHomePage locale={locale} heroTasks={heroTasks} />
}

function NotFoundRoute({ locale }: { locale: Locale }) {
  const t = useTranslations('errors.notFound')

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="rounded-3xl border border-stone-200 bg-white/80 px-8 py-10 shadow-canvas dark:border-stone-700 dark:bg-stone-900/80">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.3em] text-aurora-purple">404</p>
        <h1 className="mb-3 text-3xl font-semibold text-stone-900 dark:text-stone-100">
          {t('title')}
        </h1>
        <p className="mb-6 text-sm text-stone-500 dark:text-stone-400">
          {t('description')}
        </p>
        <Link
          href={`/${locale}`}
          className="inline-flex rounded-full bg-aurora-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-aurora-purple-hover"
        >
          {t('backHome')}
        </Link>
      </div>
    </div>
  )
}

function resolveRoute(pathname: string): RouteMatch {
  const pathSegments = pathname.split('/').filter(Boolean)

  if (pathSegments.length === 0) {
    return {
      locale: defaultLocale,
      routeKey: `${defaultLocale}:home`,
      element: <HomeRoute locale={defaultLocale} />,
    }
  }

  const maybeLocale = pathSegments[0]

  if (!isLocale(maybeLocale)) {
    return {
      locale: defaultLocale,
      redirectTo: withDefaultLocalePath(pathname),
      routeKey: 'redirect',
      element: null,
    }
  }

  const locale = maybeLocale
  const routeSegments = pathSegments.slice(1)
  const [section, firstParam, secondParam] = routeSegments

  if (!section) {
    return {
      locale,
      routeKey: `${locale}:home`,
      element: <HomeRoute locale={locale} />,
    }
  }

  if (section === 'gallery') {
    if (routeSegments.length === 1) {
      return {
        locale,
        routeKey: `${locale}:gallery`,
        element: <GalleryContent locale={locale} />,
      }
    }
  }

  if (section === 'create' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:create`,
      element: <SimplifiedCreateContent />,
    }
  }

  if (section === 'templates' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:templates`,
      element: <TemplatesContent />,
    }
  }

  if (section === 'projects') {
    if (!firstParam) {
      return {
        locale,
        routeKey: `${locale}:projects`,
        element: <ProjectsContent />,
      }
    }

    return {
      locale,
      routeKey: `${locale}:projects:${firstParam}`,
      element: <ProjectDetailContent projectId={firstParam} />,
    }
  }

  if (section === 'tasks' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:tasks`,
      element: <TasksContent />,
    }
  }

  if (section === 'canvas' && routeSegments.length === 1) {
    return {
      locale,
      routeKey: `${locale}:canvas`,
      element: <CanvasBoardContent />,
    }
  }

  if (section === 'chat') {
    return {
      locale,
      routeKey: `${locale}:chat:${firstParam ?? 'new'}`,
      element: <ChatContent initialConversationId={firstParam ?? null} />,
    }
  }

  return {
    locale,
    routeKey: `${locale}:404:${routeSegments.join('/')}`,
    element: <NotFoundRoute locale={locale} />,
  }
}

function AppContent() {
  const pathname = usePathname()
  const router = useRouter()
  const route = useMemo(() => resolveRoute(pathname), [pathname])

  useEffect(() => {
    document.title = SITE_TITLE
    document.documentElement.lang = route.locale
  }, [route.locale])

  useEffect(() => {
    if (route.redirectTo) {
      router.replace(route.redirectTo)
    }
  }, [route.redirectTo, router])

  return (
    <I18nProvider locale={route.locale}>
      <ThemeProvider>
        <UnauthorizedGuard />
        <ConditionalLayout key={route.locale}>{route.element}</ConditionalLayout>
      </ThemeProvider>
    </I18nProvider>
  )
}

export function App() {
  return <AppContent />
}
