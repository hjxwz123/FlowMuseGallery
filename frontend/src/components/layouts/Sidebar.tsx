/**
 * 侧边栏导航（桌面端）
 * 悬浮玻璃 Dock 样式。
 */

'use client'

import { useMemo, type ReactNode } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import { usePathname } from '@/lib/router'
import {
  ClipboardList,
  Compass,
  FolderKanban,
  PenTool,
  Sparkles,
} from 'lucide-react'

import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/utils/cn'
import { LanguageSwitcher } from './LanguageSwitcher'
import { UserMenu } from './UserMenu'

interface SidebarProps {
  forceCollapsed?: boolean
}

type DockNavItemProps = {
  href: string
  label: string
  icon: ReactNode
  active?: boolean
  submenuItems?: Array<{
    href: string
    label: string
    active?: boolean
  }>
}

type TooltipShellProps = {
  label: string
  children: ReactNode
  className?: string
}

function TooltipShell({ label, children, className }: TooltipShellProps) {
  return (
    <div className={cn('group relative flex items-center justify-center', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute left-[calc(100%+20px)] top-1/2 z-[90] -translate-y-1/2 scale-95 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-semibold opacity-0 shadow-lg transition-all duration-200',
          'bg-stone-950 text-white group-hover:left-[calc(100%+14px)] group-hover:scale-100 group-hover:opacity-100 group-focus-within:left-[calc(100%+14px)] group-focus-within:scale-100 group-focus-within:opacity-100',
          'dark:bg-white dark:text-black'
        )}
      >
        {label}
      </span>
    </div>
  )
}

