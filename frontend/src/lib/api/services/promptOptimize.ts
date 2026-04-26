import { apiClient } from '../client'
import '../interceptors'
import type { OptimizePromptDto, OptimizePromptResponse } from '../types/promptOptimize'

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

export const promptOptimizeService = {
  async optimizePrompt(data: OptimizePromptDto): Promise<OptimizePromptResponse> {
    return apiClient.post('/prompt/optimize', data, {
      timeout: LONG_RUNNING_REQUEST_TIMEOUT_MS,
    })
  },
}
