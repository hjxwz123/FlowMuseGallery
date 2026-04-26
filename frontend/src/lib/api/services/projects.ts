import { apiClient } from '../client'
import '../interceptors'
import type {
  CreateProjectDto,
  CreateProjectInspirationDto,
  CreateProjectPromptDto,
  DeleteProjectAssetResponse,
  DeleteProjectInspirationResponse,
  DeleteProjectPromptResponse,
  DeleteProjectResponse,
  GenerateProjectDescriptionDto,
  GenerateProjectDescriptionResponse,
  GenerateProjectInspirationPromptDto,
  ImportProjectAssetsDto,
  ImportProjectAssetsResponse,
  ImportableWorksPage,
  ListImportableWorksParams,
  MergeProjectStoryboardDto,
  ProjectAsset,
  ProjectAssetKind,
  ProjectPrompt,
  ProjectStoryboardStatus,
  ProjectInspiration,
  ProjectQuotaSummary,
  ProjectSummary,
  UpdateProjectAssetDto,
  UpdateProjectInspirationDto,
  UpdateProjectPromptDto,
  UpdateProjectDto,
  UploadProjectAssetsResponse,
} from '../types/projects'

const LONG_RUNNING_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

export const projectsService = {
  async getProjects(): Promise<ProjectSummary[]> {
    return apiClient.get('/projects')
  },

  async getProjectQuota(): Promise<ProjectQuotaSummary> {
    return apiClient.get('/projects/quota')
  },

  async createProject(data: CreateProjectDto): Promise<ProjectSummary> {
    return apiClient.post('/projects', data)
  },

  async generateProjectDescription(data: GenerateProjectDescriptionDto): Promise<GenerateProjectDescriptionResponse> {
    const formData = new FormData()
    if (data.projectId) {
      formData.append('projectId', data.projectId)
    }
    if (data.name) {
      formData.append('name', data.name)
    }
    if (data.concept) {
      formData.append('concept', data.concept)
    }
    for (const file of data.files ?? []) {
      formData.append('files', file)
    }

    return apiClient.post('/projects/generate-description', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: LONG_RUNNING_REQUEST_TIMEOUT_MS,
    })
  },

  async getProject(id: string): Promise<ProjectSummary> {
    return apiClient.get(`/projects/${id}`)
  },

  async updateProject(id: string, data: UpdateProjectDto): Promise<ProjectSummary> {
    return apiClient.patch(`/projects/${id}`, data)
  },

  async deleteProject(id: string): Promise<DeleteProjectResponse> {
    return apiClient.delete(`/projects/${id}`)
  },

  async getProjectAssets(projectId: string): Promise<ProjectAsset[]> {
    return apiClient.get(`/projects/${projectId}/assets`)
  },

  async getProjectStoryboardStatus(
    projectId: string,
    shotIds?: string[],
  ): Promise<ProjectStoryboardStatus[]> {
    return apiClient.get(`/projects/${projectId}/storyboard-status`, {
      params: shotIds && shotIds.length > 0 ? { shotIds: shotIds.join(',') } : undefined,
    })
  },

  async getProjectInspirations(projectId: string): Promise<ProjectInspiration[]> {
    return apiClient.get(`/projects/${projectId}/inspirations`)
  },

  async createProjectInspiration(projectId: string, data: CreateProjectInspirationDto): Promise<ProjectInspiration> {
    return apiClient.post(`/projects/${projectId}/inspirations`, data)
  },

  async updateProjectInspiration(
    projectId: string,
    inspirationId: string,
    data: UpdateProjectInspirationDto,
  ): Promise<ProjectInspiration> {
    return apiClient.patch(`/projects/${projectId}/inspirations/${inspirationId}`, data)
  },

  async deleteProjectInspiration(projectId: string, inspirationId: string): Promise<DeleteProjectInspirationResponse> {
    return apiClient.delete(`/projects/${projectId}/inspirations/${inspirationId}`)
  },

  async getProjectPrompts(projectId: string): Promise<ProjectPrompt[]> {
    return apiClient.get(`/projects/${projectId}/prompts`)
  },

  async createProjectPrompt(projectId: string, data: CreateProjectPromptDto): Promise<ProjectPrompt> {
    return apiClient.post(`/projects/${projectId}/prompts`, data)
  },

  async updateProjectPrompt(
    projectId: string,
    promptId: string,
    data: UpdateProjectPromptDto,
  ): Promise<ProjectPrompt> {
    return apiClient.patch(`/projects/${projectId}/prompts/${promptId}`, data)
  },

  async deleteProjectPrompt(projectId: string, promptId: string): Promise<DeleteProjectPromptResponse> {
    return apiClient.delete(`/projects/${projectId}/prompts/${promptId}`)
  },

  async generateProjectInspirationPrompt(
    projectId: string,
    inspirationId: string,
    data: GenerateProjectInspirationPromptDto,
  ): Promise<ProjectInspiration> {
    return apiClient.post(`/projects/${projectId}/inspirations/${inspirationId}/generate-video-prompt`, data, {
      timeout: LONG_RUNNING_REQUEST_TIMEOUT_MS,
    })
  },

  async getImportableWorks(params?: ListImportableWorksParams): Promise<ImportableWorksPage> {
    return apiClient.get('/projects/importable-works', { params })
  },

  async importProjectAssets(projectId: string, data: ImportProjectAssetsDto): Promise<ImportProjectAssetsResponse> {
    return apiClient.post(`/projects/${projectId}/assets/import`, data)
  },

  async uploadProjectAssets(
    projectId: string,
    kind: ProjectAssetKind,
    files: File[],
  ): Promise<UploadProjectAssetsResponse> {
    const formData = new FormData()
    formData.append('kind', kind)
    for (const file of files) {
      formData.append('files', file)
    }

    return apiClient.post(`/projects/${projectId}/assets/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  async mergeProjectStoryboard(
    projectId: string,
    data: MergeProjectStoryboardDto,
  ): Promise<ProjectAsset> {
    return apiClient.post(`/projects/${projectId}/merge-storyboard`, data, {
      timeout: LONG_RUNNING_REQUEST_TIMEOUT_MS,
    })
  },

  async updateProjectAsset(projectId: string, assetId: string, data: UpdateProjectAssetDto): Promise<ProjectAsset> {
    return apiClient.patch(`/projects/${projectId}/assets/${assetId}`, data)
  },

  async deleteProjectAsset(projectId: string, assetId: string): Promise<DeleteProjectAssetResponse> {
    return apiClient.delete(`/projects/${projectId}/assets/${assetId}`)
  },
}
