import { BadRequestException } from '@nestjs/common';
import { parseSqliteJson } from '../common/utils/sqlite-json.util';

import type {
  AutoProjectAgentContext,
  AutoProjectAgentMetadata,
  AutoProjectCharacterItem,
  AutoProjectImagePlanItem,
  AutoProjectOutlineItem,
  AutoProjectShotPlanItem,
  AutoProjectWorkflow,
  AutoProjectWorkflowStage,
} from './auto-project-workflow.types';

function normalizeWorkflowText(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function normalizeAutoProjectShortText(value: unknown, maxLength = 160) {
  const text = normalizeWorkflowText(value).trim();
  return text ? text.slice(0, maxLength) : '';
}

function normalizeAutoProjectStringList(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0),
  )].slice(0, max);
}

function normalizeAutoProjectOutlineItems(value: unknown, previous: AutoProjectOutlineItem[] = []) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const title =
        normalizeAutoProjectShortText(source.title ?? source.name ?? source.heading, 120)
        || previous[index]?.title
        || `Beat ${index + 1}`;
      const summary =
        normalizeAutoProjectShortText(source.summary ?? source.description ?? source.content ?? source.beat, 400)
        || previous[index]?.summary
        || '';

      if (!title && !summary) return null;

      return {
        id:
          (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
          || previous[index]?.id
          || `outline-${index + 1}`,
        title,
        summary: summary || title,
      } satisfies AutoProjectOutlineItem;
    })
    .filter((item): item is AutoProjectOutlineItem => Boolean(item))
    .slice(0, 8);
}

function normalizeAutoProjectCharacters(value: unknown, previous: AutoProjectCharacterItem[] = []) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const name =
        normalizeAutoProjectShortText(source.name ?? source.title, 80)
        || previous[index]?.name
        || `Character ${index + 1}`;
      const role =
        normalizeAutoProjectShortText(source.role ?? source.function ?? source.archetype, 120)
        || previous[index]?.role
        || '';
      const description =
        normalizeAutoProjectShortText(
          source.description ?? source.look ?? source.summary ?? source.personality,
          360,
        )
        || previous[index]?.description
        || '';
      const visualPrompt =
        normalizeAutoProjectShortText(
          source.visualPrompt ?? source.prompt ?? source.imagePrompt ?? source.visualDescription,
          1200,
        )
        || previous[index]?.visualPrompt
        || '';

      if (!name && !description && !visualPrompt) return null;

      return {
        id:
          (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
          || previous[index]?.id
          || `character-${index + 1}`,
        name,
        role,
        description,
        visualPrompt,
      } satisfies AutoProjectCharacterItem;
    })
    .filter((item): item is AutoProjectCharacterItem => Boolean(item))
    .slice(0, 8);
}

function normalizeAutoProjectImagePlans(value: unknown, previous: AutoProjectImagePlanItem[] = []) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const prompt =
        normalizeAutoProjectShortText(source.prompt ?? source.imagePrompt ?? source.finalPrompt, 2000)
        || previous[index]?.prompt
        || '';
      if (!prompt) return null;

      return {
        id:
          (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
          || previous[index]?.id
          || `image-plan-${index + 1}`,
        title:
          normalizeAutoProjectShortText(source.title ?? source.name, 120)
          || previous[index]?.title
          || `Image ${index + 1}`,
        prompt,
        negativePrompt:
          normalizeAutoProjectShortText(source.negativePrompt, 1200)
          || previous[index]?.negativePrompt
          || null,
        referenceCharacterIds: Array.isArray(source.referenceCharacterIds)
          ? normalizeAutoProjectStringList(source.referenceCharacterIds, 8)
          : previous[index]?.referenceCharacterIds ?? [],
        referenceAssetIds: Array.isArray(source.referenceAssetIds)
          ? normalizeAutoProjectStringList(source.referenceAssetIds, 12)
          : previous[index]?.referenceAssetIds ?? [],
        preferredAspectRatio:
          normalizeAutoProjectShortText(source.preferredAspectRatio, 40)
          || previous[index]?.preferredAspectRatio
          || null,
        preferredResolution:
          normalizeAutoProjectShortText(source.preferredResolution, 40)
          || previous[index]?.preferredResolution
          || null,
      } satisfies AutoProjectImagePlanItem;
    })
    .filter((item): item is AutoProjectImagePlanItem => Boolean(item))
    .slice(0, 6);
}

