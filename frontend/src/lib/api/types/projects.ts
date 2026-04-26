import type { OkResponse } from './common'
import type { PaginationParams, PaginatedResult } from './pagination'

export type ProjectAssetKind = 'image' | 'video' | 'document'
export type ProjectAssetSource = 'upload' | 'task'
export type ProjectPromptType = 'image' | 'video'

export interface ProjectSummary {
  id: string
  name: string
  concept: string
  description: string
  assetCount: number
  inspirationCount: number
  promptCount: number
  coverKind: ProjectAssetKind | null
  coverUrl: string | null
  coverThumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectQuotaSummary {
  currentCount: number
  maxCount: number | null
  remainingCount: number | null
  unlimited: boolean
  quotaSource: 'free' | 'unlimited'
}

export interface ProjectInspiration {
  id: string
  projectId: string
  title: string
  episodeNumber: number | null
  ideaText: string
  contextText: string
  plotText: string
  generatedPrompt: string
  createdAt: string
  updatedAt: string
}

export interface ProjectPrompt {
  id: string
  projectId: string
  type: ProjectPromptType
  title: string
  prompt: string
  createdAt: string
  updatedAt: string
}

export interface ProjectAsset {
  id: string
  projectId: string
  kind: ProjectAssetKind
  source: ProjectAssetSource
  title: string
  description: string | null
  sourcePrompt: string | null
  fileName: string | null
  mimeType: string | null
  fileSize: number | null
  url: string
  thumbnailUrl: string | null
  storageKey: string | null
  imageTaskId: string | null
  videoTaskId: string | null
  createdAt: string
  updatedAt: string
}

export interface ProjectStoryboardStatus {
  shotId: string
  title: string | null
  taskId: string | null
  taskNo: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed' | null
  completed: boolean
  resultUrl: string | null
  thumbnailUrl: string | null
  errorMessage: string | null
}

export interface ImportableWork {
  id: string
  type: 'image' | 'video'
  prompt: string
  thumbnailUrl: string | null
  resultUrl: string | null
  createdAt: string
}

export interface CreateProjectDto {
  name: string
  concept?: string
  description?: string
  masterImagePrompt?: string
}

export interface UpdateProjectDto {
  name?: string
  concept?: string
  description?: string
  masterImagePrompt?: string
}

export interface GenerateProjectDescriptionDto {
  projectId?: string
  name?: string
  concept?: string
  files?: File[]
}

export interface GenerateProjectDescriptionResponse {
  description: string
  styleSummary?: string
  masterImagePrompt?: string
}

export interface CreateProjectInspirationDto {
  title: string
  ideaText: string
  contextText?: string
  plotText?: string
  episodeNumber?: number | null
}

export interface UpdateProjectInspirationDto {
  title?: string
  ideaText?: string
  contextText?: string
  plotText?: string
  episodeNumber?: number | null
}

export interface GenerateProjectInspirationPromptDto {
  includeProjectDescription?: boolean
  includePreviousInspirations?: boolean
  includePreviousContextText?: boolean
  includePreviousPlotText?: boolean
}

export interface CreateProjectPromptDto {
  type: ProjectPromptType
  title: string
  prompt: string
}

export interface UpdateProjectPromptDto {
  type?: ProjectPromptType
  title?: string
  prompt?: string
}

export interface UpdateProjectAssetDto {
  title?: string
  description?: string
}

export interface ImportProjectAssetsDto {
  items: Array<{
    id: string
    type: 'image' | 'video'
  }>
}

export interface ImportProjectAssetsResponse {
  importedCount: number
  skippedCount: number
  assets: ProjectAsset[]
}

export interface UploadProjectAssetsResponse {
  assets: ProjectAsset[]
}

export interface MergeProjectStoryboardDto {
  shotIds?: string[]
}

export interface ListImportableWorksParams extends PaginationParams {
  type?: 'image' | 'video'
  q?: string
}

export type ImportableWorksPage = PaginatedResult<ImportableWork>
export type DeleteProjectResponse = OkResponse
export type DeleteProjectAssetResponse = OkResponse
export type DeleteProjectInspirationResponse = OkResponse
export type DeleteProjectPromptResponse = OkResponse
