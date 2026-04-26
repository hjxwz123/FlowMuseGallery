'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/i18n/client'
import { toast } from 'sonner'

import { ChannelModal } from '@/components/admin/forms/ChannelModal'
import { StatusBadge } from '@/components/admin/shared/StatusBadge'
import { DataTable, type DataTableColumn } from '@/components/admin/tables/DataTable'
import { adminChannelService } from '@/lib/api/services/admin/channels'
import type { Channel } from '@/lib/api/types/admin/channels'
import { isAdminModelsHiddenProvider } from '@/lib/constants/providers'

export function ModelChannelManagerSection() {
  const t = useTranslations('settings.media')
  const tCommon = useTranslations('settings.common')

  const [channels, setChannels] = useState<Channel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false)
  const [selectedChannel, setSelectedChannel] = useState<Channel | undefined>()

  const fetchChannels = async () => {
    setChannelsLoading(true)
    try {
      const response = await adminChannelService.getChannels()
      setChannels(response.filter((channel) => !isAdminModelsHiddenProvider(channel.provider)))
    } catch (error) {
      console.error('Failed to fetch channels:', error)
      toast.error(tCommon('failedToLoad'))
    } finally {
      setChannelsLoading(false)
    }
  }

  useEffect(() => {
    void fetchChannels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const testChannelConnection = async (channel: Channel) => {
    try {
      const result = await adminChannelService.testConnection(channel.id)
      toast[result.ok ? 'success' : 'error'](
        result.ok ? t('channels.connectionOk') : result.error || t('channels.connectionFailed')
      )
    } catch (error) {
      console.error('Failed to test channel connection:', error)
      toast.error(t('channels.connectionFailed'))
    }
  }

  const channelColumns: DataTableColumn<Channel>[] = [
    {
      key: 'name',
      label: t('channels.fields.name'),
      width: '180px',
      render: (channel) => <span className="font-medium text-stone-900 dark:text-stone-100">{channel.name}</span>,
    },
    {
      key: 'provider',
      label: t('channels.fields.provider'),
      width: '120px',
      render: (channel) => <span className="text-stone-700 dark:text-stone-300">{channel.provider}</span>,
    },
    {
      key: 'baseUrl',
      label: t('channels.fields.baseUrl'),
      render: (channel) => (
        <span className="font-mono text-xs text-stone-600 dark:text-stone-400">
          {channel.baseUrl || '-'}
        </span>
      ),
    },
    {
      key: 'status',
      label: t('channels.fields.status'),
      width: '90px',
      align: 'center',
      render: (channel) => <StatusBadge status={channel.status === 'active' ? 'enabled' : 'disabled'} />,
    },
    {
      key: 'actions',
      label: tCommon('edit'),
      width: '220px',
      align: 'center',
      render: (channel) => (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => void testChannelConnection(channel)}
            disabled={!channel.baseUrl}
            className="rounded-lg bg-blue-100 px-3 py-1.5 font-ui text-xs font-medium text-blue-700 transition-colors duration-300 hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25"
          >
            {t('channels.testConnection')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedChannel(channel)
              setIsChannelModalOpen(true)
            }}
            className="rounded-lg bg-aurora-purple/10 px-3 py-1.5 font-ui text-xs font-medium text-aurora-purple transition-colors duration-300 hover:bg-aurora-purple/20 dark:bg-aurora-purple/15 dark:hover:bg-aurora-purple/25"
          >
            {tCommon('edit')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={channels}
        columns={channelColumns}
        keyExtractor={(channel) => channel.id}
        loading={channelsLoading}
        emptyText={tCommon('noData')}
      />

      <ChannelModal
        isOpen={isChannelModalOpen}
        onClose={() => {
          setIsChannelModalOpen(false)
          setSelectedChannel(undefined)
        }}
        channel={selectedChannel}
        onSuccess={() => {
          void fetchChannels()
        }}
      />
    </div>
  )
}
