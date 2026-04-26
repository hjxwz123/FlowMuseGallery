export const UserRole = {
  user: 'user',
  admin: 'admin',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  active: 'active',
  banned: 'banned',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const ApiChannelStatus = {
  active: 'active',
  disabled: 'disabled',
} as const;
export type ApiChannelStatus = (typeof ApiChannelStatus)[keyof typeof ApiChannelStatus];

export const AiModelType = {
  image: 'image',
  video: 'video',
  chat: 'chat',
} as const;
export type AiModelType = (typeof AiModelType)[keyof typeof AiModelType];

export const TaskStatus = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const ChatMessageRole = {
  user: 'user',
  assistant: 'assistant',
  system: 'system',
} as const;
export type ChatMessageRole = (typeof ChatMessageRole)[keyof typeof ChatMessageRole];

export const ProjectAssetKind = {
  image: 'image',
  video: 'video',
  document: 'document',
} as const;
export type ProjectAssetKind = (typeof ProjectAssetKind)[keyof typeof ProjectAssetKind];

export const ProjectAssetSource = {
  upload: 'upload',
  task: 'task',
} as const;
export type ProjectAssetSource = (typeof ProjectAssetSource)[keyof typeof ProjectAssetSource];

export const ProjectPromptType = {
  image: 'image',
  video: 'video',
} as const;
export type ProjectPromptType = (typeof ProjectPromptType)[keyof typeof ProjectPromptType];
