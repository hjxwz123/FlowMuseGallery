'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from '@/lib/compat/link'
import { useTranslations } from '@/i18n/client'
import { FolderKanban, Image as ImageIcon, Loader2, Video } from 'lucide-react'

import { EnhancedSelect, type EnhancedSelectOption } from '@/components/ui/EnhancedSelect'
import { Modal } from '@/components/ui/Modal'
import type { ProjectAsset, ProjectSummary } from '@/lib/api/types/projects'
import { cn } from '@/lib/utils/cn'

export interface ProjectContextPanelProps {
  locale: string
  loading: boolean
  projects: ProjectSummary[]
  selectedProjectId: string
  onSelectProjectId: (projectId: string) => void
  selectedProject: ProjectSummary | null
  projectAssets: ProjectAsset[]
  usableAssets: ProjectAsset[]
  selectedAssetIds: string[]
  disabledAssetIds?: string[]
  onToggleAsset: (assetId: string) => void
  supportsReferenceAssets: boolean
}

export function ProjectContextPanel({
  locale,
  loading,
  projects,
  selectedProjectId,
  onSelectProjectId,
  selectedProject,
  projectAssets,
  usableAssets,
  selectedAssetIds,
  disabledAssetIds = [],
  onToggleAsset,
  supportsReferenceAssets,
}: ProjectContextPanelProps) {
  const t = useTranslations('create')
  const [showAssetPickerModal, setShowAssetPickerModal] = useState(false)

  const projectOptions = useMemo<EnhancedSelectOption[]>(
    () => [
      {
        value: '',
        label: t('projectContext.none'),
      },
      ...projects.map((project): EnhancedSelectOption => ({
        value: project.id,
        label: project.name,
      })),
    ],
    [projects, t]
  )

  const selectedUsableAssets = useMemo(
    () => usableAssets.filter((asset) => selectedAssetIds.includes(asset.id)),
    [usableAssets, selectedAssetIds]
  )
  const selectedUsableAssetCount = selectedUsableAssets.length

  useEffect(() => {
    if (selectedProject && supportsReferenceAssets && usableAssets.length > 0) return
    setShowAssetPickerModal(false)
  }, [selectedProject, supportsReferenceAssets, usableAssets.length])

  const renderAssetCard = (asset: ProjectAsset) => {
    const active = selectedAssetIds.includes(asset.id)
    const disabled = !active && disabledAssetIds.includes(asset.id)
    const previewUrl = asset.thumbnailUrl || asset.url

    return (
      <button
        key={asset.id}
        type="button"
        disabled={disabled}
        onClick={() => onToggleAsset(asset.id)}
        className={cn(
          'overflow-hidden rounded-[22px] border text-left transition-all',
          active
            ? 'border-aurora-purple bg-aurora-purple/6 shadow-sm'
            : disabled
              ? 'cursor-not-allowed border-stone-200/70 bg-stone-100/80 opacity-60 dark:border-stone-700/70 dark:bg-stone-900/50'
              : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900/80 dark:hover:border-stone-600',
        )}
      >
        <div className="aspect-[16/10] overflow-hidden bg-stone-100 dark:bg-stone-800">
          {asset.kind === 'video' ? (
            previewUrl ? (
              <video
                src={asset.url}
                poster={asset.thumbnailUrl || undefined}
                muted
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-stone-400">
                <Video className="h-8 w-8" />
              </div>
            )
          ) : previewUrl ? (
            <img src={previewUrl} alt={asset.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-400">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {asset.kind === 'video'
                ? t('projectContext.kindVideo')
                : t('projectContext.kindImage')}
            </span>
            <span className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
              {asset.source === 'task'
                ? t('projectContext.fromTask')
                : t('projectContext.fromUpload')}
            </span>
          </div>
          <p className="line-clamp-2 text-sm font-medium text-stone-900 dark:text-stone-100">
            {asset.title}
          </p>
          {asset.description ? (
            <p className="line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
              {asset.description}
            </p>
          ) : null}
        </div>
      </button>
    )
  }

  return (
    <>
      <div className="w-full space-y-4">
        <div className="flex flex-col gap-3 border-b border-stone-200/80 pb-4 dark:border-stone-700/80 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-stone-900 text-sm font-semibold text-white dark:bg-stone-100 dark:text-stone-900">
                <FolderKanban className="h-5 w-5" />
              </span>
              <div>
                <p className="text-base font-semibold text-stone-900 dark:text-stone-100">
                  {t('projectContext.title')}
                </p>
              </div>
            </div>
          </div>

          <Link
            href={`/${locale}/projects`}
            className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
          >
            {t('projectContext.manage')}
          </Link>
        </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('projectContext.loading')}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-6 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/60 dark:text-stone-400">
          <p className="font-medium text-stone-700 dark:text-stone-200">
            {t('projectContext.emptyTitle')}
          </p>
        </div>
      ) : (
        <>
          <EnhancedSelect
            label={t('projectContext.selectLabel')}
            value={selectedProjectId}
            onChange={onSelectProjectId}
            options={projectOptions}
          />

          {selectedProject ? (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-800/60">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {selectedProject.name}
                  </p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-900 dark:text-stone-300">
                    {t('projectContext.assetCount', { count: projectAssets.length })}
                  </span>
                  {selectedUsableAssetCount > 0 ? (
                    <span className="rounded-full bg-aurora-purple/10 px-2.5 py-1 text-[11px] font-medium text-aurora-purple">
                      {t('projectContext.selectedCount', { count: selectedUsableAssetCount })}
                    </span>
                  ) : null}
                </div>
              </div>

              {supportsReferenceAssets && usableAssets.length > 0 ? (
                <div className="rounded-[24px] border border-stone-200/80 bg-white/85 p-4 dark:border-stone-700 dark:bg-stone-900/70">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setShowAssetPickerModal(true)}
                      className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                    >
                      {t('projectContext.openAssetPicker')}
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-aurora-purple/10 px-2.5 py-1 text-[11px] font-medium text-aurora-purple">
                      {t('projectContext.selectedCount', { count: selectedUsableAssetCount })}
                    </span>
                    <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {t('projectContext.assetCount', { count: usableAssets.length })}
                    </span>
                  </div>

                  {selectedUsableAssets.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedUsableAssets.slice(0, 4).map((asset) => (
                        <span
                          key={asset.id}
                          className="inline-flex max-w-full items-center rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200"
                        >
                          <span className="truncate">{asset.title}</span>
                        </span>
                      ))}
                      {selectedUsableAssets.length > 4 ? (
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                          {t('projectContext.moreSelected', { count: selectedUsableAssets.length - 4 })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      </div>

      <Modal
        isOpen={showAssetPickerModal}
        onClose={() => setShowAssetPickerModal(false)}
        title={t('projectContext.assetModalTitle')}
        size="xl"
        className="max-w-5xl"
      >
        {selectedProject ? (
          <div className="space-y-5">
            <div className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-stone-700 dark:bg-stone-900/70">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  {selectedProject.name}
                </p>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-950 dark:text-stone-300">
                  {t('projectContext.assetCount', { count: usableAssets.length })}
                </span>
                <span className="rounded-full bg-aurora-purple/10 px-2.5 py-1 text-[11px] font-medium text-aurora-purple">
                  {t('projectContext.selectedCount', { count: selectedUsableAssetCount })}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {usableAssets.map((asset) => renderAssetCard(asset))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAssetPickerModal(false)}
                className="inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                {t('projectContext.done')}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
