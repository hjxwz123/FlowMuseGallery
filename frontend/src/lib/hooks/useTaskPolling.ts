/**
 * 任务轮询 Hook
 * 自动轮询 pending/processing 状态的任务
 */

import { useEffect, useCallback } from 'react'
import type { ApiTask } from '../api/types/task'

interface UseTaskPollingOptions {
  tasks: ApiTask[]
  onRefresh: () => Promise<void>
  interval?: number
  enabled?: boolean
}

export const useTaskPolling = ({
  tasks,
  onRefresh,
  interval = 5000,
  enabled = true,
}: UseTaskPollingOptions) => {
  const hasActiveTasks = useCallback(() => {
    return tasks.some(
      (task) => task.status === 'pending' || task.status === 'processing'
    )
  }, [tasks])

  useEffect(() => {
    if (!enabled || !hasActiveTasks()) {
      return
    }

    const timer = setInterval(() => {
      onRefresh()
    }, interval)

    return () => clearInterval(timer)
  }, [enabled, hasActiveTasks, onRefresh, interval])

  return {
    isPolling: enabled && hasActiveTasks(),
  }
}
