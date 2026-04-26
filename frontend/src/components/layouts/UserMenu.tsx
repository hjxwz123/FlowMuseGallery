'use client'

import { useState } from 'react'
import { useLocale } from '@/i18n/client'
import { Settings } from 'lucide-react'

import { SystemConfigModal } from '@/components/admin/settings/SystemConfigModal'
import { cn } from '@/lib/utils/cn'

interface UserMenuProps {
  variant?: 'full' | 'compact'
  dropdownSide?: 'bottom' | 'right'
  forceLight?: boolean
  className?: string
  showNativeTitle?: boolean
}

export const UserMenu = ({
  variant = 'full',
  forceLight = false,
  className,
  showNativeTitle = true,
}: UserMenuProps) => {
  const locale = useLocale()
  const isZh = locale.toLowerCase().startsWith('zh')
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  const isCompact = variant === 'compact'
  const label = isZh ? '系统配置' : 'System Settings'

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsConfigOpen(true)}
        className={cn(
          isCompact
            ? 'flex h-10 w-10 items-center justify-center rounded-full'
            : 'flex h-10 w-10 items-center justify-center rounded-full',
          'relative border backdrop-blur-sm shadow-canvas transition-all duration-300 ease-out hover:border-aurora-purple/30 hover:text-aurora-purple active:scale-[0.985]',
          'bg-white/80 border-stone-200 text-stone-700',
          !forceLight && 'dark:bg-stone-800/80 dark:border-stone-700 dark:text-stone-200',
        )}
        aria-label={label}
        title={showNativeTitle ? label : undefined}
      >
        <Settings className={cn(isCompact ? 'h-5 w-5' : 'h-4 w-4')} strokeWidth={2} />
      </button>

      <SystemConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
      />
    </div>
  )
}
