/**
 * 聊天会话 API 服务
 */

import { useAuthStore } from '@/lib/store/authStore'

import { API_BASE_URL, apiClient } from '../client'
import '../interceptors'
import type { ApiResponse } from '../types'
import type {
  ChatConversation,
  CreateChatImageTaskRequest,
  CreateChatImageTaskResponse,
  CreateChatVideoTaskRequest,
  CreateChatVideoTaskResponse,
  ChatStreamDoneEvent,
  ChatStreamErrorEvent,
  ChatStreamEvent,
  ChatStreamStatusEvent,
  ChatStreamStartEvent,
  ConversationMessagesResponse,
  CreateConversationRequest,
  DeleteTurnResponse,
  SendMessageRequest,
  SendMessageResponse,
  UploadChatFilesResponse,
  UpdateConversationRequest,
} from '../types/chat'

interface StreamHandlers {
  onStart?: (event: ChatStreamStartEvent) => void
  onDelta?: (chunk: string) => void
  onReasoningDelta?: (chunk: string) => void
  onStatus?: (event: ChatStreamStatusEvent) => void
  onDone?: (event: ChatStreamDoneEvent) => void
  onError?: (event: ChatStreamErrorEvent) => void
}

function parseEvent(raw: string): ChatStreamEvent | null {
  try {
    const parsed = JSON.parse(raw) as ChatStreamEvent
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export const chatService = {
  listConversations: async (params?: { q?: string }): Promise<ChatConversation[]> => {
    return apiClient.get('/chat/conversations', { params })
  },

  createConversation: async (data: CreateConversationRequest): Promise<ChatConversation> => {
    return apiClient.post('/chat/conversations', data)
  },

  updateConversation: async (
    conversationId: string,
    data: UpdateConversationRequest
  ): Promise<ChatConversation> => {
    return apiClient.patch(`/chat/conversations/${conversationId}`, data)
  },

  deleteConversation: async (id: string): Promise<{ ok: boolean }> => {
    return apiClient.delete(`/chat/conversations/${id}`)
  },

  getMessages: async (conversationId: string): Promise<ConversationMessagesResponse> => {
    return apiClient.get(`/chat/conversations/${conversationId}/messages`)
  },

  sendMessage: async (
    conversationId: string,
    data: SendMessageRequest
  ): Promise<SendMessageResponse> => {
    return apiClient.post(`/chat/conversations/${conversationId}/messages`, data)
  },

  createImageTask: async (
    conversationId: string,
    data: CreateChatImageTaskRequest
  ): Promise<CreateChatImageTaskResponse> => {
    return apiClient.post(`/chat/conversations/${conversationId}/image-tasks`, data)
  },

  createVideoTask: async (
    conversationId: string,
    data: CreateChatVideoTaskRequest
  ): Promise<CreateChatVideoTaskResponse> => {
    return apiClient.post(`/chat/conversations/${conversationId}/video-tasks`, data)
  },

  deleteTurn: async (
    conversationId: string,
    messageId: string
  ): Promise<DeleteTurnResponse> => {
    return apiClient.delete(`/chat/conversations/${conversationId}/messages/${messageId}/turn`)
  },

  streamMessage: async (
    conversationId: string,
    data: SendMessageRequest,
    handlers: StreamHandlers,
    signal?: AbortSignal
  ): Promise<void> => {
    const apiBase = API_BASE_URL
    const token = useAuthStore.getState().accessToken

    const response = await fetch(`${apiBase}/chat/conversations/${conversationId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal,
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiResponse | null
      if (payload?.msg) {
        throw new Error(payload.msg)
      }
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('text/event-stream')) {
      const payload = (await response.json().catch(() => null)) as ApiResponse | null
      if (payload && payload.code !== 0) {
        throw new Error(payload.msg || 'Stream request failed')
      }
      throw new Error('Unexpected stream response')
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No stream body')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let hasDone = false

    const processRawEvent = (rawData: string) => {
      if (!rawData || rawData === '[DONE]') return

      const event = parseEvent(rawData)
      if (!event) return

      if (event.type === 'start') {
        handlers.onStart?.(event)
        return
      }
      if (event.type === 'delta') {
        if (event.content) handlers.onDelta?.(event.content)
        return
      }
      if (event.type === 'reasoning_delta') {
        if (event.content) handlers.onReasoningDelta?.(event.content)
        return
      }
      if (event.type === 'status') {
        handlers.onStatus?.(event)
        return
      }
      if (event.type === 'done') {
        hasDone = true
        handlers.onDone?.(event)
        return
      }
      if (event.type === 'error') {
        handlers.onError?.(event)
        throw new Error(event.message || 'Stream failed')
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const rawData = trimmed.slice(5).trim()
        processRawEvent(rawData)
      }
    }

    const tail = buffer.trim()
    if (tail && tail.startsWith('data:')) {
      processRawEvent(tail.slice(5).trim())
    }

    if (!hasDone) {
      throw new Error('Stream interrupted before completion')
    }
  },

  uploadFiles: async (
    conversationId: string,
    files: File[]
  ): Promise<UploadChatFilesResponse> => {
    const apiBase = API_BASE_URL
    const token = useAuthStore.getState().accessToken

    const form = new FormData()
    for (const file of files) {
      form.append('files', file)
    }

    const response = await fetch(`${apiBase}/chat/conversations/${conversationId}/files`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    })

    const payload = (await response.json().catch(() => null)) as ApiResponse<UploadChatFilesResponse> | null
    if (!response.ok || !payload || payload.code !== 0 || !payload.data) {
      throw new Error(payload?.msg || `HTTP ${response.status}`)
    }
    return payload.data
  },
}
