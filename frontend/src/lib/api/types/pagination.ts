/**
 * 分页请求参数
 */
export interface PaginationParams {
  page?: number
  limit?: number
}

/**
 * 分页响应结果
 */
export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasMore: boolean
  }
}

export interface SlicePaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    hasMore: boolean
  }
}
