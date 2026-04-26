'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from '@/i18n/client'
import Link from '@/lib/compat/link'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'

import { FadeIn } from '@/components/shared/FadeIn'
import { PageTransition } from '@/components/shared/PageTransition'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { FileDropzone } from '@/components/ui/FileDropzone'
import { ImageDropzone } from '@/components/ui/ImageDropzone'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { projectsService } from '@/lib/api/services'
import type {
  ImportableWork,
  ProjectAsset,
  ProjectAssetKind,
  ProjectSummary,
} from '@/lib/api/types/projects'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils/cn'
import { ProjectInspirationWorkspace } from './ProjectInspirationWorkspace'
import { ProjectPromptWorkspace } from './ProjectPromptWorkspace'

type AssetFilter = 'all' | 'image' | 'video' | 'document'

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return null
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function getDocumentExt(asset: { fileName?: string | null; url: string; mimeType?: string | null }) {
  const name = (asset.fileName || asset.url || '').toLowerCase()
  const match = name.match(/\.([a-z0-9]+)(?:\?|$)/i)
  if (match) return match[1]
  const mime = (asset.mimeType || '').toLowerCase()
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('plain')) return 'txt'
  if (mime.includes('wordprocessingml')) return 'docx'
  if (mime.includes('presentationml')) return 'pptx'
  return ''
}

