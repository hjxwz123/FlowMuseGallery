import type { ProjectPromptType } from './projects'

export interface ChatModelSummary {
  id: string
  name: string
  icon: string | null
  type: 'chat'
  supportsImageInput: boolean
  isActive: boolean
}

export interface ChatConversationProjectContext {
  id: string
  name: string
}

export interface ChatConversation {
  id: string
  title: string
  isPinned: boolean
  model: ChatModelSummary
  projectContext: ChatConversationProjectContext | null
  lastMessagePreview: string
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export interface ChatProjectPromptSuggestion {
  action: 'create_project_prompt' | 'upsert_project_master_image_prompt'
  type: ProjectPromptType
  title: string
  prompt: string
}

export interface ChatTaskRef {
  kind: 'image' | 'video'
  taskId: string
  taskNo?: string
  status?: 'pending' | 'processing' | 'completed' | 'failed'
  shotId?: string
  finalStoryboard?: boolean
  modelId?: string
  provider?: string
  prompt?: string
  thumbnailUrl?: string | null
  resultUrl?: string | null
  errorMessage?: string | null
  createdAt?: string
  completedAt?: string | null
  canCancel?: boolean
  cancelSupported?: boolean
}

export interface ChatMediaAgentMetadata {
  status: 'clarify' | 'ready'
  intent: 'edit' | 'generate'
  optimizedPrompt: string | null
  negativePrompt: string | null
  suggestedReplies: string[]
  sourceUserMessageId: string
  modelId: string
  modelName: string
  modelType: 'image' | 'video'
  preferredAspectRatio: string | null
  preferredResolution: string | null
  preferredDuration: string | null
  referenceVideos: string[]
  referenceAudios: string[]
  referenceImageCount: number
  referenceVideoCount: number
  referenceAudioCount: number
  autoCreated: boolean
}

export interface ChatAutoProjectAgentMetadata {
  projectId: string | null
  projectName: string | null
  imageModelId: string
  videoModelId: string
  preferredResolution: string | null
  autoCreatedProject: boolean
  createdTaskCount: number
  stage?: ChatAutoProjectStage | null
  workflow?: ChatAutoProjectWorkflow | null
}

export type ChatAutoProjectStage =
  | 'project_plan_review'
  | 'outline_review'
  | 'character_review'
  | 'project_setup_confirmation'
  | 'shot_review'

export interface ChatAutoProjectOutlineItem {
  id: string
  title: string
  summary: string
}

export interface ChatAutoProjectCharacterItem {
  id: string
  name: string
  role: string
  description: string
  visualPrompt: string
}

export interface ChatAutoProjectImagePlanItem {
  id: string
  title: string
  prompt: string
  negativePrompt: string | null
  referenceCharacterIds: string[]
  referenceAssetIds: string[]
  preferredAspectRatio: string | null
  preferredResolution: string | null
}

export interface ChatAutoProjectShotPlanItem {
  id: string
  title: string
  summary: string
  script: string
  prompt: string
  duration: string
  referenceCharacterIds: string[]
  referenceAssetIds: string[]
  preferredAspectRatio: string | null
  preferredResolution: string | null
  generationDecision: 'generate' | 'skip'
  decisionReason: string | null
}

export interface ChatAutoProjectWorkflow {
  stage: ChatAutoProjectStage
  progressLabel: string | null
  outlineTitle: string | null
  outline: ChatAutoProjectOutlineItem[]
  characters: ChatAutoProjectCharacterItem[]
  imagePlans: ChatAutoProjectImagePlanItem[]
  shots: ChatAutoProjectShotPlanItem[]
  generationMode: 'step' | null
  generatedShotIds: string[]
  skippedShotIds: string[]
  proposedProjectName: string | null
  proposedProjectDescription: string | null
  recommendedNextStage: ChatAutoProjectStage | null
}

export interface ChatMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string | null
  images: string[]
  files: ChatMessageFile[]
  citations: ChatCitation[]
  taskRefs: ChatTaskRef[]
  mediaAgent?: ChatMediaAgentMetadata | null
  autoProjectAgent?: ChatAutoProjectAgentMetadata | null
  projectPromptSuggestion?: ChatProjectPromptSuggestion | null
  projectPromptSuggestions?: ChatProjectPromptSuggestion[]
  createdAt: string
}

