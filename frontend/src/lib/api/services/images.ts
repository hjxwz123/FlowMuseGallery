/**
 * 图片生成 Images 服务
 * 基于 docs/api/08-images.md
 */

import { apiClient } from '../client'
import '../interceptors'
import type { ApiTask, TaskStatus } from '../types/task'
import type { PaginationParams, PaginatedResult } from '../types/pagination'
import type {
  GenerateImageDto,
  MidjourneyActionDto,
  MidjourneyModalDto,
  MidjourneyEditsDto,
} from '../types/images'

function normalizeGenerateImagePayload(data: GenerateImageDto): GenerateImageDto {
  const parameters = data.parameters
  if (!parameters || typeof parameters !== 'object') return data

  const sizeValue = (parameters as Record<string, unknown>).size
  const isAutoSize = typeof sizeValue === 'string' && sizeValue.trim().toLowerCase() === 'auto'
  if (!isAutoSize) return data

  const { size: _omit, ...rest } = parameters as Record<string, unknown>
  return {
    ...data,
    parameters: Object.keys(rest).length > 0 ? rest : undefined,
  }
}

export const imageService = {
  /**
   * 创建图片生成任务
   * POST /images/generate
   */
  async generate(data: GenerateImageDto): Promise<ApiTask> {
    return apiClient.post('/images/generate', normalizeGenerateImagePayload(data))
  },

  /**
   * 获取图片任务列表
   * GET /images/tasks
   */
  async getTasks(params?: { status?: TaskStatus } & PaginationParams): Promise<PaginatedResult<ApiTask>> {
    return apiClient.get('/images/tasks', { params })
  },

  /**
   * 获取图片任务详情
   * GET /images/tasks/:id
   */
  async getTask(id: string): Promise<ApiTask> {
    return apiClient.get(`/images/tasks/${id}`)
  },

  /**
   * 删除图片任务
   * DELETE /images/tasks/:id
   */
  async deleteTask(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete(`/images/tasks/${id}`)
  },

  /**
   * 重试图片任务
   * POST /images/tasks/:id/retry
   */
  async retryTask(id: string): Promise<ApiTask> {
    return apiClient.post(`/images/tasks/${id}/retry`)
  },

  /**
   * Midjourney U/V 操作
   * POST /images/tasks/:id/midjourney/action
   */
  async midjourneyAction(
    id: string,
    data: MidjourneyActionDto
  ): Promise<ApiTask> {
    return apiClient.post(`/images/tasks/${id}/midjourney/action`, data)
  },

  /**
   * Midjourney Modal 确认
   * POST /images/tasks/:id/midjourney/modal
   */
  async midjourneyModal(
    id: string,
    data: MidjourneyModalDto
  ): Promise<ApiTask> {
    return apiClient.post(`/images/tasks/${id}/midjourney/modal`, data)
  },

  /**
   * Midjourney Edits 图片编辑（新 API，一步到位）
   * POST /images/tasks/:id/midjourney/edits
   */
  async midjourneyEdits(
    id: string,
    data: MidjourneyEditsDto
  ): Promise<ApiTask> {
    return apiClient.post(`/images/tasks/${id}/midjourney/edits`, data)
  },
}
