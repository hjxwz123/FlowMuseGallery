'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useTranslations } from '@/i18n/client'
import { toast } from 'sonner'

import { ChatModelManagerSection } from '@/components/admin/settings/ChatModelManagerSection'
import { ModelChannelManagerSection } from '@/components/admin/settings/ModelChannelManagerSection'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { adminAiService, type AiSettings, type StorageSettings } from '@/lib/api/services/admin/ai'

const labelCls = 'mb-2 block text-sm font-medium text-stone-700 dark:text-stone-200'
const inputCls =
  'w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-900 transition-colors placeholder:text-stone-400 focus:border-aurora-purple focus:outline-none focus:ring-2 focus:ring-aurora-purple/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-500'
const panelCardCls =
  'border border-stone-200 !bg-white !shadow-sm dark:border-stone-800 dark:!bg-stone-950/80'

const DEFAULT_AI_FORM_DATA = {
  apiBaseUrl: '',
  apiKey: '',
  modelName: '',
}

const DEFAULT_STORAGE_FORM_DATA = {
  cosSecretId: '',
  cosSecretKey: '',
  cosBucket: '',
  cosRegion: '',
  cosPublicBaseUrl: '',
  cosPrefix: '',
}

interface SystemConfigModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SystemConfigModal({ isOpen, onClose }: SystemConfigModalProps) {
  const t = useTranslations('settings.system')
  const tCommon = useTranslations('settings.common')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isStorageSaving, setIsStorageSaving] = useState(false)
  const [formData, setFormData] = useState(() => ({ ...DEFAULT_AI_FORM_DATA }))
  const [storageFormData, setStorageFormData] = useState(() => ({ ...DEFAULT_STORAGE_FORM_DATA }))

  useEffect(() => {
    if (isOpen) {
      void loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      const [data, storageData] = await Promise.all([
        adminAiService.getSettings(),
        adminAiService.getStorageSettings(),
      ])
      setFormData({
        apiBaseUrl: data.apiBaseUrl || '',
        apiKey: data.apiKey || '',
        modelName: data.modelName || '',
      })
      setStorageFormData({
        cosSecretId: storageData.cosSecretId || '',
        cosSecretKey: storageData.cosSecretKey || '',
        cosBucket: storageData.cosBucket || '',
        cosRegion: storageData.cosRegion || '',
        cosPublicBaseUrl: storageData.cosPublicBaseUrl || '',
        cosPrefix: storageData.cosPrefix || '',
      })
    } catch (error) {
      toast.error(tCommon('failedToLoad'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setIsSaving(true)
      const payload: Partial<AiSettings> = {
        apiBaseUrl: formData.apiBaseUrl,
        modelName: formData.modelName,
      }
      if (formData.apiKey && !formData.apiKey.includes('****')) {
        payload.apiKey = formData.apiKey
      }
      const updated = await adminAiService.updateSettings(payload)
      setFormData({
        apiBaseUrl: updated.apiBaseUrl || '',
        apiKey: updated.apiKey || '',
        modelName: updated.modelName || '',
      })
      toast.success(tCommon('saved'))
    } catch (error) {
      toast.error(tCommon('failedToSave'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleStorageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setIsStorageSaving(true)
      const payload: Partial<StorageSettings> = {
        cosSecretId: storageFormData.cosSecretId,
        cosBucket: storageFormData.cosBucket,
        cosRegion: storageFormData.cosRegion,
        cosPublicBaseUrl: storageFormData.cosPublicBaseUrl,
        cosPrefix: storageFormData.cosPrefix,
      }
      if (!storageFormData.cosSecretKey.includes('****')) {
        payload.cosSecretKey = storageFormData.cosSecretKey
      }
      const updated = await adminAiService.updateStorageSettings(payload)
      setStorageFormData({
        cosSecretId: updated.cosSecretId || '',
        cosSecretKey: updated.cosSecretKey || '',
        cosBucket: updated.cosBucket || '',
        cosRegion: updated.cosRegion || '',
        cosPublicBaseUrl: updated.cosPublicBaseUrl || '',
        cosPrefix: updated.cosPrefix || '',
      })
      toast.success(tCommon('saved'))
    } catch (error) {
      toast.error(tCommon('failedToSave'))
    } finally {
      setIsStorageSaving(false)
    }
  }

  const apiConfigured = Boolean(formData.apiBaseUrl.trim()) && Boolean(formData.apiKey.trim())

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="xl"
      bodyClassName="space-y-5"
    >
      {isLoading ? (
        <Card className={`${panelCardCls} p-8`}>
          <div className="flex min-h-[220px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-stone-200 border-t-aurora-purple dark:border-stone-800 dark:border-t-aurora-purple" />
          </div>
        </Card>
      ) : (
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
            <TabsTrigger value="media">{t('tabs.media')}</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-5">
            <form onSubmit={handleSubmit}>
              <Card className={`${panelCardCls} space-y-5 p-6`}>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>{t('apiBaseUrl')}</label>
                    <input
                      type="text"
                      value={formData.apiBaseUrl}
                      onChange={(event) => setFormData({ ...formData, apiBaseUrl: event.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t('apiKey')}</label>
                    <input
                      type="password"
                      value={formData.apiKey}
                      onChange={(event) => setFormData({ ...formData, apiKey: event.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{t('promptOptimizeModel')}</label>
                    <input
                      type="text"
                      value={formData.modelName}
                      onChange={(event) => setFormData({ ...formData, modelName: event.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex justify-end border-t border-stone-200 pt-5 dark:border-stone-800">
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-aurora-purple px-6 py-2 text-white transition-colors hover:bg-aurora-purple/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? tCommon('saving') : tCommon('save')}
                  </Button>
                </div>
              </Card>
            </form>

            <ChatModelManagerSection apiConfigured={apiConfigured} />
          </TabsContent>

          <TabsContent value="media">
            <div className="space-y-5">
              <form onSubmit={handleStorageSubmit}>
                <Card className={`${panelCardCls} space-y-5 p-6`}>
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    {t('storage.title')}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>{t('storage.secretId')}</label>
                      <input
                        type="text"
                        value={storageFormData.cosSecretId}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosSecretId: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('storage.secretKey')}</label>
                      <input
                        type="password"
                        value={storageFormData.cosSecretKey}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosSecretKey: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('storage.bucket')}</label>
                      <input
                        type="text"
                        value={storageFormData.cosBucket}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosBucket: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('storage.region')}</label>
                      <input
                        type="text"
                        value={storageFormData.cosRegion}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosRegion: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('storage.publicBaseUrl')}</label>
                      <input
                        type="text"
                        value={storageFormData.cosPublicBaseUrl}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosPublicBaseUrl: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>{t('storage.prefix')}</label>
                      <input
                        type="text"
                        value={storageFormData.cosPrefix}
                        onChange={(event) => setStorageFormData({ ...storageFormData, cosPrefix: event.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end border-t border-stone-200 pt-5 dark:border-stone-800">
                    <Button
                      type="submit"
                      disabled={isStorageSaving}
                      className="rounded-lg bg-aurora-purple px-6 py-2 text-white transition-colors hover:bg-aurora-purple/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isStorageSaving ? tCommon('saving') : tCommon('save')}
                    </Button>
                  </div>
                </Card>
              </form>

              <ModelChannelManagerSection />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </Modal>
  )
}
