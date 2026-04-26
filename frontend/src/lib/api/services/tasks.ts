import { apiClient } from '../client'
import '../interceptors'
import type { TaskStatus } from '../types/common'
import type { PaginationParams, SlicePaginatedResult } from '../types/pagination'
import type { ApiTask } from '../types/task'

export type UnifiedTaskFeedItem = ApiTask

export const tasksService = {
  async getFeed(
    params?: PaginationParams & { status?: TaskStatus }
  ): Promise<SlicePaginatedResult<UnifiedTaskFeedItem>> {
    return apiClient.get('/tasks/feed', { params })
  },
}
