import { Prisma } from '@prisma/client';
import { asSqliteJsonRecord } from './sqlite-json.util';

export type AutoProjectTaskAssetMetadata = {
  planId?: string | null;
  title: string;
  description?: string | null;
  sourcePrompt?: string | null;
  referenceLabels?: string[];
  referenceAssetIds?: string[];
  referenceCharacterIds?: string[];
  workflowStage?: string | null;
  shotId?: string | null;
  finalStoryboard?: boolean;
};

function asJsonObject(value: unknown) {
  return asSqliteJsonRecord(value);
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text ? text.slice(0, maxLength) : '';
}

function normalizeStringArray(value: unknown, maxItems: number, maxItemLength: number) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeString(item, maxItemLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

export function mergeTaskProviderData(
  current: unknown,
  incoming: unknown,
) {
  const merged: Record<string, unknown> = {};
  const currentObject = asJsonObject(current);
  const incomingObject = asJsonObject(incoming);

  if (currentObject) Object.assign(merged, currentObject);
  if (incomingObject) Object.assign(merged, incomingObject);

  return Object.keys(merged).length > 0 ? (merged as Prisma.InputJsonValue) : undefined;
}

export function attachAutoProjectAssetMetadata(
  current: unknown,
  metadata: AutoProjectTaskAssetMetadata,
) {
  const merged = {
    ...(asJsonObject(current) ?? {}),
    autoProjectAsset: {
      planId: normalizeString(metadata.planId, 120) || null,
      title: normalizeString(metadata.title, 255),
      description: normalizeString(metadata.description, 5000) || null,
      sourcePrompt: normalizeString(metadata.sourcePrompt, 12000) || null,
      referenceLabels: normalizeStringArray(metadata.referenceLabels, 24, 80),
      referenceAssetIds: normalizeStringArray(metadata.referenceAssetIds, 24, 120),
      referenceCharacterIds: normalizeStringArray(metadata.referenceCharacterIds, 24, 120),
      workflowStage: normalizeString(metadata.workflowStage, 40) || null,
      shotId: normalizeString(metadata.shotId, 120) || null,
      finalStoryboard: metadata.finalStoryboard === true,
    },
  };

  return merged as Prisma.InputJsonValue;
}

export function buildAutoProjectTaskColumnData(metadata: AutoProjectTaskAssetMetadata) {
  return {
    autoProjectShotId: normalizeString(metadata.shotId, 120) || null,
    autoProjectWorkflowStage: normalizeString(metadata.workflowStage, 40) || null,
    autoProjectFinalStoryboard:
      metadata.finalStoryboard === true
        ? true
        : metadata.finalStoryboard === false
          ? false
          : null,
  };
}

export function extractAutoProjectAssetMetadata(providerData: unknown) {
  const providerObject = asJsonObject(providerData);
  const raw = asJsonObject(providerObject?.autoProjectAsset);
  if (!raw) return null;

  const title = normalizeString(raw.title, 255);
  if (!title) return null;

  return {
    planId: normalizeString(raw.planId, 120) || null,
    title,
    description: normalizeString(raw.description, 5000) || null,
    sourcePrompt: normalizeString(raw.sourcePrompt, 12000) || null,
    referenceLabels: normalizeStringArray(raw.referenceLabels, 24, 80),
    referenceAssetIds: normalizeStringArray(raw.referenceAssetIds, 24, 120),
    referenceCharacterIds: normalizeStringArray(raw.referenceCharacterIds, 24, 120),
    workflowStage: normalizeString(raw.workflowStage, 40) || null,
    shotId: normalizeString(raw.shotId, 120) || null,
    finalStoryboard: raw.finalStoryboard === true,
  } satisfies AutoProjectTaskAssetMetadata;
}
