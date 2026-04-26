/**
 * 可同时用于服务端和客户端的 locale 常量
 */

export const locales = ['zh-CN', 'en-US'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'zh-CN'
