import type { ApiTask } from '@/lib/api/types/task'

export type UnifiedTaskCacheItem = ApiTask

type TasksViewCacheSnapshot = {
  userId: string | null
  tasks: UnifiedTaskCacheItem[]
  page: number
  hasMore: boolean
  cachedAt: number
}

let tasksViewCache: TasksViewCacheSnapshot | null = null

function isExpired(cachedAt: number, maxAgeMs: number) {
  return Date.now() - cachedAt > maxAgeMs
}

function sortTasksByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  )
}

export function getTasksViewCache(userId: string | null, maxAgeMs: number) {
  if (!tasksViewCache) return null
  if (tasksViewCache.userId !== userId) return null
  if (isExpired(tasksViewCache.cachedAt, maxAgeMs)) return null
  return tasksViewCache
}

export function setTasksViewCache(
  userId: string | null,
  snapshot: Omit<TasksViewCacheSnapshot, 'userId' | 'cachedAt'>,
) {
  tasksViewCache = {
    userId,
    ...snapshot,
    cachedAt: Date.now(),
  }
}

export function upsertTaskInTasksViewCache(userId: string | null, task: UnifiedTaskCacheItem) {
  if (!tasksViewCache || tasksViewCache.userId !== userId) return

  const taskKey = `${task.type}-${task.id}`
  const nextTasks = sortTasksByCreatedAtDesc(
    [
      task,
      ...tasksViewCache.tasks.filter((item) => `${item.type}-${item.id}` !== taskKey),
    ],
  )

  tasksViewCache = {
    ...tasksViewCache,
    tasks: nextTasks,
    cachedAt: Date.now(),
  }
}

export function removeTaskFromTasksViewCache(
  userId: string | null,
  taskType: UnifiedTaskCacheItem['type'],
  taskId: string,
) {
  if (!tasksViewCache || tasksViewCache.userId !== userId) return

  tasksViewCache = {
    ...tasksViewCache,
    tasks: tasksViewCache.tasks.filter((item) => !(item.type === taskType && item.id === taskId)),
    cachedAt: Date.now(),
  }
}

export function invalidateTasksViewCache(userId?: string | null) {
  if (userId === undefined || tasksViewCache?.userId === userId) {
    tasksViewCache = null
  }
}
