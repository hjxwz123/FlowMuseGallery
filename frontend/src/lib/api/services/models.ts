/**
 * 模型 Models 服务
 * 基于 docs/api/07-models.md
 */

import { apiClient } from '../client'
import '../interceptors'
import type { AiModel, ModelType } from '../types/models'
import type {
  ModelWithCapabilities,
  ModelCapabilities,
} from '../types/modelCapabilities'

export const modelService = {
  /**
   * 获取模型列表
   * GET /models
   */
  async getModels(params?: {
    type?: ModelType
    provider?: string
  }): Promise<AiModel[]> {
    // 拦截器已经自动解包了 response.data.data，直接返回
    return apiClient.get('/models', { params })
  },

  /**
   * 获取单个模型详情
   * GET /models/:id
   */
  async getModel(id: string): Promise<AiModel> {
    // 拦截器已经自动解包了 response.data.data，直接返回
    return apiClient.get(`/models/${id}`)
  },

  /**
   * 获取可用模型列表并附带能力信息
   * GET /models/capabilities
   */
  async getModelsWithCapabilities(params?: {
    type?: ModelType
    provider?: string
  }): Promise<ModelWithCapabilities[]> {
    return apiClient.get('/models/capabilities', { params })
  },

  /**
   * 获取单个模型的能力信息
   * GET /models/:id/capabilities
   */
  async getModelCapabilities(id: string): Promise<ModelCapabilities> {
    return apiClient.get(`/models/${id}/capabilities`)
  },
}
