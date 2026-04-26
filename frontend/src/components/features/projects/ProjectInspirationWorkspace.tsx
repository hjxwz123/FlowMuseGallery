'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import {
  Clapperboard,
  Copy,
  Loader2,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { projectsService } from '@/lib/api/services'
import type {
  CreateProjectInspirationDto,
  GenerateProjectInspirationPromptDto,
  ProjectInspiration,
  ProjectSummary,
  UpdateProjectInspirationDto,
} from '@/lib/api/types/projects'
import { cn } from '@/lib/utils/cn'

interface ProjectInspirationWorkspaceProps {
  project: ProjectSummary
  onRefreshProject?: () => Promise<void> | void
}

function formatInspirationDate(value: string, locale: string) {
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

function sortProjectInspirations(items: ProjectInspiration[]) {
  return [...items].sort((left, right) => {
    const leftEpisode = left.episodeNumber ?? Number.MAX_SAFE_INTEGER
    const rightEpisode = right.episodeNumber ?? Number.MAX_SAFE_INTEGER
    if (leftEpisode !== rightEpisode) return leftEpisode - rightEpisode
    return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  })
}

export function ProjectInspirationWorkspace({
  project,
  onRefreshProject,
}: ProjectInspirationWorkspaceProps) {
  const t = useTranslations('projects')
  const locale = useLocale()

  const [inspirations, setInspirations] = useState<ProjectInspiration[]>([])
  const [loading, setLoading] = useState(true)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingInspiration, setEditingInspiration] = useState<ProjectInspiration | null>(null)
  const [inspirationTitle, setInspirationTitle] = useState('')
  const [episodeNumberInput, setEpisodeNumberInput] = useState('')
  const [ideaText, setIdeaText] = useState('')
  const [contextText, setContextText] = useState('')
  const [plotText, setPlotText] = useState('')
  const [savingInspiration, setSavingInspiration] = useState(false)
  const [deletingInspirationId, setDeletingInspirationId] = useState<string | null>(null)
  const [inspirationPendingDelete, setInspirationPendingDelete] = useState<ProjectInspiration | null>(null)

  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [generateTarget, setGenerateTarget] = useState<ProjectInspiration | null>(null)
  const [includeProjectDescription, setIncludeProjectDescription] = useState(true)
  const [includePreviousInspirations, setIncludePreviousInspirations] = useState(true)
  const [includePreviousContextText, setIncludePreviousContextText] = useState(true)
  const [includePreviousPlotText, setIncludePreviousPlotText] = useState(true)
  const [generatingInspirationId, setGeneratingInspirationId] = useState<string | null>(null)

  const generatedCount = useMemo(
    () => inspirations.filter((item) => item.generatedPrompt.trim()).length,
    [inspirations]
  )

  const loadInspirations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await projectsService.getProjectInspirations(project.id)
      setInspirations(sortProjectInspirations(data))
    } catch (error) {
      console.error('Failed to load project inspirations:', error)
      toast.error(t('errors.loadInspirations'))
    } finally {
      setLoading(false)
    }
  }, [project.id, t])

  useEffect(() => {
    void loadInspirations()
  }, [loadInspirations])

  const resetEditForm = () => {
    setEditingInspiration(null)
    setInspirationTitle(t('inspiration.defaultTitle', { count: inspirations.length + 1 }))
    setEpisodeNumberInput('')
    setIdeaText('')
    setContextText('')
    setPlotText('')
  }

  const openCreateModal = () => {
    resetEditForm()
    setShowEditModal(true)
  }

  const openEditModal = (inspiration: ProjectInspiration) => {
    setEditingInspiration(inspiration)
    setInspirationTitle(inspiration.title)
    setEpisodeNumberInput(inspiration.episodeNumber ? String(inspiration.episodeNumber) : '')
    setIdeaText(inspiration.ideaText)
    setContextText(inspiration.contextText)
    setPlotText(inspiration.plotText)
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    resetEditForm()
    setShowEditModal(false)
  }

  const handleSaveInspiration = async () => {
    const title = inspirationTitle.trim()
    const idea = ideaText.trim()
    if (!title) {
      toast.error(t('validation.inspirationTitleRequired'))
      return
    }
    if (!idea) {
      toast.error(t('validation.inspirationIdeaRequired'))
      return
    }

    const trimmedEpisodeNumberInput = episodeNumberInput.trim()
    let normalizedEpisodeNumber: number | undefined
    if (trimmedEpisodeNumberInput) {
      const parsedEpisodeNumber = Number(trimmedEpisodeNumberInput)
      if (!Number.isInteger(parsedEpisodeNumber) || parsedEpisodeNumber < 1) {
        toast.error(t('validation.episodeNumberInvalid'))
        return
      }
      normalizedEpisodeNumber = parsedEpisodeNumber
    }
    const payload: CreateProjectInspirationDto | UpdateProjectInspirationDto = {
      title,
      ideaText: idea,
      contextText: contextText.trim() || undefined,
      plotText: plotText.trim() || undefined,
      episodeNumber: editingInspiration ? (normalizedEpisodeNumber ?? null) : normalizedEpisodeNumber,
    }

    setSavingInspiration(true)
    try {
      if (editingInspiration) {
        const updated = await projectsService.updateProjectInspiration(project.id, editingInspiration.id, payload)
        setInspirations((prev) => sortProjectInspirations(prev.map((item) => (item.id === updated.id ? updated : item))))
        toast.success(t('messages.inspirationUpdated'))
      } else {
        const created = await projectsService.createProjectInspiration(project.id, payload as CreateProjectInspirationDto)
        setInspirations((prev) => sortProjectInspirations([...prev, created]))
        toast.success(t('messages.inspirationCreated'))
      }
      closeEditModal()
      await onRefreshProject?.()
    } catch (error) {
      console.error('Failed to save inspiration:', error)
      toast.error(editingInspiration ? t('errors.updateInspiration') : t('errors.createInspiration'))
    } finally {
      setSavingInspiration(false)
    }
  }

  const openDeleteInspirationModal = (inspiration: ProjectInspiration) => {
    setInspirationPendingDelete(inspiration)
  }

  const closeDeleteInspirationModal = () => {
    if (deletingInspirationId) return
    setInspirationPendingDelete(null)
  }

  const handleDeleteInspiration = async () => {
    const inspiration = inspirationPendingDelete
    if (!inspiration) return

    setDeletingInspirationId(inspiration.id)
    try {
      await projectsService.deleteProjectInspiration(project.id, inspiration.id)
      setInspirations((prev) => prev.filter((item) => item.id !== inspiration.id))
      setInspirationPendingDelete(null)
      toast.success(t('messages.inspirationDeleted'))
      await onRefreshProject?.()
    } catch (error) {
      console.error('Failed to delete inspiration:', error)
      toast.error(t('errors.deleteInspiration'))
    } finally {
      setDeletingInspirationId(null)
    }
  }

  const openGenerateModal = (inspiration: ProjectInspiration) => {
    setGenerateTarget(inspiration)
    setIncludeProjectDescription(true)
    setIncludePreviousInspirations(true)
    setIncludePreviousContextText(true)
    setIncludePreviousPlotText(true)
    setShowGenerateModal(true)
  }

  const handleGeneratePrompt = async () => {
    if (!generateTarget) return

    const payload: GenerateProjectInspirationPromptDto = {
      includeProjectDescription,
      includePreviousInspirations,
      includePreviousContextText,
      includePreviousPlotText,
    }

    setGeneratingInspirationId(generateTarget.id)
    try {
      const updated = await projectsService.generateProjectInspirationPrompt(project.id, generateTarget.id, payload)
      setInspirations((prev) =>
        sortProjectInspirations(prev.map((item) => (item.id === updated.id ? updated : item)))
      )
      setShowGenerateModal(false)
      setGenerateTarget(null)
      toast.success(t('messages.promptGenerated'))
      await onRefreshProject?.()
    } catch (error) {
      console.error('Failed to generate inspiration prompt:', error)
      toast.error(t('errors.generateInspirationPrompt'))
    } finally {
      setGeneratingInspirationId(null)
    }
  }

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success(t('messages.promptCopied'))
    } catch (error) {
      console.error('Failed to copy prompt:', error)
      toast.error(t('errors.copyPrompt'))
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
                  <Clapperboard className="h-3.5 w-3.5" />
                  {t('inspiration.badge')}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('inspiration.count', { count: inspirations.length })}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('inspiration.generatedCount', { count: generatedCount })}
                </span>
              </div>
              <div>
                <p className="text-lg font-semibold text-stone-950 dark:text-white">
                  {t('inspiration.title')}
                </p>
                <p className="max-w-3xl text-sm leading-6 text-stone-500 dark:text-stone-400">
                  {t('inspiration.subtitle')}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={openCreateModal} className="gap-2 px-5">
                <Plus className="h-4 w-4" />
                {t('inspiration.create')}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('states.loading')}
            </div>
          ) : inspirations.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-14 text-center dark:border-stone-700 dark:bg-stone-800/50">
              <Sparkles className="mx-auto mb-4 h-12 w-12 text-stone-400 dark:text-stone-500" />
              <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                {t('inspiration.emptyTitle')}
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-500 dark:text-stone-400">
                {t('inspiration.emptyDescription')}
              </p>
              <div className="mt-6">
                <Button type="button" onClick={openCreateModal} className="gap-2 px-5">
                  <Plus className="h-4 w-4" />
                  {t('inspiration.create')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {inspirations.map((inspiration) => {
                const isDeleting = deletingInspirationId === inspiration.id
                const isGenerating = generatingInspirationId === inspiration.id
                return (
                  <article
                    key={inspiration.id}
                    className="rounded-[28px] border border-stone-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-[0_16px_44px_-34px_rgba(15,23,42,0.34)] dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(17,24,39,0.98))] dark:shadow-[0_18px_48px_-34px_rgba(2,6,23,0.82)]"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {inspiration.episodeNumber ? (
                              <span className="inline-flex rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                                {t('inspiration.episode', { number: inspiration.episodeNumber })}
                              </span>
                            ) : null}
                            <span className="inline-flex rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                              {t('inspiration.updatedAt', {
                                date: formatInspirationDate(inspiration.updatedAt, locale),
                              })}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-stone-950 dark:text-white">
                            {inspiration.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(inspiration)}
                            className="gap-1.5 px-2.5"
                          >
                            <PencilLine className="h-4 w-4" />
                            {t('inspiration.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteInspirationModal(inspiration)}
                            isLoading={isDeleting}
                            className="gap-1.5 px-2.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('inspiration.delete')}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="rounded-2xl border border-stone-200 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-900/70">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                            {t('inspiration.fields.idea')}
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">
                            {inspiration.ideaText}
                          </p>
                        </div>

                        {inspiration.contextText ? (
                          <div className="rounded-2xl border border-stone-200 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-900/70">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                              {t('inspiration.fields.context')}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">
                              {inspiration.contextText}
                            </p>
                          </div>
                        ) : null}

                        {inspiration.plotText ? (
                          <div className="rounded-2xl border border-stone-200 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-900/70">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                              {t('inspiration.fields.plot')}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">
                              {inspiration.plotText}
                            </p>
                          </div>
                        ) : null}

                        <div
                          className={cn(
                            'rounded-2xl border p-4',
                            inspiration.generatedPrompt
                              ? 'border-aurora-purple/25 bg-aurora-purple/5'
                              : 'border-dashed border-stone-300 bg-stone-50/80 dark:border-stone-700 dark:bg-stone-800/50'
                          )}
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
                                {t('inspiration.generatedPromptTitle')}
                              </p>
                              <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                                {t('inspiration.generatedPromptHint')}
                              </p>
                            </div>
                            {inspiration.generatedPrompt ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleCopyPrompt(inspiration.generatedPrompt)}
                                className="gap-1.5"
                              >
                                <Copy className="h-4 w-4" />
                                {t('inspiration.copyPrompt')}
                              </Button>
                            ) : null}
                          </div>

                          {inspiration.generatedPrompt ? (
                            <div className="max-h-72 overflow-y-auto rounded-2xl border border-stone-200 bg-white/90 p-4 dark:border-stone-700 dark:bg-stone-950/85">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-stone-800 dark:text-stone-100">
                                {inspiration.generatedPrompt}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-stone-500 dark:text-stone-400">
                              {t('inspiration.generatedPromptEmpty')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => openGenerateModal(inspiration)}
                          isLoading={isGenerating}
                          className="gap-2"
                        >
                          <Sparkles className="h-4 w-4" />
                          {t('inspiration.generatePrompt')}
                        </Button>
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
        title={editingInspiration ? t('inspiration.editModalTitle') : t('inspiration.createModalTitle')}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                {t('inspiration.fields.title')}
              </label>
              <input
                value={inspirationTitle}
                onChange={(event) => setInspirationTitle(event.target.value)}
                placeholder={t('inspiration.titlePlaceholder')}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                {t('inspiration.fields.episode')}
              </label>
              <input
                type="number"
                min="1"
                value={episodeNumberInput}
                onChange={(event) => setEpisodeNumberInput(event.target.value)}
                placeholder={t('inspiration.episodePlaceholder')}
                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
          </div>

          <Textarea
            value={ideaText}
            onChange={(event) => setIdeaText(event.target.value)}
            rows={5}
            label={t('inspiration.fields.idea')}
            placeholder={t('inspiration.ideaPlaceholder')}
          />

          <Textarea
            value={contextText}
            onChange={(event) => setContextText(event.target.value)}
            rows={4}
            label={t('inspiration.fields.context')}
            placeholder={t('inspiration.contextPlaceholder')}
          />

          <Textarea
            value={plotText}
            onChange={(event) => setPlotText(event.target.value)}
            rows={4}
            label={t('inspiration.fields.plot')}
            placeholder={t('inspiration.plotPlaceholder')}
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
              onClick={() => void handleSaveInspiration()}
              isLoading={savingInspiration}
              className="w-full gap-2 sm:w-auto"
            >
              {editingInspiration ? t('inspiration.save') : t('inspiration.create')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!inspirationPendingDelete}
        onClose={closeDeleteInspirationModal}
        title={t('confirm.deleteInspirationTitle')}
        size="sm"
      >
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-[28px] border border-red-200 bg-[linear-gradient(180deg,rgba(255,245,245,0.98),rgba(254,226,226,0.94))] shadow-[0_24px_60px_-40px_rgba(220,38,38,0.58)] dark:border-red-500/30 dark:bg-[linear-gradient(180deg,rgba(69,10,10,0.84),rgba(28,10,10,0.96))] dark:shadow-[0_28px_68px_-42px_rgba(248,113,113,0.34)]">
            <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.28),transparent_70%)] dark:bg-[radial-gradient(circle_at_top,rgba(248,113,113,0.18),transparent_72%)]" />

            <div className="relative space-y-4 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-red-500 text-white shadow-[0_16px_34px_-20px_rgba(220,38,38,0.75)]">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <p className="text-base font-semibold leading-7 text-stone-950 dark:text-red-50">
                    {inspirationPendingDelete
                      ? t('confirm.deleteInspirationDescription', {
                          name: inspirationPendingDelete.title,
                        })
                      : null}
                  </p>
                  <p className="text-sm leading-6 text-stone-700 dark:text-red-100/80">
                    {t('confirm.deleteInspirationMeta')}
                  </p>
                </div>
              </div>

              {inspirationPendingDelete ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    inspirationPendingDelete.episodeNumber
                      ? t('confirm.deleteInspirationEpisode', {
                          number: inspirationPendingDelete.episodeNumber,
                        })
                      : null,
                    inspirationPendingDelete.generatedPrompt.trim()
                      ? t('confirm.deleteInspirationHasPrompt')
                      : t('confirm.deleteInspirationNoPrompt'),
                    t('inspiration.updatedAt', {
                      date: formatInspirationDate(inspirationPendingDelete.updatedAt, locale),
                    }),
                  ]
                    .filter((value): value is string => Boolean(value))
                    .map((badge) => (
                      <span
                        key={badge}
                        className="inline-flex items-center rounded-full border border-red-200/90 bg-white/78 px-3 py-1 text-xs font-medium text-red-700 shadow-sm backdrop-blur-sm dark:border-red-400/25 dark:bg-red-950/40 dark:text-red-100/85"
                      >
                        {badge}
                      </span>
                    ))}
                </div>
              ) : null}
            </div>
          </div>

          <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
            {t('confirm.deleteInspirationHint')}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDeleteInspirationModal}
              disabled={!!deletingInspirationId}
              className="w-full sm:w-auto"
            >
              {t('createProject.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleDeleteInspiration()}
              isLoading={!!deletingInspirationId}
              className="w-full bg-red-600 text-white shadow-[0_20px_42px_-26px_rgba(220,38,38,0.72)] hover:scale-[1.02] hover:bg-red-500 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400 sm:w-auto"
            >
              {t('confirm.deleteInspirationAction')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showGenerateModal}
        onClose={() => {
          setShowGenerateModal(false)
          setGenerateTarget(null)
        }}
        title={t('inspiration.generateModalTitle')}
        size="lg"
      >
        <div className="space-y-5">
          {generateTarget ? (
            <div className="rounded-[24px] border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-800/60">
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {generateTarget.title}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600 dark:text-stone-300">
                {generateTarget.ideaText}
              </p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-[24px] border border-stone-200 bg-white/80 p-4 dark:border-stone-700 dark:bg-stone-900/70">
            <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {t('inspiration.generateOptionsTitle')}
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {t('inspiration.generateOptionsHint')}
            </p>

            {[
              {
                checked: includeProjectDescription,
                onChange: setIncludeProjectDescription,
                label: t('inspiration.generateOptions.includeProjectDescription'),
              },
              {
                checked: includePreviousInspirations,
                onChange: setIncludePreviousInspirations,
                label: t('inspiration.generateOptions.includePreviousInspirations'),
              },
              {
                checked: includePreviousContextText,
                onChange: setIncludePreviousContextText,
                label: t('inspiration.generateOptions.includePreviousContextText'),
              },
              {
                checked: includePreviousPlotText,
                onChange: setIncludePreviousPlotText,
                label: t('inspiration.generateOptions.includePreviousPlotText'),
              },
            ].map((option) => (
              <label
                key={option.label}
                className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-200"
              >
                <input
                  type="checkbox"
                  checked={option.checked}
                  onChange={(event) => option.onChange(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-aurora-purple focus:ring-aurora-purple/20 dark:border-stone-600 dark:bg-stone-900"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <div className="rounded-[24px] border border-dashed border-stone-300 bg-stone-50/80 p-4 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400">
            {t('inspiration.generateModelHint')}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setShowGenerateModal(false)
                setGenerateTarget(null)
              }}
              className="w-full rounded-lg px-4 py-2 font-ui text-sm text-stone-600 transition-colors hover:bg-stone-100 sm:w-auto dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {t('createProject.cancel')}
            </button>
            <Button
              type="button"
              onClick={() => void handleGeneratePrompt()}
              isLoading={Boolean(generateTarget && generatingInspirationId === generateTarget.id)}
              className="w-full gap-2 sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              {t('inspiration.generatePrompt')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