export interface ChatMessageFile {
  id: string
  fileName: string
  extension: string
  mimeType: string
  fileSize: number
}

export interface ChatCitation {
  type: 'file'
  fileId?: string
  fileName?: string
  extension?: string
  title?: string
  url?: string
  snippet: string
  score?: number
  chunkIndex?: number
}

export interface CreateConversationRequest {
  modelId: string
  title?: string
}

export interface UpdateConversationRequest {
  modelId?: string
  projectContextId?: string
  clearProjectContext?: boolean
  title?: string
  isPinned?: boolean
}

export interface SendMessageRequest {
  content?: string
  images?: string[]
  fileIds?: string[]
  mediaAgent?: {
    enabled: boolean
    modelId: string
    preferredAspectRatio?: string
    preferredResolution?: string
    preferredDuration?: string
    referenceImages?: string[]
    referenceVideos?: string[]
    referenceAudios?: string[]
    autoCreate?: boolean
  }
  autoProjectAgent?: {
    enabled: boolean
    projectId?: string
    imageModelId: string
    videoModelId: string
    preferredResolution?: string
    createProjectIfMissing?: boolean
  }
}

export interface CreateChatImageTaskRequest {
  modelId: string
  prompt: string
  negativePrompt?: string
  images?: string[]
  preferredAspectRatio?: string
  preferredResolution?: string
  useConversationContextEdit?: boolean
  parameters?: Record<string, unknown>
  userMessageContent?: string
  sourceAssistantMessageId?: string
}

export interface CreateChatVideoTaskRequest {
  modelId: string
  prompt: string
  images?: string[]
  videos?: string[]
  audios?: string[]
  preferredAspectRatio?: string
  preferredResolution?: string
  preferredDuration?: string
  useConversationContextEdit?: boolean
  parameters?: Record<string, unknown>
  userMessageContent?: string
  sourceAssistantMessageId?: string
}

export interface UploadChatFilesResponse {
  files: ChatMessageFile[]
}

export interface ConversationMessagesResponse {
  conversation: ChatConversation
  messages: ChatMessage[]
}

export interface SendMessageResponse {
  conversation: ChatConversation
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface CreateChatImageTaskResponse {
  conversation: ChatConversation
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface CreateChatVideoTaskResponse {
  conversation: ChatConversation
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export interface DeleteTurnResponse {
  ok: boolean
  deletedMessageIds: string[]
  conversation: ChatConversation
}

export interface ChatStreamStartEvent {
  type: 'start'
  conversation: ChatConversation
  userMessage: ChatMessage
}

export interface ChatStreamDeltaEvent {
  type: 'delta'
  content: string
}

export interface ChatStreamReasoningDeltaEvent {
  type: 'reasoning_delta'
  content: string
}

export interface ChatStreamStatusEvent {
  type: 'status'
  stage: 'planning' | 'searching' | 'summarizing'
  message: string
  searchedQueries?: number
  totalQueries?: number
  searchedArticles?: number
  totalArticles?: number
}

export interface ChatStreamDoneEvent {
  type: 'done'
  conversation: ChatConversation
  assistantMessage: ChatMessage
}

export interface ChatStreamErrorEvent {
  type: 'error'
  message: string
}

export type ChatStreamEvent =
  | ChatStreamStartEvent
  | ChatStreamDeltaEvent
  | ChatStreamReasoningDeltaEvent
  | ChatStreamStatusEvent
  | ChatStreamDoneEvent
  | ChatStreamErrorEvent
