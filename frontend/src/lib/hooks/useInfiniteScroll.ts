/**
 * 触底加载通用 Hook
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { PaginatedResult } from '../api/types/pagination'

interface UseInfiniteScrollOptions<T> {
  /**
   * 加载函数，返回分页结果
   */
  loadFn: (page: number, limit: number) => Promise<PaginatedResult<T>>
  /**
   * 每页数量，默认 10
   */
  pageSize?: number
  /**
   * 是否启用，默认 true
   */
  enabled?: boolean
  /**
   * 触发加载的阈值（距离底部的像素），默认 100
   */
  threshold?: number
}

interface UseInfiniteScrollResult<T> {
  /**
   * 数据列表
   */
  data: T[]
  /**
   * 是否正在加载
   */
  isLoading: boolean
  /**
   * 是否正在加载更多
   */
  isLoadingMore: boolean
  /**
   * 是否还有更多数据
   */
  hasMore: boolean
  /**
   * 当前页码
   */
  page: number
  /**
   * 总数
   */
  total: number
  /**
   * 错误信息
   */
  error: string | null
  /**
   * 刷新数据（重新从第一页加载）
   */
  refresh: () => Promise<void>
  /**
   * 加载更多
   */
  loadMore: () => Promise<void>
}

export function useInfiniteScroll<T>({
  loadFn,
  pageSize = 10,
  enabled = true,
  threshold = 100,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollResult<T> {
  const [data, setData] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const loadingRef = useRef(false)
  const initialLoadRef = useRef(false)

  // 加载数据
  const load = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (loadingRef.current) return
      loadingRef.current = true

      try {
        if (append) {
          setIsLoadingMore(true)
        } else {
          setIsLoading(true)
        }
        setError(null)

        const result = await loadFn(pageNum, pageSize)

        if (append) {
          setData((prev) => [...prev, ...result.data])
        } else {
          setData(result.data)
        }

        setPage(result.pagination.page)
        setTotal(result.pagination.total)
        setHasMore(result.pagination.hasMore)
      } catch (err) {
        console.error('[useInfiniteScroll] Failed to load data:', err)
        setError('加载失败，请重试')
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
        loadingRef.current = false
      }
    },
    [loadFn, pageSize]
  )

  // 初始加载
  useEffect(() => {
    if (enabled && !initialLoadRef.current) {
      initialLoadRef.current = true
      load(1, false)
    }
  }, [enabled, load])

  // 刷新
  const refresh = useCallback(async () => {
    setPage(1)
    setData([])
    setHasMore(true)
    await load(1, false)
  }, [load])

  // 加载更多
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingRef.current) return
    await load(page + 1, true)
  }, [hasMore, page, load])

  // 监听滚动事件
  useEffect(() => {
    if (!enabled || !hasMore) return

    const handleScroll = () => {
      if (loadingRef.current) return

      // 计算是否接近底部
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight

      if (scrollTop + windowHeight >= documentHeight - threshold) {
        loadMore()
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [enabled, hasMore, threshold, loadMore])

  return {
    data,
    isLoading,
    isLoadingMore,
    hasMore,
    page,
    total,
    error,
    refresh,
    loadMore,
  }
}