function normalizeAutoProjectShots(value: unknown, previous: AutoProjectShotPlanItem[] = []) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const source = item as Record<string, unknown>;
      const prompt =
        normalizeAutoProjectShortText(source.prompt ?? source.videoPrompt ?? source.finalPrompt, 2200)
        || previous[index]?.prompt
        || '';
      if (!prompt) return null;

      return {
        id:
          (typeof source.id === 'string' && source.id.trim() ? source.id.trim() : '')
          || previous[index]?.id
          || `shot-${index + 1}`,
        title:
          normalizeAutoProjectShortText(source.title ?? source.name, 120)
          || previous[index]?.title
          || `Shot ${index + 1}`,
        summary:
          normalizeAutoProjectShortText(source.summary ?? source.description ?? source.visual, 360)
          || previous[index]?.summary
          || '',
        script:
          normalizeAutoProjectShortText(source.script ?? source.dialogue ?? source.voiceover, 800)
          || previous[index]?.script
          || '',
        prompt,
        duration:
          normalizeAutoProjectShortText(source.duration ?? source.preferredDuration ?? source.seconds, 40)
          || previous[index]?.duration
          || '5',
        referenceCharacterIds: Array.isArray(source.referenceCharacterIds)
          ? normalizeAutoProjectStringList(source.referenceCharacterIds, 8)
          : previous[index]?.referenceCharacterIds ?? [],
        referenceAssetIds: Array.isArray(source.referenceAssetIds)
          ? normalizeAutoProjectStringList(source.referenceAssetIds, 12)
          : previous[index]?.referenceAssetIds ?? [],
        preferredAspectRatio:
          normalizeAutoProjectShortText(source.preferredAspectRatio, 40)
          || previous[index]?.preferredAspectRatio
          || null,
        preferredResolution:
          normalizeAutoProjectShortText(source.preferredResolution, 40)
          || previous[index]?.preferredResolution
          || null,
        generationDecision:
          source.generationDecision === 'skip' || source.decision === 'skip'
            ? 'skip'
            : previous[index]?.generationDecision === 'skip'
              ? 'skip'
              : 'generate',
        decisionReason:
          normalizeAutoProjectShortText(
            source.decisionReason ?? source.generationReason ?? source.reason,
            400,
          )
          || previous[index]?.decisionReason
          || null,
      } satisfies AutoProjectShotPlanItem;
    })
    .filter((item): item is AutoProjectShotPlanItem => Boolean(item))
    .slice(0, 12);
}

export function parseAutoProjectAgentContext(raw?: unknown): AutoProjectAgentContext | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  if (source.enabled !== true) return null;

  const imageModelId =
    typeof source.imageModelId === 'string' && source.imageModelId.trim()
      ? source.imageModelId.trim()
      : '';
  const videoModelId =
    typeof source.videoModelId === 'string' && source.videoModelId.trim()
      ? source.videoModelId.trim()
      : '';

  if (!imageModelId) {
    throw new BadRequestException('autoProjectAgent.imageModelId is required');
  }
  if (!videoModelId) {
    throw new BadRequestException('autoProjectAgent.videoModelId is required');
  }

  return {
    enabled: true,
    projectId:
      typeof source.projectId === 'string' && source.projectId.trim()
        ? source.projectId.trim()
        : null,
    imageModelId,
    videoModelId,
    preferredResolution:
      typeof source.preferredResolution === 'string' && source.preferredResolution.trim()
        ? source.preferredResolution.trim().slice(0, 40)
        : null,
    createProjectIfMissing: source.createProjectIfMissing !== false,
  };
}

