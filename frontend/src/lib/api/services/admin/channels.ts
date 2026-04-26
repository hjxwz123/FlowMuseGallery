/**
 * 管理员 - API 渠道管理 API 服务（匹配后端 API）
 */

import { adminApiClient } from '@/lib/api/adminClient'
import type {
  Channel,
  CreateChannelDto,
  UpdateChannelDto,
  ChannelTestResult,
  ChannelStatistics,
} from '@/lib/api/types/admin/channels'

export const adminChannelService = {
  /**
   * 获取渠道列表
   */
  getChannels: async (): Promise<Channel[]> => {
    return adminApiClient.get('/channels')
  },

  /**
   * 获取渠道详情
   */
  getChannel: async (id: string): Promise<Channel> => {
    return adminApiClient.get(`/channels/${id}`)
  },

  /**
   * 创建渠道
   */
  createChannel: async (dto: CreateChannelDto): Promise<Channel> => {
    return adminApiClient.post('/channels', dto)
  },

  /**
   * 更新渠道
   */
  updateChannel: async (
    id: string,
    dto: UpdateChannelDto
  ): Promise<Channel> => {
    return adminApiClient.put(`/channels/${id}`, dto)
  },

  /**
   * 删除渠道
   */
  deleteChannel: async (id: string): Promise<{ ok: boolean }> => {
    return adminApiClient.delete(`/channels/${id}`)
  },

  /**
   * 测试渠道连接
   */
  testConnection: async (id: string): Promise<ChannelTestResult> => {
    return adminApiClient.post(`/channels/${id}/test`)
  },

  /**
   * 获取渠道统计
   */
  getChannelStatistics: async (id: string): Promise<ChannelStatistics> => {
    return adminApiClient.get(`/channels/${id}/statistics`)
  },
}
