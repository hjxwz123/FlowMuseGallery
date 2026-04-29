/**
 * 任务列表内容组件
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import { useRouter } from '@/lib/router'
import { ClipboardList } from 'lucide-react'
import { Button, Card, Loading, SkeletonTaskCard } from '@/components/ui'
import { imageService, videoService, tasksService } from '@/lib/api/services'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  getTasksViewCache,
  removeTaskFromTasksViewCache,
  setTasksViewCache,
  upsertTaskInTasksViewCache,
} from '@/lib/cache/viewCache'
import { TaskCard } from './TaskCard'
import type { ApiTask, TaskStatus } from '@/lib/api/types/task'
import { cn } from '@/lib/utils/cn'
import { PageTransition } from '@/components/shared/PageTransition'
import { FadeIn } from '@/components/shared/FadeIn'
import { PageEmptyState } from '@/components/shared/PageEmptyState'

type TaskFilter = 'all' | TaskStatus
type UnifiedTask = ApiTask

const TASKS_CACHE_MAX_AGE_MS = 5 * 60 * 1000

function sortTasksByCreatedAtDesc(items: UnifiedTask[]) {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

function appendTasksStable(prev: UnifiedTask[], incoming: UnifiedTask[]) {
  const existingKeys = new Set(prev.map((task) => `${task.type}-${task.id}`))
  const dedupedIncoming = sortTasksByCreatedAtDesc(incoming).filter((task) => {
    const key = `${task.type}-${task.id}`
    if (existingKeys.has(key)) return false
    existingKeys.add(key)
    return true
  })

  return [...prev, ...dedupedIncoming]
}

export function TasksContent() {
  const t = useTranslations('tasks')
  const locale = useLocale()
  const router = useRouter()
  const { user, isReady } = useAuth()

  const [tasks, setTasks] = useState<UnifiedTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const loadingRef = useRef(false)
  const tasksRef = useRef<UnifiedTask[]>([])
  const pageRef = useRef(1)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const pageSize = 10
  const userId = user?.id ?? null
  const hasActiveTasks = useMemo(
    () => tasks.some((task) => task.status === 'pending' || task.status === 'processing'),
    [tasks]
  )

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  useEffect(() => {
    pageRef.current = page
  }, [page])

  const applyTaskUpdate = useCallback(
    (nextTask: UnifiedTask) => {
      setTasks((prev) => {
        const taskKey = `${nextTask.type}-${nextTask.id}`
        return sortTasksByCreatedAtDesc([
          nextTask,
          ...prev.filter((item) => `${item.type}-${item.id}` !== taskKey),
        ])
      })
      upsertTaskInTasksViewCache(userId, nextTask)
    },
    [userId]
  )

  // 加载任务列表
  const loadTasks = useCallback(
    async (pageNum: number, append: boolean = false, options?: { silent?: boolean }) => {
      if (loadingRef.current) return
      loadingRef.current = true
      const silent = options?.silent ?? false

      try {
        if (append) {
          setIsLoadingMore(true)
        } else if (!silent) {
          setIsLoading(true)
        }

        const feedResult = await tasksService.getFeed({ page: pageNum, limit: pageSize })
        const feedTasks = sortTasksByCreatedAtDesc(feedResult.data || [])
        const nextTasks = append ? appendTasksStable(tasksRef.current, feedTasks) : feedTasks
        setTasks(nextTasks)

        const hasMoreData = Boolean(feedResult.pagination.hasMore)
        setHasMore(hasMoreData)
        setPage(pageNum)
        setError(null)
        setTasksViewCache(userId, {
          tasks: nextTasks,
          page: pageNum,
          hasMore: hasMoreData,
        })
      } catch (err) {
        console.error('[TasksContent] Failed to load tasks:', err)
        if (!silent || tasksRef.current.length === 0) {
          setError(t('errors.load'))
        }
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
        loadingRef.current = false
      }
    },
    [t, userId]
  )

  const loadNextPage = useCallback(async () => {
    if (!hasMore || loadingRef.current) return
    await loadTasks(pageRef.current + 1, true)
  }, [hasMore, loadTasks])

  // 等待 hydration 完成后加载本地任务数据
  useEffect(() => {
    if (!isReady) return

    const cached = getTasksViewCache(userId, TASKS_CACHE_MAX_AGE_MS)
    if (cached) {
      setTasks(cached.tasks)
      setPage(cached.page)
      setHasMore(cached.hasMore)
      setError(null)
      setIsLoading(cached.tasks.length === 0)

      void loadTasks(1, false, { silent: cached.tasks.length > 0 })
      return
    }

    void loadTasks(1, false)
  }, [isReady, loadTasks, userId])

  // 更新单个任务
  const updateTask = useCallback(
    async (taskType: 'image' | 'video', taskId: string) => {
      try {
        // 根据类型获取任务详情
        const taskDetail =
          taskType === 'image'
            ? await imageService.getTask(taskId)
            : await videoService.getTask(taskId)

        // 更新任务列表中的对应任务
        applyTaskUpdate(taskDetail)
      } catch (error) {
        console.error('[TasksContent] 更新任务失败:', error)
      }
    },
    [applyTaskUpdate]
  )

  useEffect(() => {
    if (!hasActiveTasks) return
    const timer = window.setInterval(() => {
      void loadTasks(1, false, { silent: true })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [hasActiveTasks, loadTasks])

  // 底部哨兵触发加载更多，避免全局 scroll 监听带来的滚动卡顿
  useEffect(() => {
    if (!hasMore) return
    const sentinel = loadMoreRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        void loadNextPage()
      },
      { root: null, rootMargin: '480px 0px', threshold: 0.01 },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadNextPage])

  useEffect(() => {
    if (!hasMore) return

    let ticking = false

    const checkShouldLoadMore = () => {
      ticking = false
      if (loadingRef.current) return

      const doc = document.documentElement
      const remaining = doc.scrollHeight - (window.scrollY + window.innerHeight)
      if (remaining <= 480) {
        void loadNextPage()
      }
    }

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(checkShouldLoadMore)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [hasMore, loadNextPage])

  // 过滤任务
  const filteredTasks = useMemo(
    () => (activeFilter === 'all' ? tasks : tasks.filter((task) => task.status === activeFilter)),
    [activeFilter, tasks],
  )

  return (
    <PageTransition className="min-h-screen bg-canvas px-3 py-6 dark:bg-canvas-dark md:px-4 md:py-8">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6">
        <FadeIn variant="slide">
          <section className="mb-2 flex flex-col gap-4 md:mb-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white md:text-4xl">
                {t('title')}
              </h1>
            </div>

            <div className="w-full md:max-w-md">
              <div className="overflow-x-auto rounded-[22px] border border-stone-200/80 bg-white p-1 dark:border-stone-800/80 dark:bg-stone-950">
                <div className="inline-flex min-w-full items-center gap-1">
                  {(
                    ['all', 'pending', 'processing', 'completed', 'failed'] as TaskFilter[]
                  ).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={cn(
                        'flex-1 whitespace-nowrap rounded-[18px] px-4 py-2.5 text-sm font-medium transition-all duration-200',
                        activeFilter === filter
                          ? 'theme-toggle-active'
                          : 'text-stone-600 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white'
                      )}
                    >
                      {t(`tabs.${filter}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* Task List */}
        {isLoading ? (
          <FadeIn variant="fade" delay={0.2}>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <SkeletonTaskCard />
                </div>
              ))}
            </div>
          </FadeIn>
        ) : error ? (
          <Card className="text-center py-12">
            <p className="font-ui text-red-600 mb-4">{error}</p>
            <Button onClick={() => loadTasks(1, false)} variant="secondary">
              重试
            </Button>
          </Card>
        ) : filteredTasks.length === 0 ? (
          <PageEmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title={t('empty.title')}
            description={t('empty.description')}
            action={
              <Button onClick={() => router.push(`/${locale}/create`)}>
                {t('empty.action')}
              </Button>
            }
          />
        ) : (
          <>
            <FadeIn variant="fade" delay={0.2}>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {filteredTasks.map((task, index) => (
                  <div key={`${task.type}-${task.id}`}>
                    <FadeIn variant="scale" delay={Math.min(index, 6) * 0.04}>
                      <TaskCard
                        task={task}
                        onUpdate={(nextTask) => {
                          if (nextTask) {
                            applyTaskUpdate(nextTask)
                            return
                          }
                          void updateTask(task.type, task.id)
                        }}
                        onDelete={() => {
                          setTasks((prev) => prev.filter((item) => !(item.type === task.type && item.id === task.id)))
                          removeTaskFromTasksViewCache(userId, task.type, task.id)
                        }}
                      />
                    </FadeIn>
                  </div>
                ))}
              </div>
            </FadeIn>

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="flex justify-center py-8">
                <Loading />
              </div>
            )}
            {/* No More Data Message */}
            {!hasMore && tasks.length > 0 && (
              <div className="text-center py-8">
                <p className="font-ui text-sm text-stone-500">
                  已加载全部任务
                </p>
              </div>
            )}
          </>
        )}

        {!isLoading && !error && hasMore && <div ref={loadMoreRef} className="h-1 w-full" aria-hidden="true" />}
      </div>
    </PageTransition>
  )
}
