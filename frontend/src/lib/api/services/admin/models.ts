/**
 * 管理员 - AI 模型管理 API 服务（匹配后端 API）
 */

import { adminApiClient } from '@/lib/api/adminClient'
import type {
  Model,
  ModelFilterParams,
} from '@/lib/api/types/admin/models'

const ARCHIVED_MODEL_NAME_PREFIX = '[DELETED#'
const ARCHIVED_MODEL_DESCRIPTION_PREFIX = 'Archived placeholder for deleted model'

function isArchivedModel(model: Model): boolean {
  return (
    model.name.startsWith(ARCHIVED_MODEL_NAME_PREFIX) ||
    (model.description?.startsWith(ARCHIVED_MODEL_DESCRIPTION_PREFIX) ?? false)
  )
}

export const adminModelService = {
  /**
   * 获取模型列表（包含关联的 channel）
   */
  getModels: async (params?: ModelFilterParams): Promise<Model[]> => {
    const models = (await adminApiClient.get('/models', { params })) as Model[]
    return models.filter((model) => !isArchivedModel(model))
  },

  /**
   * 获取模型详情（包含关联的 channel）
   */
  getModel: async (id: string): Promise<Model> => {
    return adminApiClient.get(`/models/${id}`)
  },
}
