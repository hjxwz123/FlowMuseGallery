export type PromptOptimizeTask =
  | 'default'
  | 'video_director'
  | 'project_description'
  | 'project_storyboard'

export interface OptimizePromptDto {
  prompt: string
  images?: string[]
  modelType?: string
  projectDescription?: string
  task?: PromptOptimizeTask
}

export interface OptimizePromptResponse {
  content: string
}