function DockNavItem({
  href,
  label,
  icon,
  active = false,
  submenuItems,
}: DockNavItemProps) {
  const hasSubmenu = Boolean(submenuItems?.length)

  const mainLink = (
    <Link
      href={href}
      prefetch={true}
      className={cn(
        'group/item relative z-[2] flex h-[64px] w-full flex-col items-center justify-start gap-1.5 px-0 text-center transition-colors duration-200',
        active
          ? 'text-stone-950 dark:text-white'
          : 'text-stone-500 hover:text-stone-950 dark:text-[#777] dark:hover:text-white'
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-[24px] transition-colors duration-200',
          active
            ? 'bg-black/[0.055] dark:bg-white/[0.07]'
            : 'bg-transparent group-hover/item:bg-black/[0.035] dark:group-hover/item:bg-white/[0.045]'
        )}
      >
        {icon}
      </span>
      <span className="max-w-[60px] px-0.5 text-[10px] font-medium leading-[1.05] tracking-tight">
        {label}
      </span>
    </Link>
  )

  if (!hasSubmenu) {
    return mainLink
  }

  return (
    <div className="group/item relative flex w-full items-start justify-center">
      {mainLink}

      <div
        className={cn(
          'pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-[95] -translate-y-1/2 translate-x-2 opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'group-hover/item:pointer-events-auto group-hover/item:translate-x-0 group-hover/item:opacity-100',
          'group-focus-within/item:pointer-events-auto group-focus-within/item:translate-x-0 group-focus-within/item:opacity-100'
        )}
      >
        <div className="absolute inset-y-0 -left-3 w-3" aria-hidden="true" />
        <div
          className={cn(
            'min-w-[152px] rounded-[22px] border border-black/[0.045] bg-white/86 p-2 shadow-[0_20px_40px_rgba(0,0,0,0.12)] backdrop-blur-[30px]',
            'dark:border-white/[0.055] dark:bg-[#111111]/86'
          )}
        >
          <div className="flex flex-col gap-1">
            {submenuItems?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={cn(
                  'flex min-h-[38px] items-center rounded-[16px] px-3 text-[11px] font-medium transition-colors duration-200',
                  item.active
                    ? 'bg-black/[0.055] text-stone-950 dark:bg-white/[0.07] dark:text-white'
                    : 'text-stone-500 hover:bg-black/[0.04] hover:text-stone-950 dark:text-[#999] dark:hover:bg-white/[0.05] dark:hover:text-white'
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ forceCollapsed: _forceCollapsed = false }: SidebarProps) {
  const t = useTranslations('nav.menu')
  const locale = useLocale()
  const pathname = usePathname()

  const SITE_TITLE = 'FlowMuse'

  const navItems = useMemo(
    () => [
      {
        href: `/${locale}/gallery`,
        label: t('gallery'),
        active: pathname.startsWith(`/${locale}/gallery`),
        icon: <Compass className="h-5 w-5 stroke-[2]" />,
      },
      {
        href: `/${locale}/create`,
        label: t('creationCenter'),
        active:
          pathname.startsWith(`/${locale}/create`) ||
          pathname.startsWith(`/${locale}/chat`) ||
          pathname.startsWith(`/${locale}/templates`),
        icon: <Sparkles className="h-5 w-5 stroke-[2]" />,
        submenuItems: [
          {
            href: `/${locale}/create`,
            label: t('creationMenu.quickMode'),
            active: pathname.startsWith(`/${locale}/create`),
          },
          {
            href: `/${locale}/chat`,
            label: t('creationMenu.workflowMode'),
            active: pathname.startsWith(`/${locale}/chat`),
          },
        ],
      },
      {
        href: `/${locale}/canvas`,
        label: t('rail.canvas'),
        active: pathname.startsWith(`/${locale}/canvas`),
        icon: <PenTool className="h-5 w-5 stroke-[2]" />,
      },
      {
        href: `/${locale}/projects`,
        label: t('projects'),
        active: pathname.startsWith(`/${locale}/projects`),
        icon: <FolderKanban className="h-5 w-5 stroke-[2]" />,
      },
      {
        href: `/${locale}/tasks`,
        label: t('tasks'),
        active: pathname.startsWith(`/${locale}/tasks`),
        icon: <ClipboardList className="h-5 w-5 stroke-[2]" />,
      },
    ],
    [locale, pathname, t],
  )

  return (
    <aside className="relative z-40 hidden w-[96px] shrink-0 md:block">
      <div
        className={cn(
          'fixed left-5 top-6 bottom-6 z-40 flex w-[68px] flex-col items-center justify-between px-0 py-4',
          'rounded-[34px] border border-black/[0.045] bg-transparent',
          'dark:border-white/[0.055]'
        )}
      >
        <TooltipShell label={SITE_TITLE}>
          <Link
            href={`/${locale}`}
            className="flex h-11 w-11 items-center justify-center text-stone-900 transition-transform duration-300 hover:scale-110 dark:text-white"
            aria-label={SITE_TITLE}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 12L12 17L22 12"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M2 17L12 22L22 17"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </TooltipShell>

        <nav className="relative flex w-full flex-1 flex-col items-center justify-center gap-2">
          {navItems.map((item, index) => (
            <DockNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.active}
              submenuItems={item.submenuItems}
            />
          ))}
        </nav>

        <div className="flex flex-col items-center gap-2.5">
          <LanguageSwitcher
            variant="icon"
            showNativeTitle={false}
            className="[&>button]:h-9 [&>button]:w-9 [&>button]:border [&>button]:border-transparent [&>button]:bg-transparent [&>button]:text-stone-500 [&>button]:shadow-none [&>button]:hover:bg-black/6 [&>button]:hover:text-stone-950 [&>button]:dark:text-[#777] [&>button]:dark:hover:bg-white/8 [&>button]:dark:hover:text-white [&>button]:dark:bg-transparent"
          />

          <ThemeToggle
            showNativeTitle={false}
            className="h-9 w-9 border border-transparent bg-transparent text-stone-500 shadow-none hover:bg-black/6 hover:text-stone-950 dark:bg-transparent dark:text-[#777] dark:hover:bg-white/8 dark:hover:text-white"
          />

          <div className="my-0.5 h-px w-8 bg-black/8 dark:bg-white/8" />

          <UserMenu
            variant="compact"
            dropdownSide="right"
            showNativeTitle={false}
            className="[&>button]:h-10 [&>button]:w-10 [&>button]:rounded-full [&>button]:border-transparent [&>button]:bg-transparent [&>button]:px-0 [&>button]:py-0 [&>button]:shadow-none [&>button]:hover:-translate-y-0.5 [&>button]:hover:border-black/10 [&>button]:hover:bg-black/[0.05] dark:[&>button]:hover:border-white/[0.08] dark:[&>button]:hover:bg-white/[0.06] [&>button>div]:h-10 [&>button>div]:w-10 [&>button>div]:border [&>button>div]:border-black/[0.06] dark:[&>button>div]:border-white/[0.06]"
          />
        </div>
      </div>
    </aside>
  )
}
