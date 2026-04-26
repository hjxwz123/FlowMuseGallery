/**
 * 条件布局组件
 * 根据路由决定是否显示不同页面壳层
 */

'use client'

import { usePathname } from '@/lib/router'
import { Sidebar } from './Sidebar'
import { MobileTabBar } from './MobileTabBar'
import { RouteLoadingBar } from '@/components/shared/RouteLoadingBar'
import { ToastProvider } from '@/components/shared/ToastProvider'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname()
  const isChatRoute = pathname?.includes('/chat') ?? false
  const pathSegments = pathname?.split('/').filter(Boolean) ?? []
  const isAuthRoute = pathSegments[1] === 'auth'
  const isLandingRoute = pathSegments.length === 0 || pathSegments.length === 1
  const useSideNav = !isLandingRoute && !isAuthRoute

  return (
    <div className={isChatRoute ? 'flex min-w-0 h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-canvas dark:bg-canvas-dark' : 'flex min-w-0 min-h-screen flex-col overflow-x-clip bg-canvas dark:bg-canvas-dark'}>
      {/* 全局路由加载进度条 */}
      <RouteLoadingBar />
      <ToastProvider />

      <div className={useSideNav ? 'flex min-w-0 flex-1 min-h-0 overflow-x-clip bg-canvas dark:bg-canvas-dark' : 'flex min-w-0 flex-1 min-h-0 flex-col overflow-x-clip bg-canvas dark:bg-canvas-dark'}>
        {useSideNav && <Sidebar forceCollapsed={isChatRoute} />}
        {useSideNav ? (
          <div className={isChatRoute ? 'flex min-w-0 min-h-0 w-full flex-1 flex-col overflow-hidden' : 'flex min-w-0 min-h-0 w-full flex-1 flex-col overflow-x-clip'}>
            <main className={isChatRoute ? 'flex min-w-0 min-h-0 w-full flex-1 overflow-hidden' : 'min-w-0 w-full flex-1 min-h-0 overflow-x-clip pb-16 md:pb-0'}>
              {children}
            </main>
          </div>
        ) : (
          <main
            className={
              isChatRoute
                ? 'flex min-w-0 min-h-0 w-full flex-1 overflow-hidden'
                : isAuthRoute
                  ? 'min-w-0 w-full flex-1 min-h-0 overflow-x-clip'
                  : 'min-w-0 w-full flex-1 min-h-0 overflow-x-clip pb-16 md:pb-0'
            }
          >
            {children}
          </main>
        )}
      </div>
      {/* 移动端底部导航栏（仅主站页面） */}
      {!isAuthRoute && !isChatRoute && !isLandingRoute && <MobileTabBar />}
    </div>
  )
}
