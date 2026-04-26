/**
 * Axios 请求/响应拦截器
 * 处理：
 * 1. 自动添加 Authorization header
 * 2. 统一响应格式处理
 * 3. 401 统一强制退出
 * 4. 错误处理
 */

import { apiClient } from './client'
import { handleUnauthorizedStatus } from '../local/session'
import type { ApiResponse } from './types'
import { useAuthStore } from '../store/authStore'
import { ApiClientError } from './error'

// 请求拦截器：自动添加 Authorization header
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器：处理统一响应格式、401 强制退出、错误
apiClient.interceptors.response.use(
  (response) => {
    // 统一响应格式处理
    const apiResponse = response.data as ApiResponse

    if (apiResponse.code !== 0) {
      handleUnauthorizedStatus(apiResponse.code)
      // code 不为 0，表示业务错误
      return Promise.reject(
        new ApiClientError(apiResponse.msg || 'Request failed', apiResponse.code, apiResponse.data ?? null)
      )
    }

    // 直接返回 data 字段（简化 API 服务层代码）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return apiResponse.data as any
  },
  async (error) => {
    if (error.response?.status === 401) {
      handleUnauthorizedStatus(401)
    }

    // 其他错误直接抛出
    return Promise.reject(error)
  }
)
