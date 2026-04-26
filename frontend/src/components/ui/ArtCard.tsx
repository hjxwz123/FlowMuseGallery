/**
 * ArtCard Component - Canvas Design
 * 艺术作品卡片：用于画廊展示
 * 特性：悬浮放大、玻璃效果、Aurora 阴影
 */

'use client'

import { cn } from '@/lib/utils/cn'
import Image from '@/lib/compat/image'
import { useState } from 'react'

export interface ArtCardProps {
  imageUrl: string
  title?: string
  author?: string
  className?: string
  onClick?: () => void
}

export const ArtCard = ({
  imageUrl,
  title,
  author,
  className,
  onClick,
}: ArtCardProps) => {
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-3xl',
        'border border-stone-200/80 bg-white shadow-canvas dark:border-stone-700/80 dark:bg-stone-900 dark:shadow-[0_16px_34px_rgba(0,0,0,0.28)]',
        'transition-all duration-500 ease-out',
        'hover:shadow-aurora hover:scale-[1.02] dark:hover:shadow-[0_22px_48px_rgba(0,0,0,0.42)]',
        className
      )}
      onClick={onClick}
    >
      {/* 图片容器 */}
      <div className="relative w-full overflow-hidden">
        {/* 宽高比容器 */}
        <div className="aspect-square">
          <Image
            src={imageUrl}
            alt={title || 'Artwork'}
            width={800}
            height={800}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            loading="lazy"
            className={cn(
              'w-full h-auto object-cover transition-all duration-500 ease-out',
              'group-hover:scale-110',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onLoad={() => setIsLoaded(true)}
            onError={(e) => {
              console.error('[ArtCard] Image load error:', imageUrl)
            }}
          />
        </div>

        {/* 改进的加载占位符 */}
        {!isLoaded && (
          <div className="absolute inset-0 w-full aspect-square bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 dark:from-stone-700 dark:via-stone-800 dark:to-stone-700 animate-pulse">
            <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-500">
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        )}

        {/* 悬浮信息层 */}
        {isLoaded && (
          <div
            className={cn(
              'absolute inset-0 bg-gradient-to-t from-stone-900/80 via-stone-900/40 to-transparent',
              'opacity-0 group-hover:opacity-100',
              'transition-opacity duration-300 ease-out',
              'pointer-events-none'
            )}
          >
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white pointer-events-auto">
              {title && (
                <h3 className="font-display text-xl mb-2 truncate">{title}</h3>
              )}
              <div className="flex items-center justify-between">
                {author && (
                  <p className="font-ui text-sm text-white/90 truncate">
                    {author}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