function DocumentPreview({ asset }: { asset: ProjectAsset }) {
  const ext = getDocumentExt(asset)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(false)

  useEffect(() => {
    if (ext !== 'txt') return
    let cancelled = false
    setTextLoading(true)
    setTextError(false)
    fetch(asset.url)
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.text()
      })
      .then((content) => {
        if (!cancelled) setTextContent(content)
      })
      .catch(() => {
        if (!cancelled) setTextError(true)
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [asset.url, ext])

  if (ext === 'pdf') {
    return (
      <iframe
        src={asset.url}
        title={asset.title}
        className="aspect-[16/10] w-full bg-stone-100 dark:bg-stone-800"
      />
    )
  }

  if (ext === 'txt') {
    return (
      <div className="aspect-[16/10] w-full overflow-auto bg-stone-50 p-3 text-xs leading-5 text-stone-800 dark:bg-stone-900 dark:text-stone-200">
        {textLoading ? (
          <div className="flex h-full items-center justify-center text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : textError ? (
          <div className="flex h-full items-center justify-center text-stone-400">—</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono">{textContent}</pre>
        )}
      </div>
    )
  }

  return (
    <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 bg-stone-50 text-stone-500 dark:bg-stone-900 dark:text-stone-400">
      <FileText className="h-12 w-12" />
      <p className="px-4 text-center text-xs font-medium">
        {(asset.fileName || asset.title || '').slice(0, 80)}
      </p>
      {ext ? (
        <span className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider dark:border-stone-600 dark:bg-stone-800">
          {ext}
        </span>
      ) : null}
    </div>
  )
}

function formatDisplayDate(value: string, locale: string) {
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

export interface ProjectDetailContentProps {
  projectId: string
}

export function ProjectDetailContent({ projectId }: ProjectDetailContentProps) {
  const t = useTranslations('projects')
  const locale = useLocale()
  const { isReady } = useAuth()

  const [project, setProject] = useState<ProjectSummary | null>(null)
  const [projectLoading, setProjectLoading] = useState(true)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)

  const [editName, setEditName] = useState('')
  const [editConcept, setEditConcept] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editMasterImagePrompt, setEditMasterImagePrompt] = useState('')
  const [savingProject, setSavingProject] = useState(false)
  const [generatingProjectDescription, setGeneratingProjectDescription] = useState(false)

  const [showEditProjectModal, setShowEditProjectModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  const [uploadKind, setUploadKind] = useState<ProjectAssetKind>('image')
  const [uploadImages, setUploadImages] = useState<File[]>([])
  const [uploadVideos, setUploadVideos] = useState<File[]>([])
  const [uploadDocuments, setUploadDocuments] = useState<File[]>([])
  const [uploadingAssets, setUploadingAssets] = useState(false)

  const [importType, setImportType] = useState<'image' | 'video'>('image')
  const [importQuery, setImportQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [importableWorks, setImportableWorks] = useState<ImportableWork[]>([])
  const [importPage, setImportPage] = useState(1)
  const [importHasMore, setImportHasMore] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importLoadingMore, setImportLoadingMore] = useState(false)
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([])
  const [importingAssets, setImportingAssets] = useState(false)

  const [assetTitleDrafts, setAssetTitleDrafts] = useState<Record<string, string>>({})
  const [assetDescriptionDrafts, setAssetDescriptionDrafts] = useState<Record<string, string>>({})
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [assetPendingDelete, setAssetPendingDelete] = useState<ProjectAsset | null>(null)
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('all')
  const [assetQuery, setAssetQuery] = useState('')

  const currentUploadFiles =
    uploadKind === 'image' ? uploadImages : uploadKind === 'video' ? uploadVideos : uploadDocuments

  const imageAssetCount = useMemo(
    () => assets.filter((asset) => asset.kind === 'image').length,
    [assets]
  )
  const videoAssetCount = useMemo(
    () => assets.filter((asset) => asset.kind === 'video').length,
    [assets]
  )
  const documentAssetCount = useMemo(
    () => assets.filter((asset) => asset.kind === 'document').length,
    [assets]
  )
  const importedAssetCount = useMemo(
    () => assets.filter((asset) => asset.source === 'task').length,
    [assets]
  )
  const uploadedAssetCount = useMemo(
    () => assets.filter((asset) => asset.source === 'upload').length,
    [assets]
  )

  const filteredAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase()

    return [...assets]
      .sort((left, right) => {
        const leftTime = new Date(left.updatedAt).getTime()
        const rightTime = new Date(right.updatedAt).getTime()
        return rightTime - leftTime
      })
      .filter((asset) => {
        if (assetFilter !== 'all' && asset.kind !== assetFilter) return false
        if (!query) return true

        const haystack = [asset.title, asset.description || '', asset.sourcePrompt || '', asset.fileName || '']
          .join(' ')
          .toLowerCase()

        return haystack.includes(query)
      })
  }, [assetFilter, assetQuery, assets])

  const loadProject = useCallback(async () => {
    setProjectLoading(true)
    try {
      const data = await projectsService.getProject(projectId)
      setProject(data)
    } catch (error) {
      console.error('Failed to load project:', error)
      setProject(null)
      toast.error(t('errors.loadProject'))
    } finally {
      setProjectLoading(false)
    }
  }, [projectId, t])

  const refreshProjectSilently = useCallback(async () => {
    try {
      const data = await projectsService.getProject(projectId)
      setProject(data)
    } catch (error) {
      console.error('Failed to refresh project silently:', error)
    }
  }, [projectId])

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true)
    try {
      const data = await projectsService.getProjectAssets(projectId)
      setAssets(data)
    } catch (error) {
      console.error('Failed to load project assets:', error)
      toast.error(t('errors.loadAssets'))
    } finally {
      setAssetsLoading(false)
    }
  }, [projectId, t])

  const loadImportableWorks = useCallback(
    async (page: number, append = false) => {
      if (append) {
        setImportLoadingMore(true)
      } else {
        setImportLoading(true)
      }

      try {
        const result = await projectsService.getImportableWorks({
          type: importType,
          page,
          limit: 12,
          q: importQuery || undefined,
        })
        setImportableWorks((prev) => (append ? [...prev, ...result.data] : result.data))
        setImportPage(page)
        setImportHasMore(result.pagination.hasMore)
        if (!append) {
          setSelectedImportIds([])
        }
      } catch (error) {
        console.error('Failed to load importable works:', error)
        toast.error(t('errors.loadImportable'))
      } finally {
        setImportLoading(false)
        setImportLoadingMore(false)
      }
    },
    [importQuery, importType, t]
  )

  useEffect(() => {
    if (!isReady) return

    void loadProject()
    void loadAssets()
  }, [isReady, loadAssets, loadProject])

  useEffect(() => {
    if (!showImportModal || !isReady) return

    setSelectedImportIds([])
    void loadImportableWorks(1, false)
  }, [showImportModal, importType, importQuery, isReady, loadImportableWorks])

  useEffect(() => {
    if (!project) {
      setEditName('')
      setEditConcept('')
      setEditDescription('')
      return
    }

    setEditName(project.name)
    setEditConcept(project.concept || '')
    setEditDescription(project.description || '')
  }, [project])

  useEffect(() => {
    setAssetTitleDrafts(
      assets.reduce<Record<string, string>>((acc, asset) => {
        acc[asset.id] = asset.title
        return acc
      }, {})
    )
  }, [assets])

  useEffect(() => {
    setAssetDescriptionDrafts(
      assets.reduce<Record<string, string>>((acc, asset) => {
        acc[asset.id] = asset.description || ''
        return acc
      }, {})
    )
  }, [assets])

  const openEditProjectModal = () => {
    if (!project) return
    setEditName(project.name)
    setEditConcept(project.concept || '')
    setEditDescription(project.description || '')
    setEditMasterImagePrompt('')
    setShowEditProjectModal(true)
  }

  const closeEditProjectModal = () => {
    if (project) {
      setEditName(project.name)
      setEditConcept(project.concept || '')
      setEditDescription(project.description || '')
    }
    setEditMasterImagePrompt('')
    setShowEditProjectModal(false)
  }

  const handleSaveProject = async () => {
    if (!project) return

    const name = editName.trim()
    if (!name) {
      toast.error(t('validation.projectNameRequired'))
      return
    }

    setSavingProject(true)
    try {
      const updated = await projectsService.updateProject(project.id, {
        name,
        concept: editConcept.trim() || undefined,
        description: editDescription.trim() || undefined,
        masterImagePrompt: editMasterImagePrompt.trim() || undefined,
      })
      setProject(updated)
      setEditMasterImagePrompt('')
      setShowEditProjectModal(false)
      toast.success(t('messages.projectUpdated'))
    } catch (error) {
      console.error('Failed to update project:', error)
      toast.error(t('errors.updateProject'))
    } finally {
      setSavingProject(false)
    }
  }

  const handleGenerateProjectDescription = async () => {
    const concept = editConcept.trim()
    const hasDocumentReferences = documentAssetCount > 0
    const hasSavedInspirations = (project?.inspirationCount ?? 0) > 0
    if (!concept && !hasDocumentReferences && !hasSavedInspirations) {
      toast.error(t('validation.projectDescriptionSourceRequired'))
      return
    }

    setGeneratingProjectDescription(true)
    try {
      const result = await projectsService.generateProjectDescription({
        projectId,
        name: editName.trim() || undefined,
        concept: concept || undefined,
      })
      setEditDescription(result.description)
      setEditMasterImagePrompt(result.masterImagePrompt?.trim() || '')
      toast.success(t('messages.projectDescriptionGenerated'))
    } catch (error) {
      console.error('Failed to generate project description:', error)
      toast.error(t('errors.generateProjectDescription'))
    } finally {
      setGeneratingProjectDescription(false)
    }
  }

  const handleUploadAssets = async () => {
    if (currentUploadFiles.length === 0) {
      toast.error(t('validation.uploadFilesRequired'))
      return
    }

    setUploadingAssets(true)
    try {
      await projectsService.uploadProjectAssets(projectId, uploadKind, currentUploadFiles)
      if (uploadKind === 'image') {
        setUploadImages([])
      } else if (uploadKind === 'video') {
        setUploadVideos([])
      } else {
        setUploadDocuments([])
      }
      setShowUploadModal(false)
      await Promise.all([loadProject(), loadAssets()])
      toast.success(t('messages.assetsUploaded'))
    } catch (error) {
      console.error('Failed to upload project assets:', error)
      toast.error(t('errors.uploadAssets'))
    } finally {
      setUploadingAssets(false)
    }
  }

  const handleToggleImportSelection = (workId: string) => {
    setSelectedImportIds((prev) =>
      prev.includes(workId) ? prev.filter((id) => id !== workId) : [...prev, workId]
    )
  }

  const handleImportSelected = async () => {
    if (selectedImportIds.length === 0) {
      toast.error(t('validation.selectWorksRequired'))
      return
    }

    setImportingAssets(true)
    try {
      const items = importableWorks
        .filter((work) => selectedImportIds.includes(work.id))
        .map((work) => ({ id: work.id, type: work.type }))

      const result = await projectsService.importProjectAssets(projectId, { items })
      setShowImportModal(false)
      await Promise.all([loadProject(), loadAssets(), loadImportableWorks(1, false)])
      setSelectedImportIds([])
      toast.success(
        t('messages.assetsImported', {
          imported: result.importedCount,
          skipped: result.skippedCount,
        })
      )
    } catch (error) {
      console.error('Failed to import project assets:', error)
      toast.error(t('errors.importAssets'))
    } finally {
      setImportingAssets(false)
    }
  }

  const handleSaveAsset = async (asset: ProjectAsset) => {
    const nextTitle = (assetTitleDrafts[asset.id] || '').trim()
    const nextDescription = (assetDescriptionDrafts[asset.id] || '').trim()
    const currentDescription = asset.description || ''

    if (!nextTitle) {
      toast.error(t('validation.assetTitleRequired'))
      return
    }

    if (nextTitle === asset.title && nextDescription === currentDescription) return

    setSavingAssetId(asset.id)
    try {
      const updated = await projectsService.updateProjectAsset(asset.projectId, asset.id, {
        title: nextTitle,
        description: nextDescription,
      })
      setAssets((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
      setAssetTitleDrafts((prev) => ({ ...prev, [updated.id]: updated.title }))
      setAssetDescriptionDrafts((prev) => ({ ...prev, [updated.id]: updated.description || '' }))
      toast.success(t('messages.assetUpdated'))
    } catch (error) {
      console.error('Failed to update project asset:', error)
      toast.error(t('errors.updateAsset'))
    } finally {
      setSavingAssetId(null)
    }
  }

  const openDeleteAssetModal = (asset: ProjectAsset) => {
    setAssetPendingDelete(asset)
  }

  const closeDeleteAssetModal = () => {
    if (deletingAssetId) return
    setAssetPendingDelete(null)
  }

  const handleDeleteAsset = async () => {
    const asset = assetPendingDelete
    if (!asset) return

    setDeletingAssetId(asset.id)
    try {
      await projectsService.deleteProjectAsset(asset.projectId, asset.id)
      setAssets((prev) => prev.filter((item) => item.id !== asset.id))
      setAssetPendingDelete(null)
      await refreshProjectSilently()
      toast.success(t('messages.assetDeleted'))
    } catch (error) {
      console.error('Failed to delete project asset:', error)
      toast.error(t('errors.deleteAsset'))
    } finally {
      setDeletingAssetId(null)
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

  if (projectLoading) {
    return (
      <PageTransition className="min-h-screen bg-transparent px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-[1600px] justify-center">
          <Card className="w-full max-w-lg border border-stone-200/80 bg-white/92 dark:border-stone-700 dark:bg-stone-900/92">
            <CardContent className="flex items-center justify-center gap-3 py-16 text-sm text-stone-500 dark:text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('states.loading')}
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    )
  }

  if (!project) {
    return (
      <PageTransition className="min-h-screen bg-transparent px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
          <Link
            href={`/${locale}/projects`}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('detail.back')}
          </Link>

          <Card className="border border-dashed border-stone-300 bg-white/85 text-center dark:border-stone-700 dark:bg-stone-900/85">
            <CardContent className="py-20">
              <FolderKanban className="mx-auto mb-4 h-12 w-12 text-stone-400" />
              <h1 className="mb-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {t('detail.notFoundTitle')}
              </h1>
              <p className="mx-auto max-w-lg text-sm text-stone-500 dark:text-stone-400">
                {t('detail.notFoundDescription')}
              </p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="min-h-screen bg-transparent px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
        <FadeIn variant="slide">
          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <Link
                href={`/${locale}/projects`}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('detail.back')}
              </Link>

              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900">
                  <FolderKanban className="h-6 w-6" />
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {t('hero.badge')}
                    </span>
                    <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {t('projectList.assetCount', { count: project.assetCount })}
                    </span>
                    <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {t('inspiration.count', { count: project.inspirationCount })}
                    </span>
                    <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {t('projectPrompt.count', { count: project.promptCount })}
                    </span>
                    <span className="inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                      {t('detail.updatedAt', { date: formatDisplayDate(project.updatedAt, locale) })}
                    </span>
                  </div>
                  <h1 className="font-display text-3xl text-stone-950 dark:text-white sm:text-4xl">
                    {project.name}
                  </h1>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={openEditProjectModal}
                className="gap-2 px-5"
              >
                <PencilLine className="h-4 w-4" />
                {t('toolbar.editProject')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowImportModal(true)}
                className="gap-2 px-5"
              >
                <Plus className="h-4 w-4" />
                {t('toolbar.openImport')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowUploadModal(true)}
                className="gap-2 px-5"
              >
                <Upload className="h-4 w-4" />
                {t('toolbar.openUpload')}
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

        <FadeIn variant="slide" delay={0.03}>
          <ProjectInspirationWorkspace
            project={project}
            onRefreshProject={refreshProjectSilently}
          />
        </FadeIn>

        <FadeIn variant="slide" delay={0.06}>
          <ProjectPromptWorkspace
            project={project}
            onRefreshProject={refreshProjectSilently}
          />
        </FadeIn>

        <FadeIn variant="slide" delay={0.09}>
          <section className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-[0_24px_70px_-42px_rgba(15,23,42,0.44)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_28px_74px_-40px_rgba(2,6,23,0.92)]">
            <div className="border-b border-stone-200 px-5 py-5 dark:border-stone-700">
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                    {t('detail.statsTitle')}
                  </p>
                  <p className="text-sm text-stone-500 dark:text-stone-400">
                    {t('detail.statsHint')}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      {t('detail.statsTotal')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                      {assets.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      {t('detail.statsImages')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                      {imageAssetCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      {t('detail.statsVideos')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                      {videoAssetCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      {t('detail.statsDocuments')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                      {documentAssetCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      {t('detail.statsImported')}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                      {importedAssetCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-700 dark:bg-stone-800/70">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                          {t('detail.statsUploaded')}
                        </p>
                        <p className="mt-1 text-2xl font-semibold text-stone-950 dark:text-white">
                          {uploadedAssetCount}
                        </p>
                      </div>
                      <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
                        {t('projectList.assetCount', { count: project.assetCount })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold text-stone-950 dark:text-white">
                      {t('assets.title')}
                    </p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {t('assets.count', { count: filteredAssets.length })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative min-w-0 lg:min-w-[260px]">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                      <input
                        value={assetQuery}
                        onChange={(event) => setAssetQuery(event.target.value)}
                        placeholder={t('detail.searchPlaceholder')}
                        className="w-full rounded-full border border-stone-200 bg-white py-2.5 pl-10 pr-4 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {([
                        { value: 'all', label: t('detail.filterAll') },
                        { value: 'image', label: t('detail.filterImages') },
                        { value: 'video', label: t('detail.filterVideos') },
                        { value: 'document', label: t('detail.filterDocuments') },
                      ] as Array<{ value: AssetFilter; label: string }>).map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setAssetFilter(option.value)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                            assetFilter === option.value
                              ? 'border-aurora-purple bg-aurora-purple text-white'
                              : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-white'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5">
              {assetsLoading ? (
                <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('states.loading')}
                </div>
              ) : assets.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-16 text-center dark:border-stone-700 dark:bg-stone-800/50">
                  <FolderKanban className="mx-auto mb-4 h-14 w-14 text-stone-400 dark:text-stone-500" />
                  <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                    {t('assets.empty')}
                  </p>
                  <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
                    <Button
                      variant="secondary"
                      onClick={() => setShowImportModal(true)}
                      className="gap-2 px-5"
                    >
                      <Plus className="h-4 w-4" />
                      {t('toolbar.openImport')}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setShowUploadModal(true)}
                      className="gap-2 px-5"
                    >
                      <Upload className="h-4 w-4" />
                      {t('toolbar.openUpload')}
                    </Button>
                  </div>
                </div>
              ) : filteredAssets.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-stone-300 bg-stone-50/80 px-5 py-16 text-center text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400">
                  {t('detail.filteredEmpty')}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredAssets.map((asset) => {
                    const previewUrl = asset.thumbnailUrl || asset.url
                    const isSaving = savingAssetId === asset.id
                    const isDeleting = deletingAssetId === asset.id
                    const fileSizeLabel = formatFileSize(asset.fileSize)
                    const downloadName =
                      asset.fileName ||
                      `${asset.title || (asset.kind === 'video' ? 'project-video' : asset.kind === 'document' ? 'project-document' : 'project-image')}${asset.kind === 'video' ? '.mp4' : asset.kind === 'document' ? '' : '.png'}`

                    return (
                      <article
                        key={asset.id}
                        className="overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-[0_16px_44px_-34px_rgba(15,23,42,0.34)] dark:border-stone-700 dark:bg-stone-950 dark:shadow-[0_18px_48px_-34px_rgba(2,6,23,0.82)]"
                      >
                        <div className="relative overflow-hidden bg-stone-100 dark:bg-stone-800">
                          {asset.kind === 'document' ? (
                            <DocumentPreview asset={asset} />
                          ) : asset.kind === 'video' ? (
                            previewUrl ? (
                              <video
                                src={asset.url}
                                poster={asset.thumbnailUrl || undefined}
                                className="aspect-[16/10] w-full object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              <div className="flex aspect-[16/10] items-center justify-center text-stone-400">
                                <Video className="h-8 w-8" />
                              </div>
                            )
                          ) : previewUrl ? (
                            <img src={previewUrl} alt={asset.title} className="aspect-[16/10] w-full object-cover" />
                          ) : (
                            <div className="flex aspect-[16/10] items-center justify-center text-stone-400">
                              <ImageIcon className="h-8 w-8" />
                            </div>
                          )}

                          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                              {asset.kind === 'video'
                                ? t('assets.kindVideo')
                                : asset.kind === 'document'
                                  ? t('assets.kindDocument')
                                  : t('assets.kindImage')}
                            </span>
                            <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                              {asset.source === 'task' ? t('assets.sourceTask') : t('assets.sourceUpload')}
                            </span>
                            {fileSizeLabel ? (
                              <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                                {fileSizeLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-3 p-4">
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                                {t('assets.titleLabel')}
                              </p>
                              <input
                                value={assetTitleDrafts[asset.id] ?? asset.title}
                                onChange={(event) =>
                                  setAssetTitleDrafts((prev) => ({ ...prev, [asset.id]: event.target.value }))
                                }
                                className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                              />
                            </div>

                            <div className="space-y-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                                {t('assets.descriptionLabel')}
                              </p>
                              <textarea
                                value={assetDescriptionDrafts[asset.id] ?? asset.description ?? ''}
                                onChange={(event) =>
                                  setAssetDescriptionDrafts((prev) => ({ ...prev, [asset.id]: event.target.value }))
                                }
                                placeholder={t('assets.descriptionPlaceholder')}
                                rows={3}
                                className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                              />
                            </div>

                            {asset.sourcePrompt ? (
                              <div className="space-y-1">
                                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                                  {t('assets.generatedPromptLabel')}
                                </p>
                                <p className="line-clamp-3 text-xs leading-5 text-stone-500 dark:text-stone-400">
                                  {asset.sourcePrompt}
                                </p>
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-3 border-t border-stone-100 pt-3 dark:border-stone-800">
                            <span className="block text-xs text-stone-400 dark:text-stone-500">
                              {t('assets.updatedAt', { date: formatDisplayDate(asset.updatedAt, locale) })}
                            </span>

                            <div className="grid grid-cols-2 gap-2">
                              <a
                                href={asset.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {t('assets.open')}
                              </a>
                              <a
                                href={asset.url}
                                download={downloadName}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                              >
                                <Download className="h-3.5 w-3.5" />
                                {t('assets.download')}
                              </a>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleSaveAsset(asset)}
                                isLoading={isSaving}
                                className="w-full justify-center gap-1.5"
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                                {t('assets.save')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeleteAssetModal(asset)}
                                isLoading={isDeleting}
                                className="w-full justify-center gap-1.5 text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('assets.delete')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        </FadeIn>
      </div>

      <Modal
        isOpen={!!assetPendingDelete}
        onClose={closeDeleteAssetModal}
        title={t('confirm.deleteAssetTitle')}
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
                    {assetPendingDelete
                      ? t('confirm.deleteAssetDescription', {
                          name: assetPendingDelete.title,
                        })
                      : null}
                  </p>
                  <p className="text-sm leading-6 text-stone-700 dark:text-red-100/80">
                    {assetPendingDelete
                      ? t('confirm.deleteAssetMeta', {
                          kind:
                            assetPendingDelete.kind === 'image'
                              ? t('assets.kindImage')
                              : assetPendingDelete.kind === 'document'
                                ? t('assets.kindDocument')
                                : t('assets.kindVideo'),
                          source:
                            assetPendingDelete.source === 'task'
                              ? t('assets.sourceTask')
                              : t('assets.sourceUpload'),
                        })
                      : null}
                  </p>
                </div>
              </div>

              {assetPendingDelete ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    assetPendingDelete.kind === 'image'
                      ? t('assets.kindImage')
                      : assetPendingDelete.kind === 'document'
                        ? t('assets.kindDocument')
                        : t('assets.kindVideo'),
                    assetPendingDelete.source === 'task'
                      ? t('assets.sourceTask')
                      : t('assets.sourceUpload'),
                    formatDisplayDate(assetPendingDelete.updatedAt, locale),
                    formatFileSize(assetPendingDelete.fileSize),
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
            {t('confirm.deleteAssetHint')}
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={closeDeleteAssetModal}
              disabled={!!deletingAssetId}
              className="w-full sm:w-auto"
            >
              {t('createProject.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleDeleteAsset()}
              isLoading={!!deletingAssetId}
              className="w-full bg-red-600 text-white shadow-[0_20px_42px_-26px_rgba(220,38,38,0.72)] hover:scale-[1.02] hover:bg-red-500 focus:ring-red-500 dark:bg-red-500 dark:hover:bg-red-400 sm:w-auto"
            >
              {t('confirm.deleteAssetAction')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showEditProjectModal}
        onClose={closeEditProjectModal}
        title={t('detail.editModalTitle')}
        size="lg"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-stone-700 dark:text-stone-300">
              {t('detail.nameLabel')}
            </label>
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            />
          </div>

          <Textarea
            value={editConcept}
            onChange={(event) => setEditConcept(event.target.value)}
            rows={4}
            label={t('detail.conceptLabel')}
            placeholder={t('detail.conceptPlaceholder')}
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
                onClick={() => void handleGenerateProjectDescription()}
                isLoading={generatingProjectDescription}
                disabled={!editConcept.trim() && documentAssetCount === 0 && (project?.inspirationCount ?? 0) === 0}
                className="gap-2 self-start sm:self-auto"
              >
                <Sparkles className="h-4 w-4" />
                {t('detail.generateDescription')}
              </Button>
            </div>
            <Textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              rows={6}
              placeholder={t('detail.descriptionPlaceholder')}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEditProjectModal}
              className="w-full rounded-lg px-4 py-2 font-ui text-sm text-stone-600 transition-colors hover:bg-stone-100 sm:w-auto dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {t('createProject.cancel')}
            </button>
            <Button
              type="button"
              onClick={handleSaveProject}
              isLoading={savingProject}
              className="w-full gap-2 sm:w-auto"
            >
              <Save className="h-4 w-4" />
              {t('detail.save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title={t('upload.modalTitle')}
        size="lg"
      >
        <div className="space-y-5">
          <Select
            value={uploadKind}
            onChange={(event) => setUploadKind(event.target.value as ProjectAssetKind)}
            options={[
              { value: 'image', label: t('upload.kindImage') },
              { value: 'video', label: t('upload.kindVideo') },
              { value: 'document', label: t('upload.kindDocument') },
            ]}
          />

          {uploadKind === 'image' ? (
            <ImageDropzone
              value={uploadImages}
              onChange={setUploadImages}
              maxFiles={12}
              maxSize={20}
            />
          ) : uploadKind === 'video' ? (
            <FileDropzone
              value={uploadVideos}
              onChange={setUploadVideos}
              maxFiles={6}
              maxSize={100}
              accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
              idleText={t('upload.videoIdle')}
              draggingText={t('upload.videoDragging')}
              description={t('upload.videoDescription')}
            />
          ) : (
            <FileDropzone
              value={uploadDocuments}
              onChange={setUploadDocuments}
              maxFiles={10}
              maxSize={50}
              accept=".pdf,.docx,.doc,.txt,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
              idleText={t('upload.documentIdle')}
              draggingText={t('upload.documentDragging')}
              description={t('upload.documentDescription')}
            />
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowUploadModal(false)}
              className="w-full rounded-lg px-4 py-2 font-ui text-sm text-stone-600 transition-colors hover:bg-stone-100 sm:w-auto dark:text-stone-400 dark:hover:bg-stone-800"
            >
              {t('createProject.cancel')}
            </button>
            <Button
              type="button"
              onClick={handleUploadAssets}
              isLoading={uploadingAssets}
              className="w-full gap-2 sm:w-auto"
            >
              <Upload className="h-4 w-4" />
              {t('upload.action')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title={t('import.modalTitle')}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
            <Select
              value={importType}
              onChange={(event) => setImportType(event.target.value as 'image' | 'video')}
              options={[
                { value: 'image', label: t('import.kindImage') },
                { value: 'video', label: t('import.kindVideo') },
              ]}
            />

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setImportQuery(searchInput.trim())
                  }
                }}
                placeholder={t('import.searchPlaceholder')}
                className="w-full rounded-full border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 outline-none transition-colors focus:border-aurora-purple dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportQuery(searchInput.trim())}
              className="h-full"
            >
              {t('import.search')}
            </Button>
          </div>

          <div className="rounded-[28px] border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-800/60">
            {importLoading ? (
              <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('states.loading')}
              </div>
            ) : importableWorks.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{t('import.empty')}</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {importableWorks.map((work) => {
                    const checked = selectedImportIds.includes(work.id)

                    return (
                      <button
                        key={`${work.type}-${work.id}`}
                        type="button"
                        onClick={() => handleToggleImportSelection(work.id)}
                        className={cn(
                          'relative overflow-hidden rounded-[24px] border p-3 text-left transition-all',
                          checked
                            ? 'border-aurora-purple bg-aurora-purple/6'
                            : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900/80 dark:hover:border-stone-600'
                        )}
                      >
                        <div className="mb-3 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
                          {work.thumbnailUrl ? (
                            work.type === 'video' ? (
                              <video
                                src={work.resultUrl || work.thumbnailUrl}
                                poster={work.thumbnailUrl || undefined}
                                className="h-36 w-full object-cover"
                                muted
                                playsInline
                              />
                            ) : (
                              <img
                                src={work.thumbnailUrl}
                                alt={work.prompt}
                                className="h-36 w-full object-cover"
                              />
                            )
                          ) : (
                            <div className="flex h-36 items-center justify-center text-stone-400">
                              {work.type === 'video' ? <Video className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="line-clamp-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                            {work.prompt || t('import.untitled')}
                          </p>
                          <p className="text-xs text-stone-500 dark:text-stone-400">
                            {work.type === 'video' ? t('import.kindVideo') : t('import.kindImage')}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'absolute right-3 top-3 inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-xs font-semibold',
                            checked
                              ? 'border-aurora-purple bg-aurora-purple text-white'
                              : 'border-stone-200 bg-white text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
                          )}
                        >
                          {checked ? '✓' : '+'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    {t('import.action', { count: selectedImportIds.length })}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {importHasMore ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadImportableWorks(importPage + 1, true)}
                        isLoading={importLoadingMore}
                      >
                        {t('import.loadMore')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      onClick={handleImportSelected}
                      isLoading={importingAssets}
                      disabled={selectedImportIds.length === 0}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t('import.action', { count: selectedImportIds.length })}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </PageTransition>
  )
}
