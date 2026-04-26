'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import { useRouter } from '@/lib/router'
import {
  ArrowRight,
  FolderKanban,
  FolderOpen,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { FadeIn } from '@/components/shared/FadeIn'
import { PageEmptyState } from '@/components/shared/PageEmptyState'
import { PageTransition } from '@/components/shared/PageTransition'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { projectsService } from '@/lib/api/services'
import type { ProjectQuotaSummary, ProjectSummary } from '@/lib/api/types/projects'
import { useAuth } from '@/lib/hooks/useAuth'

function formatProjectUpdatedAt(value: string, locale: string) {
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

export function ProjectsContent() {
  const t = useTranslations('projects')
  const locale = useLocale()
  const router = useRouter()
  const { isReady } = useAuth()

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectQuota, setProjectQuota] = useState<ProjectQuotaSummary | null>(null)
  const [projectsLoading, setProjectsLoading] = useState(true)

  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createConcept, setCreateConcept] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createMasterImagePrompt, setCreateMasterImagePrompt] = useState('')
  const [createFiles, setCreateFiles] = useState<File[]>([])
  const [creatingProject, setCreatingProject] = useState(false)
  const [generatingCreateDescription, setGeneratingCreateDescription] = useState(false)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectSummary | null>(null)

  const totalAssetCount = useMemo(
    () => projects.reduce((sum, project) => sum + project.assetCount, 0),
    [projects],
  )

  const updateProjectQuotaLocally = useCallback((delta: number) => {
    setProjectQuota((prev) => {
      if (!prev) return prev

      const nextCurrentCount = Math.max(0, prev.currentCount + delta)
      const nextRemainingCount =
        prev.maxCount === null || prev.remainingCount === null
          ? null
          : Math.max(0, prev.maxCount - nextCurrentCount)

      return {
        ...prev,
        currentCount: nextCurrentCount,
        remainingCount: nextRemainingCount,
      }
    })
  }, [])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const [projectsResult, quotaResult] = await Promise.allSettled([
        projectsService.getProjects(),
        projectsService.getProjectQuota(),
      ])

      if (projectsResult.status !== 'fulfilled') {
        throw projectsResult.reason
      }

      setProjects(projectsResult.value)

      if (quotaResult.status === 'fulfilled') {
        setProjectQuota(quotaResult.value)
      } else {
        setProjectQuota(null)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
      toast.error(t('errors.loadProjects'))
    } finally {
      setProjectsLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!isReady) return

    void loadProjects()
  }, [isReady, loadProjects])

  const handleCreateProject = async () => {
    const name = createName.trim()
    if (!name) {
      toast.error(t('validation.projectNameRequired'))
      return
    }

    setCreatingProject(true)
    try {
      const created = await projectsService.createProject({
        name,
        concept: createConcept.trim() || undefined,
        description: createDescription.trim() || undefined,
        masterImagePrompt: createMasterImagePrompt.trim() || undefined,
      })

      if (createFiles.length > 0) {
        try {
          await projectsService.uploadProjectAssets(created.id, 'document', createFiles)
        } catch (uploadError) {
          console.error('Failed to upload project files:', uploadError)
          toast.error(t('errors.uploadAssets'))
        }
      }

      setProjects((prev) => [created, ...prev])
      updateProjectQuotaLocally(1)
      closeCreateProjectModal()
      toast.success(t('messages.projectCreated'))
      router.push(`/${locale}/projects/${created.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
      toast.error(t('errors.createProject'))
    } finally {
      setCreatingProject(false)
    }
  }

  const closeCreateProjectModal = () => {
    setShowCreateProjectModal(false)
    setCreateName('')
    setCreateConcept('')
    setCreateDescription('')
    setCreateMasterImagePrompt('')
    setCreateFiles([])
  }

  const handleGenerateCreateDescription = async () => {
    const concept = createConcept.trim()
    const hasDocuments = createFiles.length > 0
    if (!concept && !hasDocuments) {
      toast.error(t('validation.projectDescriptionSourceRequired'))
      return
    }

    setGeneratingCreateDescription(true)
    try {
      const result = await projectsService.generateProjectDescription({
        name: createName.trim() || undefined,
        concept: concept || undefined,
        files: createFiles,
      })
      setCreateDescription(result.description)
      setCreateMasterImagePrompt(result.masterImagePrompt?.trim() || '')
      toast.success(t('messages.projectDescriptionGenerated'))
    } catch (error) {
      console.error('Failed to generate project description:', error)
      toast.error(t('errors.generateProjectDescription'))
    } finally {
      setGeneratingCreateDescription(false)
    }
  }

  const openDeleteProjectModal = (project: ProjectSummary) => {
    setProjectPendingDelete(project)
  }

  const closeDeleteProjectModal = () => {
    if (deletingProjectId) return
    setProjectPendingDelete(null)
  }

  const handleDeleteProject = async () => {
    const project = projectPendingDelete
    if (!project) return

    setDeletingProjectId(project.id)
    try {
      await projectsService.deleteProject(project.id)
      setProjects((prev) => prev.filter((item) => item.id !== project.id))
      updateProjectQuotaLocally(-1)
      setProjectPendingDelete(null)
      toast.success(t('messages.projectDeleted'))
    } catch (error) {
      console.error('Failed to delete project:', error)
      toast.error(t('errors.deleteProject'))
    } finally {
      setDeletingProjectId(null)
    }
  }

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas px-4 dark:bg-canvas-dark">
        <Card className="w-full max-w-sm border border-stone-200/80 bg-white/92 dark:border-stone-700 dark:bg-stone-900/92">
          <CardContent className="flex items-center justify-center gap-3 py-8 text-sm text-stone-500 dark:text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('states.loading')}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <PageTransition className="min-h-screen bg-transparent px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-6">
        <FadeIn variant="slide">
          <section className="mb-2 flex flex-col gap-4 md:mb-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <h1 className="text-3xl font-semibold tracking-tight text-stone-950 dark:text-white md:text-4xl">
                {t('title')}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('toolbar.projectCount', { count: projects.length })}
                </span>
                <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                  {t('toolbar.assetTotal', { count: totalAssetCount })}
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:justify-end">
              <Button onClick={() => setShowCreateProjectModal(true)} className="gap-2 px-5">
                <Plus className="h-4 w-4" />
                {t('createProject.action')}
              </Button>
              <Link
                href={`/${locale}/create`}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
              >
                {t('hero.toCreate')}
              </Link>
            </div>
          </section>
        </FadeIn>

        <FadeIn variant="slide" delay={0.08}>
          {projectsLoading ? (
            <section className="rounded-[30px] border border-stone-200/80 bg-white/92 px-6 py-14 shadow-sm dark:border-stone-700 dark:bg-stone-900/92">
              <div className="flex items-center gap-3 text-sm text-stone-500 dark:text-stone-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('states.loading')}
              </div>
            </section>
          ) : projects.length === 0 ? (
            <PageEmptyState
              icon={<FolderOpen className="h-7 w-7" />}
              title={t('projectList.empty')}
              description={t('projectList.emptyDescription')}
              action={
                <Button onClick={() => setShowCreateProjectModal(true)} className="gap-2 px-5">
                  <Plus className="h-4 w-4" />
                  {t('createProject.action')}
                </Button>
              }
            />
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                    {t('projectList.title')}
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => {
                  const coverPreviewUrl = project.coverThumbnailUrl
                  const coverAssetUrl = project.coverUrl
                  const hasVideoCover = project.coverKind === 'video' && Boolean(coverAssetUrl)
                  const hasImageCover = project.coverKind === 'image' && Boolean(coverPreviewUrl)
                  const isDeleting = deletingProjectId === project.id
                  return (
                    <article
                      key={project.id}
                      className="group relative overflow-hidden rounded-[30px] border border-stone-200 bg-white p-4 pt-6 shadow-[0_20px_55px_-36px_rgba(15,23,42,0.42)] transition-all duration-300 hover:-translate-y-1 hover:border-stone-300 hover:shadow-[0_30px_70px_-38px_rgba(15,23,42,0.5)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_24px_64px_-36px_rgba(2,6,23,0.9)] dark:hover:border-stone-600"
                    >
                        <Link
                          href={`/${locale}/projects/${project.id}`}
                          className="block min-w-0 rounded-[24px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aurora-purple/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                  {t('hero.badge')}
                                </span>
                                <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                  {t('projectList.assetCount', { count: project.assetCount })}
                                </span>
                                <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                  {t('inspiration.count', { count: project.inspirationCount })}
                                </span>
                                <span className="inline-flex rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                  {t('projectPrompt.count', { count: project.promptCount })}
                                </span>
                              </div>
                              <h2 className="truncate text-lg font-semibold text-stone-950 transition-colors group-hover:text-aurora-purple dark:text-white dark:group-hover:text-aurora-pink">
                                {project.name}
                              </h2>
                            </div>
                            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-stone-700 dark:group-hover:text-stone-200" />
                          </div>

                          <div className="mt-4 overflow-hidden rounded-[24px] border border-stone-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.92))] dark:border-stone-700 dark:bg-[linear-gradient(180deg,rgba(24,24,27,0.98),rgba(17,24,39,0.98))]">
                            {hasVideoCover ? (
                              <video
                                src={coverAssetUrl || undefined}
                                poster={coverPreviewUrl || undefined}
                                className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : hasImageCover ? (
                              <img
                                src={coverPreviewUrl || ''}
                                alt={project.name}
                                className="aspect-[16/10] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                              />
                            ) : (
                              <div className="flex aspect-[16/10] flex-col justify-between p-5">
                                <div className="flex items-center gap-2 text-xs font-medium text-stone-500 dark:text-stone-400">
                                  <FolderKanban className="h-4 w-4" />
                                  {t('projectList.cardHint')}
                                </div>
                                <FolderOpen className="h-16 w-16 text-stone-300 dark:text-stone-600" />
                              </div>
                            )}
                          </div>

                          <div className="mt-4 space-y-3">
                            <p className="line-clamp-2 min-h-[2.75rem] text-sm leading-6 text-stone-600 dark:text-stone-300">
                              {project.description || t('projectList.noDescription')}
                            </p>
                          </div>
                        </Link>

                        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-stone-500 dark:text-stone-400">
                          <span>{t('projectList.updatedAt', { date: formatProjectUpdatedAt(project.updatedAt, locale) })}</span>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/${locale}/projects/${project.id}`}
                              className="font-medium text-aurora-purple transition-colors hover:text-aurora-purple/80"
                            >
                              {t('projectList.open')}
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteProjectModal(project)}
                              isLoading={isDeleting}
                              className="gap-1.5 px-2.5 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                              {t('detail.delete')}
                            </Button>
                          </div>
                        </div>
                      </article>
                  )
                })}
              </div>
            </section>
          )}
        </FadeIn>
      </div>

      <Modal
        isOpen={showCreateProjectModal}
        onClose={closeCreateProjectModal}
        title={t('createProject.modalTitle')}
        size="md"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('createProject.nameLabel')}
            </label>
            <input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void handleCreateProject()
                }
              }}
              placeholder={t('createProject.namePlaceholder')}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              autoFocus
            />
          </div>

          <Textarea
            value={createConcept}
            onChange={(event) => setCreateConcept(event.target.value)}
            placeholder={t('createProject.conceptPlaceholder')}
            rows={4}
            label={t('createProject.conceptLabel')}
          />

          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
                {t('detail.descriptionLabel')}
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleGenerateCreateDescription()}
                isLoading={generatingCreateDescription}
                disabled={!createConcept.trim() && createFiles.length === 0}
                className="gap-2 self-start sm:self-auto"
              >
                <Sparkles className="h-4 w-4" />
                {t('createProject.generateDescription')}
              </Button>
            </div>
            <Textarea
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
              placeholder={t('createProject.descriptionPlaceholder')}
              rows={6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('createProject.filesLabel')}
            </label>
            <FileDropzone
              value={createFiles}
              onChange={setCreateFiles}
              maxFiles={10}
              maxSize={50}
              accept=".pdf,.docx,.doc,.txt,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
              description={t('createProject.filesHint')}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeCreateProjectModal}
              className="w-full rounded-lg px-4 py-2 font-ui text-sm text-stone-600 transition-colors hover:bg-stone-100 sm:w-auto dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {t('createProject.cancel')}
            </button>
            <Button
              type="button"
              onClick={() => void handleCreateProject()}
              disabled={creatingProject || !createName.trim()}
              isLoading={creatingProject}
              className="w-full sm:w-auto"
            >
              {t('createProject.action')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!projectPendingDelete}
        onClose={closeDeleteProjectModal}
        title={t('confirm.deleteProjectTitle')}
        size="sm"
      >
        <div className="space-y-5">
          <div className="rounded-[24px] border border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.96),rgba(254,226,226,0.92))] p-5 shadow-[0_18px_45px_-36px_rgba(220,38,38,0.5)] dark:border-red-500/30 dark:bg-[linear-gradient(180deg,rgba(69,10,10,0.72),rgba(38,10,10,0.92))]">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white shadow-sm">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium leading-6 text-stone-900 dark:text-stone-100">
                  {projectPendingDelete
                    ? t('confirm.deleteProjectDescription', {
                        name: projectPendingDelete.name,
                      })
                    : null}
                </p>
                <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">
                  {projectPendingDelete
                    ? t('confirm.deleteProjectMeta', {
                        assets: projectPendingDelete.assetCount,
                        inspirations: projectPendingDelete.inspirationCount,
                        prompts: projectPendingDelete.promptCount,
                      })
                    : null}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">
            {t('confirm.deleteProject')}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDeleteProjectModal}
              disabled={!!deletingProjectId}
              className="w-full sm:w-auto"
            >
              {t('createProject.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleDeleteProject()}
              isLoading={!!deletingProjectId}
              className="w-full bg-red-600 text-white shadow-[0_18px_40px_-24px_rgba(220,38,38,0.65)] hover:scale-[1.02] hover:bg-red-500 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400 sm:w-auto"
            >
              {t('confirm.deleteProjectAction')}
            </Button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  )
}
