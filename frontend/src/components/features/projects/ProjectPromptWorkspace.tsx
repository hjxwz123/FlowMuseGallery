'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import {
  Copy,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  Trash2,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { projectsService } from '@/lib/api/services'
import type {
  CreateProjectPromptDto,
  ProjectPrompt,
  ProjectPromptType,
  ProjectSummary,
  UpdateProjectPromptDto,
} from '@/lib/api/types/projects'
import { cn } from '@/lib/utils/cn'

type PromptFilter = 'all' | ProjectPromptType

interface ProjectPromptWorkspaceProps {
  project: ProjectSummary
  onRefreshProject?: () => Promise<void> | void
}

function formatPromptDate(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function sortProjectPrompts(items: ProjectPrompt[]) {
  return [...items].sort((left, right) => {
    const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    if (updatedDiff !== 0) return updatedDiff
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  })
}

export function ProjectPromptWorkspace({
  project,
  onRefreshProject,
}: ProjectPromptWorkspaceProps) {
  const t = useTranslations('projects')
  const locale = useLocale()

  const [prompts, setPrompts] = useState<ProjectPrompt[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PromptFilter>('all')

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<ProjectPrompt | null>(null)
  const [promptType, setPromptType] = useState<ProjectPromptType>('image')
  const [promptTitle, setPromptTitle] = useState('')
  const [promptBody, setPromptBody] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null)

  const imagePromptCount = useMemo(
    () => prompts.filter((item) => item.type === 'image').length,
    [prompts]
  )
  const videoPromptCount = useMemo(
    () => prompts.filter((item) => item.type === 'video').length,
    [prompts]
  )

  const filteredPrompts = useMemo(() => {
    if (filter === 'all') return prompts
    return prompts.filter((item) => item.type === filter)
  }, [filter, prompts])

  const loadPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await projectsService.getProjectPrompts(project.id)
      setPrompts(sortProjectPrompts(data))
    } catch (error) {
      console.error('Failed to load project prompts:', error)
      toast.error(t('errors.loadProjectPrompts'))
    } finally {
      setLoading(false)
    }
  }, [project.id, t])

  useEffect(() => {
    void loadPrompts()
  }, [loadPrompts])

  const resetEditForm = (nextType: ProjectPromptType = 'image') => {
    setEditingPrompt(null)
    setPromptType(nextType)
    setPromptTitle('')
    setPromptBody('')
  }

  const openCreateModal = (nextType: ProjectPromptType = 'image') => {
    resetEditForm(nextType)
    setShowEditModal(true)
  }

  const openEditModal = (prompt: ProjectPrompt) => {
    setEditingPrompt(prompt)
    setPromptType(prompt.type)
    setPromptTitle(prompt.title)
    setPromptBody(prompt.prompt)
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    resetEditForm()
    setShowEditModal(false)
  }

  const handleSavePrompt = async () => {
    const title = promptTitle.trim()
    const prompt = promptBody.trim()

    if (!title) {
      toast.error(t('validation.promptTitleRequired'))
      return
    }

    if (!prompt) {
      toast.error(t('validation.promptBodyRequired'))
      return
    }

    const payload: CreateProjectPromptDto | UpdateProjectPromptDto = {
      type: promptType,
      title,
      prompt,
    }

    setSavingPrompt(true)
    try {
      if (editingPrompt) {
        const updated = await projectsService.updateProjectPrompt(project.id, editingPrompt.id, payload)
        setPrompts((prev) => sortProjectPrompts(prev.map((item) => (item.id === updated.id ? updated : item))))
        toast.success(t('messages.projectPromptUpdated'))
      } else {
        const created = await projectsService.createProjectPrompt(project.id, payload as CreateProjectPromptDto)
        setPrompts((prev) => sortProjectPrompts([created, ...prev]))
        toast.success(t('messages.projectPromptCreated'))
      }
      closeEditModal()
      await onRefreshProject?.()
    } catch (error) {
      console.error('Failed to save project prompt:', error)
      toast.error(editingPrompt ? t('errors.updateProjectPrompt') : t('errors.createProjectPrompt'))
    } finally {
      setSavingPrompt(false)
    }
  }

  const handleDeletePrompt = async (prompt: ProjectPrompt) => {
    if (!window.confirm(t('confirm.deleteProjectPrompt'))) return

    setDeletingPromptId(prompt.id)
    try {
      await projectsService.deleteProjectPrompt(project.id, prompt.id)
      setPrompts((prev) => prev.filter((item) => item.id !== prompt.id))
      toast.success(t('messages.projectPromptDeleted'))
      await onRefreshProject?.()
    } catch (error) {
      console.error('Failed to delete project prompt:', error)
      toast.error(t('errors.deleteProjectPrompt'))
    } finally {
      setDeletingPromptId(null)
    }
  }

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success(t('messages.projectPromptCopied'))
    } catch (error) {
      console.error('Failed to copy project prompt:', error)
      toast.error(t('errors.copyProjectPrompt'))
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.44)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_28px_74px_-40px_rgba(2,6,23,0.92)]">
        <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-700">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  <Copy className="h-3.5 w-3.5" />
                  {t('projectPrompt.badge')}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('projectPrompt.count', { count: prompts.length })}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('projectPrompt.imageCount', { count: imagePromptCount })}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('projectPrompt.videoCount', { count: videoPromptCount })}
                </span>
              </div>
              <div>
                <p className="text-lg font-semibold text-stone-950 dark:text-white">
                  {t('projectPrompt.title')}
                </p>
                <p className="max-w-3xl text-sm leading-6 text-stone-500 dark:text-stone-400">
                  {t('projectPrompt.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => openCreateModal('image')} className="gap-2 px-5">
                <ImageIcon className="h-4 w-4" />
                {t('projectPrompt.createImage')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => openCreateModal('video')} className="gap-2 px-5">
                <Video className="h-4 w-4" />
                {t('projectPrompt.createVideo')}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {([
              { value: 'all', label: t('projectPrompt.filterAll') },
              { value: 'image', label: t('projectPrompt.filterImage') },
              { value: 'video', label: t('projectPrompt.filterVideo') },
            ] as Array<{ value: PromptFilter; label: string }>).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === option.value
                    ? 'border-aurora-purple bg-aurora-purple text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-white'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('states.loading')}
            </div>
          ) : prompts.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-14 text-center dark:border-stone-700 dark:bg-stone-800/50">
              <Copy className="mx-auto mb-4 h-12 w-12 text-stone-400 dark:text-stone-500" />
              <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                {t('projectPrompt.emptyTitle')}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
                {t('projectPrompt.emptyDescription')}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Button type="button" onClick={() => openCreateModal('image')} className="gap-2 px-5">
                  <ImageIcon className="h-4 w-4" />
                  {t('projectPrompt.createImage')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => openCreateModal('video')} className="gap-2 px-5">
                  <Video className="h-4 w-4" />
                  {t('projectPrompt.createVideo')}
                </Button>
              </div>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-14 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400">
              {t('projectPrompt.filteredEmpty')}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredPrompts.map((item) => {
                const isDeleting = deletingPromptId === item.id
                return (
                  <article
                    key={item.id}
                    className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-[0_16px_44px_-34px_rgba(15,23,42,0.34)] dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(17,24,39,0.98))] dark:shadow-[0_18px_48px_-34px_rgba(2,6,23,0.82)]"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                item.type === 'video'
                                  ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
                              )}
                            >
                              {item.type === 'video' ? t('projectPrompt.typeVideo') : t('projectPrompt.typeImage')}
                            </span>
                            <span className="inline-flex rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                              {t('projectPrompt.updatedAt', {
                                date: formatPromptDate(item.updatedAt, locale),
                              })}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-stone-950 dark:text-white">
                            {item.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCopyPrompt(item.prompt)}
                            className="gap-1.5 px-2.5"
                          >
                            <Copy className="h-4 w-4" />
                            {t('projectPrompt.copy')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(item)}
                            className="gap-1.5 px-2.5"
                          >
                            <PencilLine className="h-4 w-4" />
                            {t('projectPrompt.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDeletePrompt(item)}
                            isLoading={isDeleting}
                            className="gap-1.5 px-2.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('projectPrompt.delete')}
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto rounded-2xl border border-stone-200 bg-white/85 p-4 dark:border-stone-700 dark:bg-stone-950/80">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800 dark:text-stone-100">
                          {item.prompt}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={showEditModal}
        onClose={closeEditModal}
        title={editingPrompt ? t('projectPrompt.editModalTitle') : t('projectPrompt.createModalTitle')}
        size="lg"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('projectPrompt.typeLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'image', label: t('projectPrompt.typeImage') },
                { value: 'video', label: t('projectPrompt.typeVideo') },
              ] as Array<{ value: ProjectPromptType; label: string }>).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPromptType(option.value)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    promptType === option.value
                      ? 'border-aurora-purple bg-aurora-purple text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:text-white'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('projectPrompt.fields.title')}
            </label>
            <input
              value={promptTitle}
              onChange={(event) => setPromptTitle(event.target.value)}
              placeholder={t('projectPrompt.titlePlaceholder')}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>

          <Textarea
            value={promptBody}
            onChange={(event) => setPromptBody(event.target.value)}
            rows={10}
            label={t('projectPrompt.fields.prompt')}
            placeholder={t('projectPrompt.promptPlaceholder')}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEditModal}
              className="w-full rounded-lg px-4 py-2 font-ui text-sm text-stone-600 transition-colors hover:bg-stone-100 sm:w-auto dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {t('createProject.cancel')}
            </button>
            <Button
              type="button"
              onClick={() => void handleSavePrompt()}
              isLoading={savingPrompt}
              className="w-full gap-2 sm:w-auto"
            >
              {editingPrompt ? t('projectPrompt.save') : t('projectPrompt.create')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
