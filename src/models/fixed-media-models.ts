import defaultAiModelsJson from '../../prisma/default-ai-models.json';

export type FixedMediaModel = {
  id: number;
  name: string;
  modelKey: string;
  icon: string | null;
  type: 'image' | 'video';
  provider: string;
  channelId: number;
  defaultParams: Record<string, unknown> | null;
  paramConstraints: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
  supportsImageInput: boolean | null;
  supportsResolutionSelect: boolean | null;
  supportsSizeSelect: boolean | null;
  supportsQuickMode: boolean | null;
  supportsAgentMode: boolean | null;
  supportsAutoMode: boolean | null;
  maxContextRounds: number | null;
  systemPrompt: string | null;
};

export const FIXED_MEDIA_MODELS = defaultAiModelsJson as FixedMediaModel[];
export const FIXED_MEDIA_MODEL_ID_VALUES = FIXED_MEDIA_MODELS.map((item) => BigInt(item.id));
export const FIXED_MEDIA_MODEL_IDS = new Set(FIXED_MEDIA_MODEL_ID_VALUES.map((item) => item.toString()));

export function isFixedMediaModelId(id: bigint) {
  return FIXED_MEDIA_MODEL_IDS.has(id.toString());
}
