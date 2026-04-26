/**
 * 提示词类型定义
 */

export interface Prompt {
  title: string
  preview: string
  reference_image_urls?: string[]
  prompt: string
  author: string
  link: string
  mode: 'edit' | 'generate'
  category: string
  sub_category: string
  created: string
}

export type ModeFilter = 'all' | 'edit' | 'generate'
