'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslations } from '@/i18n/client'
import { cn } from '@/lib/utils/cn'
import { MagicInput, Loading, SkeletonCard } from '@/components/ui'
import { MasonryGrid, MasonryItem } from '@/components/ui/MasonryGrid'
import { PageTransition } from '@/components/shared/PageTransition'
import { FadeIn } from '@/components/shared/FadeIn'
import { PromptCard } from '../prompts/PromptCard'
import { PromptDetailModal } from '../prompts/PromptDetailModal'
import { loadNetworkPrompts } from '@/lib/prompts/localPrompts'
import type { Prompt, ModeFilter } from '@/lib/types/prompt'

const CACHE_KEY = 'prompts_cache'
const CACHE_DURATION = 5 * 60 * 60 * 1000

export function TemplatesContent() {
  const t = useTranslations('templates')
  const tPrompts = useTranslations('prompts')

  const [allPrompts, setAllPrompts] = useState<Prompt[]>([])
  const [displayedPrompts, setDisplayedPrompts] = useState<Prompt[]>([])
  const [promptsLoading, setPromptsLoading] = useState(false)
  const [promptsError, setPromptsError] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [promptCategoryFilter, setPromptCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)
  const promptsLoaded = useRef(false)
  const pageSize = 10

  useEffect(() => {
    if (promptsLoaded.current) return
    promptsLoaded.current = true

    const load = async () => {
      try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { data, timestamp } = JSON.parse(cached)
          if (Date.now() - timestamp < CACHE_DURATION) {
            setAllPrompts(data)
            return
          }
        }
      } catch {}

      setPromptsLoading(true)
      try {
        const data = await loadNetworkPrompts()
        setAllPrompts(data)
        setPromptsError(null)
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
      } catch {
        setPromptsError(tPrompts('error.load'))
        try {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) {
            const { data } = JSON.parse(cached)
            setAllPrompts(data)
            setPromptsError(null)
          }
        } catch {}
      } finally {
        setPromptsLoading(false)
      }
    }

    load()
  }, [tPrompts])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      localStorage.removeItem(CACHE_KEY)
      const data = await loadNetworkPrompts()
      setAllPrompts(data)
      setPromptsError(null)
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }))
    } catch {
      setPromptsError(tPrompts('error.load'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const filteredPrompts = useMemo(() => {
    return allPrompts.filter((prompt) => {
      if (modeFilter !== 'all' && prompt.mode !== modeFilter) return false
      if (promptCategoryFilter !== 'all' && prompt.category !== promptCategoryFilter) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          prompt.title?.toLowerCase().includes(query) ||
          prompt.prompt?.toLowerCase().includes(query) ||
          prompt.author?.toLowerCase().includes(query) ||
          prompt.category?.toLowerCase().includes(query) ||
          prompt.sub_category?.toLowerCase().includes(query)
        )
      }
      return true
    })
  }, [allPrompts, modeFilter, promptCategoryFilter, searchQuery])

  useEffect(() => {
    setDisplayedPrompts(filteredPrompts.slice(0, page * pageSize))
    setHasMore(page * pageSize < filteredPrompts.length)
  }, [filteredPrompts, page])

  useEffect(() => {
    setPage(1)
  }, [modeFilter, promptCategoryFilter, searchQuery])

  const handleLoadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setIsLoadingMore(true)
    setTimeout(() => {
      setPage((prev) => prev + 1)
      setIsLoadingMore(false)
      loadingRef.current = false
    }, 300)
  }, [hasMore])

  useEffect(() => {
    if (!hasMore) return

    const onScroll = () => {
      if (loadingRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        handleLoadMore()
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [handleLoadMore, hasMore])

  const promptCategories = useMemo(
    () => ['all', ...new Set(allPrompts.map((prompt) => prompt.category))],
    [allPrompts]
  )

  const chipBase =
    'flex-shrink-0 rounded-full px-3.5 py-1.5 font-ui text-xs font-medium transition-all duration-200 whitespace-nowrap'
  const chipActive = 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900'
  const chipInactive =
    'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'
  const chipPurpleActive = 'bg-aurora-purple text-white'

  return (
    <PageTransition className="min-h-screen bg-transparent px-4 py-8 md:py-12">
      <div className="mx-auto max-w-[98rem]">
        <div className="mb-8 text-center">
          <FadeIn variant="slide">
            <h1 className="mb-3 font-display text-4xl text-stone-900 dark:text-stone-100 md:text-6xl">
              {t('source.network')}
            </h1>
          </FadeIn>
          <FadeIn variant="fade" delay={0.1}>
            <p className="mb-6 font-ui text-base text-stone-600 dark:text-stone-400 md:text-xl">
              {t('description')}
            </p>
          </FadeIn>

          <FadeIn variant="scale" delay={0.2}>
            <div className="mx-auto max-w-3xl space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <MagicInput
                    type="text"
                    placeholder={t('network.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    }
                  />
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  {(['all', 'generate', 'edit'] as ModeFilter[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setModeFilter(mode)}
                      className={cn(chipBase, modeFilter === mode ? chipActive : chipInactive)}
                    >
                      {tPrompts(`tabs.${mode}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title={t('actions.refresh')}
                  className={cn(
                    'flex-shrink-0 rounded-xl border border-stone-200 bg-white/80 p-2.5 transition-all duration-200 hover:bg-white dark:border-stone-700 dark:bg-stone-800/80 dark:hover:bg-stone-800',
                    isRefreshing && 'animate-spin'
                  )}
                >
                  <svg className="h-4 w-4 text-stone-600 dark:text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {promptCategories.length > 1 && (
                <div className="overflow-x-auto scrollbar-hide">
                  <div className="mx-auto flex w-max items-center gap-1.5 pb-0.5">
                    {promptCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setPromptCategoryFilter(category)}
                        className={cn(chipBase, promptCategoryFilter === category ? chipPurpleActive : chipInactive)}
                      >
                        {category === 'all' ? tPrompts('category.all') : category}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FadeIn>
        </div>

        {promptsLoading ? (
          <FadeIn variant="fade">
            <MasonryGrid columns={3}>
              {Array.from({ length: 6 }).map((_, index) => (
                <MasonryItem key={`prompt-skeleton-${index}`}>
                  <SkeletonCard />
                </MasonryItem>
              ))}
            </MasonryGrid>
          </FadeIn>
        ) : promptsError ? (
          <div className="py-20 text-center">
            <p className="font-ui text-red-600 dark:text-red-400">{promptsError}</p>
          </div>
        ) : displayedPrompts.length === 0 ? (
          <EmptyState title={tPrompts('empty.title')} desc={tPrompts('empty.description')} />
        ) : (
          <>
            <FadeIn variant="fade" delay={0.1}>
              <MasonryGrid columns={3}>
                {displayedPrompts.map((prompt, index) => (
                  <MasonryItem key={`${prompt.title}-${index}`}>
                    <FadeIn variant="scale" delay={index * 0.04}>
                      <PromptCard prompt={prompt} onClick={() => setSelectedPrompt(prompt)} />
                    </FadeIn>
                  </MasonryItem>
                ))}
              </MasonryGrid>
            </FadeIn>
            {isLoadingMore && (
              <div className="flex justify-center py-8">
                <Loading />
              </div>
            )}
            {!hasMore && displayedPrompts.length > 0 && (
              <div className="py-8 text-center">
                <p className="font-ui text-sm text-stone-500">{tPrompts('noMore')}</p>
              </div>
            )}
          </>
        )}
      </div>

      {selectedPrompt && (
        <PromptDetailModal prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} />
      )}
    </PageTransition>
  )
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="py-16 text-center md:py-20">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
        <svg
          className="h-10 w-10 text-stone-400 dark:text-stone-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      </div>
      <h2 className="mb-2 font-display text-2xl text-stone-900 dark:text-stone-100 md:text-3xl">
        {title}
      </h2>
      <p className="font-ui text-stone-600 dark:text-stone-400">{desc}</p>
    </div>
  )
}