export function extractAutoProjectAgentFromProviderData(
  providerData: unknown,
): AutoProjectAgentMetadata | null {
  providerData = parseSqliteJson(providerData) ?? providerData;
  if (!providerData || typeof providerData !== 'object' || Array.isArray(providerData)) {
    return null;
  }

  const source = providerData as Record<string, unknown>;
  const rawValue = source.autoProjectAgent;
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return null;
  }

  const raw = rawValue as Record<string, unknown>;
  const projectId =
    typeof raw.projectId === 'string' && raw.projectId.trim()
      ? raw.projectId.trim()
      : null;
  const projectName =
    typeof raw.projectName === 'string' && raw.projectName.trim()
      ? raw.projectName.trim()
      : null;
  const imageModelId = typeof raw.imageModelId === 'string' ? raw.imageModelId.trim() : '';
  const videoModelId = typeof raw.videoModelId === 'string' ? raw.videoModelId.trim() : '';
  const preferredResolution =
    typeof raw.preferredResolution === 'string' && raw.preferredResolution.trim()
      ? raw.preferredResolution.trim().slice(0, 40)
      : null;

  if (!imageModelId || !videoModelId) {
    return null;
  }

  const workflowRaw =
    raw.workflow && typeof raw.workflow === 'object' && !Array.isArray(raw.workflow)
      ? (raw.workflow as Record<string, unknown>)
      : null;
  const stageRaw =
    typeof (workflowRaw?.stage ?? raw.stage) === 'string'
      ? String(workflowRaw?.stage ?? raw.stage).trim().toLowerCase()
      : '';
  const stage: AutoProjectWorkflowStage | null =
    stageRaw === 'project_plan_review'
      ? 'project_plan_review'
      : stageRaw === 'outline_review'
      ? 'outline_review'
      : stageRaw === 'character_review'
        ? 'character_review'
        : stageRaw === 'project_setup_confirmation'
          ? 'project_setup_confirmation'
        : stageRaw === 'shot_review'
          ? 'shot_review'
          : null;

  const workflow: AutoProjectWorkflow | null =
    workflowRaw && stage
      ? {
          stage,
          progressLabel: normalizeAutoProjectShortText(workflowRaw.progressLabel, 160) || null,
          outlineTitle: normalizeAutoProjectShortText(workflowRaw.outlineTitle, 160) || null,
          outline: normalizeAutoProjectOutlineItems(workflowRaw.outline, []),
          characters: normalizeAutoProjectCharacters(workflowRaw.characters, []),
          imagePlans: normalizeAutoProjectImagePlans(workflowRaw.imagePlans, []),
          shots: normalizeAutoProjectShots(workflowRaw.shots, []),
          generationMode:
            workflowRaw.generationMode === 'all' || workflowRaw.generationMode === 'step'
              ? 'step'
              : null,
          generatedShotIds: normalizeAutoProjectStringList(workflowRaw.generatedShotIds, 24),
          skippedShotIds: normalizeAutoProjectStringList(workflowRaw.skippedShotIds, 24),
          proposedProjectName: normalizeAutoProjectShortText(
            workflowRaw.proposedProjectName ?? workflowRaw.projectName,
            160,
          ) || null,
          proposedProjectDescription: normalizeAutoProjectShortText(
            workflowRaw.proposedProjectDescription ?? workflowRaw.projectDescription,
            2000,
          ) || null,
          recommendedNextStage:
            workflowRaw.recommendedNextStage === 'project_plan_review'
              ? 'project_plan_review'
              : workflowRaw.recommendedNextStage === 'outline_review'
                ? 'outline_review'
                : workflowRaw.recommendedNextStage === 'character_review'
                  ? 'character_review'
                  : workflowRaw.recommendedNextStage === 'project_setup_confirmation'
                    ? 'project_setup_confirmation'
                    : workflowRaw.recommendedNextStage === 'shot_review'
                      ? 'shot_review'
                      : null,
        }
      : null;

  const normalizedWorkflow: AutoProjectWorkflow | null = workflow
    ? {
        ...workflow,
        generatedShotIds: workflow.generatedShotIds.filter((shotId) => workflow.shots.some((shot) => shot.id === shotId)),
        skippedShotIds: workflow.skippedShotIds.filter((shotId) => workflow.shots.some((shot) => shot.id === shotId)),
      }
    : null;

  return {
    projectId,
    projectName,
    imageModelId,
    videoModelId,
    preferredResolution,
    autoCreatedProject: raw.autoCreatedProject === true,
    createdTaskCount:
      typeof raw.createdTaskCount === 'number' && Number.isFinite(raw.createdTaskCount)
        ? Math.max(0, Math.trunc(raw.createdTaskCount))
        : 0,
    stage: normalizedWorkflow?.stage ?? stage,
    workflow: normalizedWorkflow,
  } satisfies AutoProjectAgentMetadata;
}
