export type AutoProjectAgentContext = {
  enabled: boolean;
  projectId: string | null;
  imageModelId: string;
  videoModelId: string;
  preferredResolution: string | null;
  createProjectIfMissing: boolean;
};

export type AutoProjectAssetSnapshot = {
  id: string;
  kind: 'image' | 'video';
  title: string;
  description: string | null;
  sourcePrompt: string | null;
  url: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  referenceCharacterIds: string[];
  workflowStage: string | null;
  shotId: string | null;
  finalStoryboard: boolean;
};

export type AutoProjectOrderedReferenceAsset = AutoProjectAssetSnapshot & {
  ordinal: number;
  mentionLabel: string;
};

export type AutoProjectInspirationSnapshot = {
  id: string;
  title: string;
  episodeNumber: number | null;
  ideaText: string;
  contextText: string | null;
  plotText: string | null;
  generatedPrompt: string | null;
  createdAt: Date;
};

export type AutoProjectSnapshot = {
  id: string;
  name: string;
  concept: string | null;
  description: string | null;
  assets: AutoProjectAssetSnapshot[];
  inspirations: AutoProjectInspirationSnapshot[];
};

export type AutoProjectWorkflowStage =
  | 'project_plan_review'
  | 'outline_review'
  | 'character_review'
  | 'project_setup_confirmation'
  | 'shot_review';

export type AutoProjectWorkflowAction =
  | 'start_project_plan'
  | 'revise_project_plan'
  | 'confirm_project_plan'
  | 'start_outline'
  | 'revise_outline'
  | 'approve_outline'
  | 'revise_characters'
  | 'approve_characters'
  | 'revise_project_setup'
  | 'confirm_project_setup'
  | 'prepare_shots'
  | 'revise_shots'
  | 'generate_first'
  | 'generate_next'
  | 'confirm_skip_shot';

export type AutoProjectOutlineItem = {
  id: string;
  title: string;
  summary: string;
};

export type AutoProjectCharacterItem = {
  id: string;
  name: string;
  role: string;
  description: string;
  visualPrompt: string;
};

export type AutoProjectImagePlanItem = {
  id: string;
  title: string;
  prompt: string;
  negativePrompt: string | null;
  referenceCharacterIds: string[];
  referenceAssetIds: string[];
  preferredAspectRatio: string | null;
  preferredResolution: string | null;
};

export type AutoProjectShotPlanItem = {
  id: string;
  title: string;
  summary: string;
  script: string;
  prompt: string;
  duration: string;
  referenceCharacterIds: string[];
  referenceAssetIds: string[];
  preferredAspectRatio: string | null;
  preferredResolution: string | null;
  generationDecision: 'generate' | 'skip';
  decisionReason: string | null;
};

export type AutoProjectWorkflow = {
  stage: AutoProjectWorkflowStage;
  progressLabel: string | null;
  outlineTitle: string | null;
  outline: AutoProjectOutlineItem[];
  characters: AutoProjectCharacterItem[];
  imagePlans: AutoProjectImagePlanItem[];
  shots: AutoProjectShotPlanItem[];
  generationMode: 'step' | null;
  generatedShotIds: string[];
  skippedShotIds: string[];
  proposedProjectName: string | null;
  proposedProjectDescription: string | null;
  recommendedNextStage: AutoProjectWorkflowStage | null;
};

export type AutoProjectAgentMetadata = {
  projectId: string | null;
  projectName: string | null;
  imageModelId: string;
  videoModelId: string;
  preferredResolution: string | null;
  autoCreatedProject: boolean;
  createdTaskCount: number;
  stage: AutoProjectWorkflowStage | null;
  workflow: AutoProjectWorkflow | null;
};
