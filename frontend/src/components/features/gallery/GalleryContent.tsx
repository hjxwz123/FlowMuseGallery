'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from '@/i18n/client'
import { Images } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { PageEmptyState } from '@/components/shared/PageEmptyState'
import { PageTransition } from '@/components/shared/PageTransition'
import { MasonryGrid, MasonryItem } from '@/components/ui/MasonryGrid'
import { tasksService } from '@/lib/api/services/tasks'
import type { ApiTask } from '@/lib/api/types'
import { useRouter } from '@/lib/router'
import { cn } from '@/lib/utils/cn'

interface GalleryContentProps {
  locale: string
}

function getCardPreview(task: ApiTask) {
  if (task.type === 'video' && !task.thumbnailUrl && task.resultUrl) {
    return { kind: 'video' as const, src: task.resultUrl }
  }

  return {
    kind: 'image' as const,
    src: task.thumbnailUrl || task.resultUrl || '',
  }
}

function getAspectRatio(task: ApiTask) {
  const params = task.parameters
  if (params && typeof params === 'object') {
    if (params.width && params.height) {
      return `${params.width} / ${params.height}`
    }

    if (typeof params.ar === 'string') {
      const aspectRatios: Record<string, string> = {
        '16:9': '16 / 9',
        '9:16': '9 / 16',
        '3:2': '3 / 2',
        '2:3': '2 / 3',
        '4:3': '4 / 3',
        '3:4': '3 / 4',
        '1:1': '1 / 1',
      }

      if (aspectRatios[params.ar]) {
        return aspectRatios[params.ar]
      }
    }
  }

  return task.type === 'video' ? '16 / 9' : '1 / 1'
}

function GalleryArtworkCard({ artwork, isZh }: { artwork: ApiTask; isZh: boolean }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const preview = getCardPreview(artwork)
  const aspectRatio = useMemo(() => getAspectRatio(artwork), [artwork])

  if (!preview.src) return null

  return (
    <MasonryItem>
      <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
        <div className="relative" style={{ aspectRatio }}>
          {!isLoaded ? (
            <div className="absolute inset-0 animate-pulse bg-stone-100 dark:bg-stone-900" />
          ) : null}

          {preview.kind === 'video' ? (
            <video
              src={preview.src}
              poster={artwork.thumbnailUrl || undefined}
              className={cn(
                'block h-full w-full object-cover transition-opacity duration-500',
                isLoaded ? 'opacity-100' : 'opacity-0',
              )}
              muted
              playsInline
              preload="metadata"
              onLoadedData={() => setIsLoaded(true)}
            />
          ) : (
            <img
              src={preview.src}
              alt={artwork.prompt || (isZh ? '作品' : 'Artwork')}
              className={cn(
                'block h-full w-full object-cover transition-opacity duration-500',
                isLoaded ? 'opacity-100' : 'opacity-0',
              )}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
            />
          )}
        </div>
      </div>
    </MasonryItem>
  )
}

export function GalleryContent({ locale }: GalleryContentProps) {
  const t = useTranslations('gallery')
  const router = useRouter()
  const isZh = locale.toLowerCase().startsWith('zh')
  const [artworks, setArtworks] = useState<ApiTask[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)
  const pageSize = 24

  const visibleArtworks = useMemo(
    () => artworks.filter((artwork) => artwork.resultUrl || artwork.thumbnailUrl),
    [artworks],
  )

  const loadArtworks = async (pageNum: number, append = false) => {
    if (loadingRef.current) return
    loadingRef.current = true

    try {
      if (append) {
        setIsLoadingMore(true)
      } else {
        setIsLoading(true)
      }

      const result = await tasksService.getFeed({
        page: pageNum,
        limit: pageSize,
        status: 'completed',
      })
      const nextItems = result.data || []

      setArtworks((prev) => (append ? [...prev, ...nextItems] : nextItems))
      setHasMore(Boolean(result.pagination.hasMore))
      setPage(pageNum)
    } catch (error) {
      console.error('[GalleryContent] Failed to load local artworks:', error)
      if (!append) {
        setArtworks([])
        setHasMore(false)
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
      loadingRef.current = false
    }
  }

  useEffect(() => {
    void loadArtworks(1, false)
  }, [])

  useEffect(() => {
    if (!hasMore) return

    const handleScroll = () => {
      if (loadingRef.current) return

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight

      if (scrollTop + windowHeight >= documentHeight - 260) {
        void loadArtworks(page + 1, true)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, page])

  return (
    <PageTransition className="min-h-screen bg-canvas text-stone-950 dark:bg-canvas-dark dark:text-white">
      <section className="mx-auto max-w-[98rem] px-4 pb-10 pt-6 md:px-6 md:pb-14 md:pt-8">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white md:text-4xl">
            {t('title')}
          </h1>
        </div>

        {isLoading && visibleArtworks.length === 0 ? (
          <MasonryGrid columns={4}>
            {Array.from({ length: 12 }).map((_, index) => (
              <MasonryItem key={index}>
                <div className="overflow-hidden rounded-[24px] border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950">
                  <div className="aspect-[4/5] animate-pulse bg-stone-100 dark:bg-stone-900" />
                </div>
              </MasonryItem>
            ))}
          </MasonryGrid>
        ) : null}

        {!isLoading && visibleArtworks.length === 0 ? (
          <PageEmptyState
            icon={<Images className="h-7 w-7" />}
            title={t('empty')}
            description={t('emptyDescription')}
            action={
              <Button onClick={() => router.push(`/${locale}/create`)}>
                {t('emptyAction')}
              </Button>
            }
          />
        ) : null}

        {!isLoading && visibleArtworks.length > 0 ? (
          <>
            <MasonryGrid columns={4}>
              {visibleArtworks.map((artwork) => (
                <GalleryArtworkCard key={`${artwork.type}-${artwork.id}`} artwork={artwork} isZh={isZh} />
              ))}
            </MasonryGrid>

            {isLoadingMore ? (
              <div className="py-10 text-center text-sm font-medium text-stone-500 dark:text-stone-400">
                {t('loadingMore')}
              </div>
            ) : null}

            {!hasMore ? (
              <div className="py-10 text-center text-sm font-medium text-stone-400 dark:text-stone-500">
                {t('end')}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </PageTransition>
  )
}
