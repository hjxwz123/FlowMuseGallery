/**
 * Prompt编辑弹窗组件
 * 用于nanobanana图片重绘等简单的prompt输入场景
 */

'use client'

import { useState } from 'react'
import { Modal, Button, Textarea } from '@/components/ui'

interface PromptEditModalProps {
  isOpen: boolean
  title?: string
  label?: string
  initialPrompt?: string
  placeholder?: string
  helperText?: string
  submitText?: string
  onClose: () => void
  onSubmit: (prompt: string) => Promise<void>
}

export function PromptEditModal({
  isOpen,
  title = '编辑Prompt',
  label = '图片描述',
  initialPrompt = '',
  placeholder = '请输入新的描述...',
  helperText = '描述你想要在图片中看到的内容',
  submitText = '提交',
  onClose,
  onSubmit,
}: PromptEditModalProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert('请输入描述')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit(prompt.trim())
    } catch (err) {
      console.error('Failed to submit prompt:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setPrompt(initialPrompt)
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <div>
          <label className="block font-ui text-sm font-medium text-stone-700 mb-2">
            {label}
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            rows={6}
            disabled={isSubmitting}
            className="font-ui"
          />
          {helperText ? (
            <p className="mt-2 font-ui text-xs text-stone-500">{helperText}</p>
          ) : null}
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={!prompt.trim()}
          >
            {submitText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
