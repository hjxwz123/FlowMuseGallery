/**
 * 管理员 API 客户端
 * 统一处理 /admin 前缀，复用主客户端的拦截器配置
 */

import axios from 'axios'
import { apiClient } from './client'
import { useAuthStore } from '../store/authStore'
import { handleUnauthorizedStatus } from '../local/session'
import type { ApiResponse } from './types'
import { ApiClientError } from './error'

// 创建管理员专用客户端（继承基础配置，添加 /admin 前缀）
export const adminApiClient = axios.create({
  ...apiClient.defaults,
  baseURL: `${apiClient.defaults.baseURL}/admin`,
})

// 请求拦截器：自动添加 Authorization header
adminApiClient.interceptors.request.use(
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
adminApiClient.interceptors.response.use(
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

    // 处理 403 错误（权限不足）
    if (error.response?.status === 403) {
      // 管理员权限不足，重定向到首页
      if (typeof window !== 'undefined') {
        window.location.href = '/'
      }
      return Promise.reject(new Error('Access denied: Admin privileges required'))
    }

    // 其他错误直接抛出
    return Promise.reject(error)
  }
)
