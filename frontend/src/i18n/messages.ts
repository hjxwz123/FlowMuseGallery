import canvasEn from './locales/en-US/canvas.json'
import chatEn from './locales/en-US/chat.json'
import commonEn from './locales/en-US/common.json'
import createEn from './locales/en-US/create.json'
import errorsEn from './locales/en-US/errors.json'
import galleryEn from './locales/en-US/gallery.json'
import navEn from './locales/en-US/nav.json'
import projectsEn from './locales/en-US/projects.json'
import promptsEn from './locales/en-US/prompts.json'
import settingsEn from './locales/en-US/settings.json'
import tasksEn from './locales/en-US/tasks.json'
import templatesEn from './locales/en-US/templates.json'
import canvasZh from './locales/zh-CN/canvas.json'
import chatZh from './locales/zh-CN/chat.json'
import commonZh from './locales/zh-CN/common.json'
import createZh from './locales/zh-CN/create.json'
import errorsZh from './locales/zh-CN/errors.json'
import galleryZh from './locales/zh-CN/gallery.json'
import navZh from './locales/zh-CN/nav.json'
import projectsZh from './locales/zh-CN/projects.json'
import promptsZh from './locales/zh-CN/prompts.json'
import settingsZh from './locales/zh-CN/settings.json'
import tasksZh from './locales/zh-CN/tasks.json'
import templatesZh from './locales/zh-CN/templates.json'
import type { Locale } from './locales'

export type Messages = Record<string, unknown>

export const messagesByLocale: Record<Locale, Messages> = {
  'zh-CN': {
    canvas: canvasZh,
    chat: chatZh,
    common: commonZh,
    create: createZh,
    errors: errorsZh,
    gallery: galleryZh,
    nav: navZh,
    projects: projectsZh,
    prompts: promptsZh,
    settings: settingsZh,
    tasks: tasksZh,
    templates: templatesZh,
  },
  'en-US': {
    canvas: canvasEn,
    chat: chatEn,
    common: commonEn,
    create: createEn,
    errors: errorsEn,
    gallery: galleryEn,
    nav: navEn,
    projects: projectsEn,
    prompts: promptsEn,
    settings: settingsEn,
    tasks: tasksEn,
    templates: templatesEn,
  },
}
