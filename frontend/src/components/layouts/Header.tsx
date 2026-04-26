/**
 * Header 导航栏
 * Glass 效果的顶部导航
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLocale } from '@/i18n/client'
import Link from '@/lib/compat/link'
import { usePathname } from '@/lib/router'
import { Logo } from '@/components/shared/Logo'
import { UserMenu } from './UserMenu'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { cn } from '@/lib/utils/cn'
import {
  ChevronDown,
  Compass,
  Sparkles,
  LayoutTemplate,
  MessageSquare,
  ClipboardList,
  FolderKanban,
} from 'lucide-react'

interface HeaderProps {
  className?: string
}

export const Header = ({ className }: HeaderProps = {}) => {
  const t = useTranslations('nav.menu')
  const locale = useLocale()
  const pathname = usePathname()
  const [clickedLink, setClickedLink] = useState<string | null>(null)
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false)
  const createMenuRef = useRef<HTMLDivElement>(null)

  const createMenuItems = [
    {
      href: `/${locale}/create`,
      label: t('creationMenu.workspace'),
      description: t('creationMenu.workspaceDesc'),
      key: 'workspace',
      icon: Sparkles,
    },
    {
      href: `/${locale}/templates`,
      label: t('creationMenu.templates'),
      description: t('creationMenu.templatesDesc'),
      key: 'templates',
      icon: LayoutTemplate,
    },
  ]

  const mainNavLinks = [
    { href: `/${locale}/gallery`, label: t('gallery'), key: 'gallery', icon: Compass },
    { href: `/${locale}/chat`, label: t('chat'), key: 'chat', icon: MessageSquare },
    { href: `/${locale}/projects`, label: t('projects'), key: 'projects', icon: FolderKanban },
    { href: `/${locale}/tasks`, label: t('tasks'), key: 'tasks', icon: ClipboardList },
  ]
  const homeNavLink = mainNavLinks[0]
  const HomeIcon = homeNavLink.icon
  const secondaryNavLinks = mainNavLinks.slice(1)

  const isActive = (href: string) => {
    if (href === `/${locale}`) {
      return pathname === `/${locale}` || pathname === `/${locale}/`
    }
    return pathname.startsWith(href)
  }

  const isCreateMenuActive = createMenuItems.some((item) => isActive(item.href))

  // 处理链接点击，添加视觉反馈
  const handleLinkClick = (key: string) => {
    setClickedLink(key)
    // 清除点击状态
    setTimeout(() => setClickedLink(null), 300)
  }

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setIsCreateMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  useEffect(() => {
    setIsCreateMenuOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        'bg-white/80 backdrop-blur-md border-b border-stone-200/50',
        'dark:bg-stone-900/80 dark:border-stone-700/50',
        'shadow-canvas transition-all duration-500 ease-out',
        className
      )}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
        {/* Logo */}
        <Logo />

        {/* Navigation Links - Desktop */}
        <div className="hidden md:flex items-center gap-6">
          <Link
            key={homeNavLink.key}
            href={homeNavLink.href}
            prefetch={true}
            onClick={() => handleLinkClick(homeNavLink.key)}
            className={cn(
              'relative font-ui text-sm font-medium transition-all duration-300 ease-out flex items-center gap-2',
              isActive(homeNavLink.href)
                ? 'text-aurora-purple'
                : 'text-stone-700 hover:text-aurora-purple dark:text-stone-300 dark:hover:text-aurora-purple',
              'after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-300',
              isActive(homeNavLink.href)
                ? 'after:w-full after:bg-gradient-to-r after:from-aurora-pink after:via-aurora-purple after:to-aurora-blue'
                : 'hover:after:w-full hover:after:bg-gradient-to-r hover:after:from-aurora-pink hover:after:via-aurora-purple hover:after:to-aurora-blue',
              clickedLink === homeNavLink.key && 'scale-95 opacity-70'
            )}
          >
            <HomeIcon className="h-4 w-4" />
            {homeNavLink.label}
          </Link>

          <div className="relative" ref={createMenuRef}>
            <button
              type="button"
              onClick={() => {
                setIsCreateMenuOpen((prev) => !prev)
                handleLinkClick('create')
              }}
              className={cn(
                'relative font-ui text-sm font-medium transition-all duration-300 ease-out flex items-center gap-2 !bg-transparent hover:!bg-transparent focus:!bg-transparent active:!bg-transparent border-transparent',
                isCreateMenuActive
                  ? '!text-aurora-purple'
                  : '!text-stone-700 hover:!text-aurora-purple dark:!text-stone-300 dark:hover:!text-aurora-purple',
                'after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-300',
                isCreateMenuActive
                  ? 'after:w-full after:bg-gradient-to-r after:from-aurora-pink after:via-aurora-purple after:to-aurora-blue'
                  : 'hover:after:w-full hover:after:bg-gradient-to-r hover:after:from-aurora-pink hover:after:via-aurora-purple hover:after:to-aurora-blue',
                clickedLink === 'create' && 'scale-95 opacity-70'
              )}
            >
              <Sparkles className="h-4 w-4" />
              {t('create')}
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  isCreateMenuOpen && 'rotate-180'
                )}
              />
            </button>

            {isCreateMenuOpen && (
              <div
                className={cn(
                  'absolute left-0 top-full mt-3 w-[320px] z-50 rounded-2xl border border-stone-200 bg-white/95 p-2 shadow-canvas-lg backdrop-blur-sm',
                  'dark:border-stone-700 dark:bg-stone-900/95'
                )}
              >
                <div className="mb-2 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 dark:bg-stone-800/70">
                  <span className="font-ui text-xs font-medium text-stone-600 dark:text-stone-300">
                    {t('creationMenu.badge')}
                  </span>
                </div>
                <div className="space-y-1">
                  {createMenuItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        prefetch={true}
                        onClick={() => {
                          setIsCreateMenuOpen(false)
                          handleLinkClick(item.key)
                        }}
                        className={cn(
                          'group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200',
                          isActive(item.href)
                            ? 'text-aurora-purple'
                            : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
                        )}
                      >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-ui text-sm font-medium">{item.label}</div>
                          <p className="line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {secondaryNavLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.key}
                href={link.href}
                prefetch={true}
                onClick={() => handleLinkClick(link.key)}
                className={cn(
                  'relative font-ui text-sm font-medium transition-all duration-300 ease-out flex items-center gap-2',
                  isActive(link.href)
                    ? 'text-aurora-purple'
                    : 'text-stone-700 hover:text-aurora-purple dark:text-stone-300 dark:hover:text-aurora-purple',
                  'after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:transition-all after:duration-300',
                  isActive(link.href)
                    ? 'after:w-full after:bg-gradient-to-r after:from-aurora-pink after:via-aurora-purple after:to-aurora-blue'
                    : 'hover:after:w-full hover:after:bg-gradient-to-r hover:after:from-aurora-pink hover:after:via-aurora-purple hover:after:to-aurora-blue',
                  clickedLink === link.key && 'scale-95 opacity-70'
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            )
          })}
        </div>

        {/* Right Section: Theme + Language + Local Settings Menu */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LanguageSwitcher className="hidden sm:flex" />
          <UserMenu />
        </div>
      </nav>
    </header>
  )
}
