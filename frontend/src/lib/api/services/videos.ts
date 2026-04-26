/**
 * 视频生成 Videos 服务
 * 基于 docs/api/09-videos.md
 */

import { apiClient } from '../client'
import '../interceptors'
import type { ApiTask, TaskStatus } from '../types/task'
import type { PaginationParams, PaginatedResult } from '../types/pagination'
import type {
  GenerateVideoDto,
  ReferenceInputUploadProvider,
  SeedanceInputUploadKind,
  UploadSeedanceInputsResponse,
} from '../types/videos'

export const videoService = {
  /**
   * 创建视频生成任务
   * POST /videos/generate
   */
  async generate(data: GenerateVideoDto): Promise<ApiTask> {
    return apiClient.post('/videos/generate', data)
  },

  /**
   * 上传 Seedance 2.0 输入素材到本地 uploads
   * POST /videos/uploads/seedance-inputs
   */
  async uploadSeedanceInputs(
    kind: SeedanceInputUploadKind,
    files: File[],
    provider?: ReferenceInputUploadProvider,
  ): Promise<UploadSeedanceInputsResponse> {
    const formData = new FormData()
    formData.append('kind', kind)
    if (provider) {
      formData.append('provider', provider)
    }
    for (const file of files) {
      formData.append('files', file)
    }

    return apiClient.post('/videos/uploads/seedance-inputs', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  /**
   * 获取视频任务列表
   * GET /videos/tasks
   */
  async getTasks(params?: { status?: TaskStatus } & PaginationParams): Promise<PaginatedResult<ApiTask>> {
    return apiClient.get('/videos/tasks', { params })
  },

  /**
   * 获取视频任务详情
   * GET /videos/tasks/:id
   */
  async getTask(id: string): Promise<ApiTask> {
    return apiClient.get(`/videos/tasks/${id}`)
  },

  /**
   * 删除视频任务
   * DELETE /videos/tasks/:id
   */
  async deleteTask(id: string): Promise<{ ok: boolean }> {
    return apiClient.delete(`/videos/tasks/${id}`)
  },

  /**
   * 取消视频任务
   * POST /videos/tasks/:id/cancel
   */
  async cancelTask(id: string): Promise<ApiTask> {
    return apiClient.post(`/videos/tasks/${id}/cancel`)
  },

  /**
   * 重试视频任务
   * POST /videos/tasks/:id/retry
   */
  async retryTask(id: string): Promise<ApiTask> {
    return apiClient.post(`/videos/tasks/${id}/retry`)
  },
}
