/**
 * 移动端底部导航栏组件
 * 仅在移动端显示，主入口为创作/聊天/任务/商城/我的
 */

'use client'

import { useState } from 'react'
import { usePathname } from '@/lib/router'
import { useLocale, useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { cn } from '@/lib/utils/cn'
import { Compass, Sparkles, MessageSquare, ClipboardList, Settings } from 'lucide-react'

export function MobileTabBar() {
  const pathname = usePathname()
  const locale = useLocale()
  const tMenu = useTranslations('nav.menu')
  const isZh = locale.toLowerCase().startsWith('zh')
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  const tabs = [
    {
      label: tMenu('gallery'),
      icon: Compass,
      href: `/${locale}/gallery`,
      matcher: (path: string) =>
        path.startsWith(`/${locale}/gallery`),
    },
    {
      label: tMenu('create'),
      icon: Sparkles,
      href: `/${locale}/create`,
      matcher: (path: string) =>
        path.startsWith(`/${locale}/create`) ||
        path.startsWith(`/${locale}/canvas`) ||
        path.startsWith(`/${locale}/templates`),
    },
    {
      label: tMenu('chat'),
      icon: MessageSquare,
      href: `/${locale}/chat`,
      matcher: (path: string) => path.startsWith(`/${locale}/chat`),
    },
    {
      label: tMenu('tasks'),
      icon: ClipboardList,
      href: `/${locale}/tasks`,
      matcher: (path: string) => path.startsWith(`/${locale}/tasks`),
    },
  ]

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-stone-200 safe-area-bottom dark:bg-stone-900/95 dark:border-stone-700/50">
        <div className="flex items-center justify-around px-1 py-1.5">
          {tabs.map((tab) => {
            const isActive = tab.matcher(pathname)
            const Icon = tab.icon
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-300',
                  'min-w-[56px] gap-0.5',
                  isActive
                    ? 'text-aurora-purple'
                    : 'text-stone-500 dark:text-stone-400 active:text-aurora-purple'
                )}
              >
                <Icon className={cn('w-5 h-5 transition-transform duration-300', isActive && 'scale-110')} />
                <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="flex min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-stone-500 transition-all duration-300 active:text-aurora-purple dark:text-stone-400"
            aria-label={isZh ? '系统配置' : 'System Settings'}
          >
            <Settings className="h-5 w-5 transition-transform duration-300" />
            <span className="text-[10px] font-medium leading-tight">{isZh ? '设置' : 'Settings'}</span>
          </button>
        </div>
      </div>
      <SystemConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </>
  )
}
