'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from '@/lib/compat/link'
import { useLocale, useTranslations } from '@/i18n/client'
import {
  Brush,
  Circle as CircleIcon,
  Download,
  Eraser,
  FileImage,
  FileJson,
  Minus,
  MousePointer2,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import { PageTransition } from '@/components/shared/PageTransition'
import { EnhancedSelect, type EnhancedSelectOption } from '@/components/ui'
import { projectsService } from '@/lib/api/services/projects'
import type { ProjectSummary } from '@/lib/api/types/projects'
import { useAuth } from '@/lib/hooks/useAuth'
import { cn } from '@/lib/utils/cn'

import styles from './CanvasBoardContent.module.css'

type ToolMode = 'select' | 'draw' | 'erase'
type InsertableType = 'rectangle' | 'circle' | 'line' | 'text'
type FabricModule = typeof import('fabric')
type FabricCanvas = import('fabric').Canvas
type FabricObject = import('fabric').FabricObject

type ExportedCanvasProject = {
  version: number
  width: number
  height: number
  canvas: Record<string, unknown>
}

type MiddleSelectionRect = {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

type CanvasCropOptions = {
  left: number
  top: number
  width: number
  height: number
  multiplier: number
}

type PencilBrushLike = import('fabric').PencilBrush

const DEFAULT_STROKE_COLOR = '#8257db'
const DEFAULT_FILL_COLOR = 'transparent'
const DARK_CANVAS_BACKGROUND = '#0f0f12'
const LIGHT_CANVAS_BACKGROUND = '#f8fafc'

function useDraggable() {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  })

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (
      ['INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'OPTION'].includes(target.tagName) ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea') ||
      target.closest('a')
    ) {
      return
    }

    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    setOffset({
      x: dragRef.current.startOffsetX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startOffsetY + (e.clientY - dragRef.current.startY),
    })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return {
    offset,
    isDragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  }
}

function resolveIsDarkTheme() {
  if (typeof window === 'undefined') return false

  const root = document.documentElement
  if (root.classList.contains('dark')) return true
  if (root.classList.contains('light')) return false

  try {
    const raw = window.localStorage.getItem('theme-storage')
    if (raw) {
      const parsed = JSON.parse(raw) as {
        state?: { theme?: 'light' | 'dark' | 'system' }
      }
      const storedTheme = parsed?.state?.theme
      if (storedTheme === 'dark') return true
      if (storedTheme === 'light') return false
    }
  } catch {
    // ignore malformed data
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function buildFilename(prefix: string, extension: string) {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${extension}`
}

function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 0)
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unexpected file reader result'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function dataUrlToFile(dataUrl: string, filename: string) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

function normalizeProjectPayload(value: unknown): ExportedCanvasProject {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid project payload')
  }

  const candidate = value as Record<string, unknown>
  const width =
    typeof candidate.width === 'number' && Number.isFinite(candidate.width)
      ? candidate.width
      : window.innerWidth
  const height =
    typeof candidate.height === 'number' && Number.isFinite(candidate.height)
      ? candidate.height
      : window.innerHeight

  if (candidate.canvas && typeof candidate.canvas === 'object') {
    return {
      version: 1,
      width,
      height,
      canvas: candidate.canvas as Record<string, unknown>,
    }
  }

  if (Array.isArray(candidate.objects)) {
    return {
      version: 1,
      width,
      height,
      canvas: candidate,
    }
  }

  throw new Error('Unsupported project payload')
}

function normalizeObjectKind(type: string | undefined) {
  switch (type) {
    case 'rect':
      return 'rectangle'
    case 'circle':
      return 'circle'
    case 'line':
      return 'line'
    case 'i-text':
    case 'textbox':
    case 'text':
      return 'text'
    case 'path':
      return 'path'
    case 'image':
      return 'image'
    case 'group':
      return 'group'
    default:
      return 'unknown'
  }
}

function applyObjectChrome(object: FabricObject) {
  object.set({
    borderColor: 'rgba(130, 87, 219, 0.8)',
    cornerColor: DEFAULT_STROKE_COLOR,
    cornerStrokeColor: '#ffffff',
    cornerStyle: 'circle',
    transparentCorners: false,
    padding: 8,
  })
}

function createTrueEraserBrush(
  fabricModule: FabricModule,
  editor: FabricCanvas,
  width: number
): PencilBrushLike {
  class TrueEraserBrush extends fabricModule.PencilBrush {
    needsFullRender() {
      return true
    }

    _setBrushStyles(ctx: CanvasRenderingContext2D) {
      super._setBrushStyles(ctx)
      ctx.globalCompositeOperation = 'destination-out'
    }

    createPath(pathData: Parameters<PencilBrushLike['createPath']>[0]) {
      const path = super.createPath(pathData)
      path.set({
        stroke: '#000000',
        globalCompositeOperation: 'destination-out',
        selectable: false,
        evented: false,
        erasable: false,
      })
      return path
    }

    _render() {
      const targetContext = this.canvas.getContext()
      super._render(targetContext)
    }
  }

  const brush = new TrueEraserBrush(editor)
  brush.width = width
  brush.color = '#000000'
  brush.decimate = 0
  brush.strokeLineCap = 'round'
  brush.strokeLineJoin = 'round'
  brush.limitedToCanvasSize = true
  return brush
}

export function CanvasBoardContent() {
  const t = useTranslations('canvas')
  const locale = useLocale()
  const { isReady } = useAuth()

  const canvasElementRef = useRef<HTMLCanvasElement | null>(null)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<FabricCanvas | null>(null)
  const fabricModuleRef = useRef<FabricModule | null>(null)
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isRestoringRef = useRef(false)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const middleSelectionRectRef = useRef<MiddleSelectionRect | null>(null)

  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [brushColor, setBrushColor] = useState(DEFAULT_STROKE_COLOR)
  const [fillColor, setFillColor] = useState(DEFAULT_FILL_COLOR)
  const [brushSize, setBrushSize] = useState(6)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 })
  const [objectCount, setObjectCount] = useState(0)
  const [selectedObjectType, setSelectedObjectType] = useState<string | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectAssetTitle, setProjectAssetTitle] = useState('')
  const [savingToProject, setSavingToProject] = useState(false)
  const [middleSelectionRect, setMiddleSelectionRect] = useState<MiddleSelectionRect | null>(null)

  const dragTop = useDraggable()
  const dragActions = useDraggable()
  const dragInspector = useDraggable()
  const dragStatus = useDraggable()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateTheme = () => {
      setIsDarkTheme(resolveIsDarkTheme())
      const editor = canvasRef.current
      if (editor) {
        editor.requestRenderAll()
      }
    }

    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class'],
    })

    mediaQuery.addEventListener('change', updateTheme)

    return () => {
      observer.disconnect()
      mediaQuery.removeEventListener('change', updateTheme)
    }
  }, [])

  const updateHistoryFlags = () => {
    setCanUndo(historyIndexRef.current > 0)
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1)
  }

  const syncControlsFromObject = (object: FabricObject | null) => {
    if (!object) return
    const stroke = object.get('stroke')
    const fill = object.get('fill')
    const strokeWidth = object.get('strokeWidth')
    const normalizedType = normalizeObjectKind(object.type)

    if (normalizedType === 'text' && typeof fill === 'string') {
      setBrushColor(fill)
    } else if (typeof stroke === 'string') {
      setBrushColor(stroke)
    }

    if (typeof fill === 'string' && normalizedType !== 'text') {
      setFillColor(fill)
    }

    if (typeof strokeWidth === 'number' && Number.isFinite(strokeWidth) && strokeWidth > 0) {
      setBrushSize(Math.max(1, Math.round(strokeWidth)))
    }
  }

  const updateCanvasStats = (editor = canvasRef.current) => {
    if (!editor) return
    const activeObjects = editor.getActiveObjects()
    const singleActiveObject =
      activeObjects.length === 1 ? activeObjects[0] : editor.getActiveObject()

    setObjectCount(editor.getObjects().length)

    if (activeObjects.length > 1) {
      setSelectedCount(activeObjects.length)
      setSelectedObjectType('group')
      return
    }

    if (!singleActiveObject) {
      setSelectedCount(0)
      setSelectedObjectType(null)
      return
    }

    setSelectedCount(1)
    setSelectedObjectType(normalizeObjectKind(singleActiveObject.type))
    syncControlsFromObject(singleActiveObject)
  }

  const serializeProject = (editor = canvasRef.current) => {
    if (!editor) return ''
    const payload: ExportedCanvasProject = {
      version: 1,
      width: editor.getWidth(),
      height: editor.getHeight(),
      canvas: editor.toJSON() as Record<string, unknown>,
    }
    return JSON.stringify(payload)
  }

  const pushHistorySnapshot = () => {
    if (isRestoringRef.current) return

    const snapshot = serializeProject()
    if (!snapshot) return

    if (historyRef.current[historyIndexRef.current] === snapshot) {
      updateHistoryFlags()
      return
    }

    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push(snapshot)
    historyIndexRef.current = historyRef.current.length - 1
    updateHistoryFlags()
    updateCanvasStats()
  }

  const applySerializedProject = async (snapshot: string) => {
    const editor = canvasRef.current
    if (!editor) return

    const payload = normalizeProjectPayload(JSON.parse(snapshot))
    isRestoringRef.current = true

    try {
      editor.discardActiveObject()
      editor.clear()
      editor.setDimensions({
        width: payload.width,
        height: payload.height,
      })
      await editor.loadFromJSON(payload.canvas)
      editor.getObjects().forEach((object) => {
        applyObjectChrome(object)
      })
      editor.requestRenderAll()
      setBoardSize({ width: payload.width, height: payload.height })
      setSelectedObjectType(null)
      setSelectedCount(0)
      setToolMode('select')
      updateCanvasStats(editor)
    } finally {
      isRestoringRef.current = false
    }
  }

  const getSelectedObjects = (editor = canvasRef.current) => {
    if (!editor) return [] as FabricObject[]
    const activeObjects = editor.getActiveObjects()
    if (activeObjects.length > 0) {
      return activeObjects
    }
    const activeObject = editor.getActiveObject()
    return activeObject ? [activeObject] : []
  }

  const applyRectSelection = (
    rect: MiddleSelectionRect,
    editor = canvasRef.current,
    fabricModule = fabricModuleRef.current
  ) => {
    if (!editor || !fabricModule) return

    const left = Math.min(rect.startX, rect.currentX)
    const top = Math.min(rect.startY, rect.currentY)
    const width = Math.abs(rect.currentX - rect.startX)
    const height = Math.abs(rect.currentY - rect.startY)

    if (width < 4 || height < 4) {
      editor.discardActiveObject()
      editor.requestRenderAll()
      updateCanvasStats(editor)
      return
    }

    const selectedObjects = editor.getObjects().filter((object) => {
      const bounds = object.getBoundingRect()
      return !(
        bounds.left > left + width
        || bounds.left + bounds.width < left
        || bounds.top > top + height
        || bounds.top + bounds.height < top
      )
    })

    if (selectedObjects.length === 0) {
      editor.discardActiveObject()
    } else if (selectedObjects.length === 1) {
      editor.setActiveObject(selectedObjects[0])
    } else {
      const activeSelection = new fabricModule.ActiveSelection(selectedObjects, {
        canvas: editor,
      })
      editor.setActiveObject(activeSelection)
    }

    editor.requestRenderAll()
    updateCanvasStats(editor)
  }

  const setMiddleSelection = (value: MiddleSelectionRect | null) => {
    middleSelectionRectRef.current = value
    setMiddleSelectionRect(value)
  }

  const applyColorToSelection = (kind: 'stroke' | 'fill', value: string) => {
    const editor = canvasRef.current
    if (!editor) return

    const selectedObjects = getSelectedObjects(editor)
    if (selectedObjects.length === 0) return

    selectedObjects.forEach((object) => {
      const normalizedType = normalizeObjectKind(object.type)
      if (normalizedType === 'image') return

      if (kind === 'fill') {
        if (normalizedType === 'line' || normalizedType === 'path') return
        object.set('fill', value)
      } else if (normalizedType === 'text') {
        object.set('fill', value)
      } else {
        object.set('stroke', value)
      }
      object.setCoords()
    })

    editor.requestRenderAll()
    pushHistorySnapshot()
  }

  const applyStrokeWidthToSelection = (value: number) => {
    const editor = canvasRef.current
    if (!editor) return

    const selectedObjects = getSelectedObjects(editor)
    if (selectedObjects.length === 0) return

    selectedObjects.forEach((object) => {
      const normalizedType = normalizeObjectKind(object.type)
      if (normalizedType === 'text' || normalizedType === 'image') return
      object.set('strokeWidth', value)
      object.setCoords()
    })

    editor.requestRenderAll()
    pushHistorySnapshot()
  }

  const insertShape = (shape: InsertableType) => {
    const editor = canvasRef.current
    const fabricModule = fabricModuleRef.current
    if (!editor || !fabricModule) return

    let object: FabricObject
    const centerX = editor.getWidth() / 2
    const centerY = editor.getHeight() / 2
    const strokeWidth = Math.max(2, brushSize)

    if (shape === 'rectangle') {
      object = new fabricModule.Rect({
        left: centerX - 100,
        top: centerY - 80,
        width: 200,
        height: 160,
        rx: 16,
        ry: 16,
        fill: fillColor,
        stroke: brushColor,
        strokeWidth,
      })
    } else if (shape === 'circle') {
      object = new fabricModule.Circle({
        left: centerX - 80,
        top: centerY - 80,
        radius: 80,
        fill: fillColor,
        stroke: brushColor,
        strokeWidth,
      })
    } else if (shape === 'line') {
      object = new fabricModule.Line([0, 0, 200, 0], {
        left: centerX - 100,
        top: centerY,
        stroke: brushColor,
        strokeWidth,
        strokeLineCap: 'round',
      })
    } else {
      object = new fabricModule.IText(t('defaults.text'), {
        left: centerX - 100,
        top: centerY - 20,
        fontSize: 36,
        fill: brushColor,
        fontWeight: 600,
      })
    }

    applyObjectChrome(object)
    editor.add(object)
    editor.setActiveObject(object)
    editor.requestRenderAll()
    setToolMode('select')
    updateCanvasStats(editor)
  }

  const clearCanvas = () => {
    const editor = canvasRef.current
    if (!editor) return

    isRestoringRef.current = true
    try {
      editor.discardActiveObject()
      editor.clear()
      editor.requestRenderAll()
      setSelectedObjectType(null)
      setSelectedCount(0)
      updateCanvasStats(editor)
    } finally {
      isRestoringRef.current = false
    }

    pushHistorySnapshot()
    toast.success(t('messages.cleared'))
  }

  const deleteSelection = () => {
    const editor = canvasRef.current
    if (!editor) return

    const selectedObjects = [...getSelectedObjects(editor)]
    if (selectedObjects.length === 0) {
      toast.error(t('errors.nothingSelected'))
      return
    }

    isRestoringRef.current = true
    try {
      selectedObjects.forEach((object) => {
        editor.remove(object)
      })
      editor.discardActiveObject()
      editor.requestRenderAll()
      updateCanvasStats(editor)
    } finally {
      isRestoringRef.current = false
    }

    pushHistorySnapshot()
    toast.success(t('messages.selectionDeleted'))
  }

  const getExportOptions = (editor: FabricCanvas): CanvasCropOptions | null => {
    const objects = editor.getObjects()
    if (objects.length === 0) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    objects.forEach((obj) => {
      const bound = obj.getBoundingRect()
      minX = Math.min(minX, bound.left)
      minY = Math.min(minY, bound.top)
      maxX = Math.max(maxX, bound.left + bound.width)
      maxY = Math.max(maxY, bound.top + bound.height)
    })

    const padding = 40

    return {
      left: Math.max(0, minX - padding),
      top: Math.max(0, minY - padding),
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
      multiplier: 2,
    }
  }

  const buildCroppedDataUrl = (editor: FabricCanvas) => {
  const options = getExportOptions(editor)
  if (!options) return null

  // ✅ Pass multiplier as 1st arg, crop bounds as 2nd arg
  const exportCanvas = editor.toCanvasElement(options.multiplier, {
    left: options.left,
    top: options.top,
    width: options.width,
    height: options.height,
  })

  const ctx = exportCanvas.getContext('2d')
  if (ctx) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = isDarkTheme ? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
  }
  return exportCanvas.toDataURL('image/png')
}

  const exportProject = () => {
    const snapshot = serializeProject()
    if (!snapshot) return

    const blob = new Blob([JSON.stringify(JSON.parse(snapshot), null, 2)], {
      type: 'application/json',
    })
    downloadBlob(blob, buildFilename('canvas-project', 'json'))
    toast.success(t('messages.projectExported'))
  }

  const exportPng = () => {
    const editor = canvasRef.current
    if (!editor) return

    const dataUrl = buildCroppedDataUrl(editor)
    if (!dataUrl) {
      toast.error('画板为空，无法导出')
      return
    }

    downloadDataUrl(dataUrl, buildFilename('canvas-export', 'png'))
    toast.success(t('messages.pngExported'))
  }

  const saveToProject = async () => {
    const editor = canvasRef.current
    if (!editor) return
    if (!selectedProjectId) {
      toast.error(t('errors.projectRequired'))
      return
    }

    const dataUrl = buildCroppedDataUrl(editor)
    if (!dataUrl) {
      toast.error('画板为空，无法保存')
      return
    }

    setSavingToProject(true)
    try {
      const baseName =
        sanitizeFileSegment(projectAssetTitle) || buildFilename('canvas-artwork', 'png')
      const fileName = baseName.toLowerCase().endsWith('.png')
        ? baseName
        : `${baseName}.png`

      const file = await dataUrlToFile(dataUrl, fileName)
      const result = await projectsService.uploadProjectAssets(selectedProjectId, 'image', [file])
      const uploadedAsset = result.assets[0]
      const normalizedTitle = projectAssetTitle.trim()

      if (uploadedAsset && normalizedTitle) {
        await projectsService.updateProjectAsset(selectedProjectId, uploadedAsset.id, {
          title: normalizedTitle,
        })
      }

      const targetProject = projects.find((project) => project.id === selectedProjectId)
      setProjects((prev) =>
        prev.map((project) =>
          project.id === selectedProjectId
            ? { ...project, assetCount: project.assetCount + 1 }
            : project
        )
      )

      toast.success(
        t('messages.savedToProject', {
          project: targetProject?.name || selectedProjectId,
        })
      )
    } catch {
      toast.error(t('errors.saveToProjectFailed'))
    } finally {
      setSavingToProject(false)
    }
  }

  const restoreHistory = async (direction: 'undo' | 'redo') => {
    const nextIndex =
      direction === 'undo' ? historyIndexRef.current - 1 : historyIndexRef.current + 1

    if (nextIndex < 0 || nextIndex >= historyRef.current.length) return

    historyIndexRef.current = nextIndex
    updateHistoryFlags()
    await applySerializedProject(historyRef.current[nextIndex])
  }

  const handleProjectImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const raw = await file.text()
      const snapshot = JSON.stringify(normalizeProjectPayload(JSON.parse(raw)))
      await applySerializedProject(snapshot)
      pushHistorySnapshot()
      toast.success(t('messages.projectImported'))
    } catch {
      toast.error(t('errors.projectImportFailed'))
    }
  }

  useEffect(() => {
    let disposed = false

    const initCanvas = async () => {
      if (!canvasElementRef.current) return

      try {
        const fabricModule = (await import('fabric')) as FabricModule
        if (disposed || !canvasElementRef.current) return

        fabricModuleRef.current = fabricModule

        const editor = new fabricModule.Canvas(canvasElementRef.current, {
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundColor: 'transparent',
          preserveObjectStacking: true,
          selection: true,
        })

        editor.selectionColor = 'rgba(129, 140, 248, 0.12)'
        editor.selectionBorderColor = 'rgba(129, 140, 248, 0.95)'
        editor.selectionLineWidth = 1.5
        editor.selectionDashArray = [10, 6]

        canvasRef.current = editor

        const handleResize = () => {
          editor.setDimensions({
            width: window.innerWidth,
            height: window.innerHeight,
          })
          editor.requestRenderAll()
          setBoardSize({
            width: window.innerWidth,
            height: window.innerHeight,
          })
        }

        const handleMutation = () => {
          if (!isRestoringRef.current) pushHistorySnapshot()
        }

        const handleSelection = () => {
          updateCanvasStats(editor)
        }

        window.addEventListener('resize', handleResize)

        editor.on('object:added', handleMutation)
        editor.on('object:modified', handleMutation)
        editor.on('object:removed', handleMutation)
        editor.on('selection:created', handleSelection)
        editor.on('selection:updated', handleSelection)
        editor.on('selection:cleared', handleSelection)

        pushHistorySnapshot()
        updateCanvasStats(editor)
        setBoardSize({
          width: editor.getWidth(),
          height: editor.getHeight(),
        })
        return () => {
          window.removeEventListener('resize', handleResize)
          editor.off('object:added', handleMutation)
          editor.off('object:modified', handleMutation)
          editor.off('object:removed', handleMutation)
          editor.off('selection:created', handleSelection)
          editor.off('selection:updated', handleSelection)
          editor.off('selection:cleared', handleSelection)
          editor.dispose()
          canvasRef.current = null
        }
      } catch {
        toast.error(t('errors.initFailed'))
      }
    }

    let teardown: (() => void) | undefined
    initCanvas().then((cleanup) => {
      if (disposed) {
        cleanup?.()
        return
      }
      teardown = cleanup
    })

    return () => {
      disposed = true
      teardown?.()
    }
  }, [t])

  useEffect(() => {
    if (!isReady) return

    let active = true
    setProjectsLoading(true)

    projectsService
      .getProjects()
      .then((data) => {
        if (!active) return
        setProjects(data)
        setSelectedProjectId((current) => {
          if (current && data.some((project) => project.id === current)) {
            return current
          }
          return data[0]?.id || ''
        })
      })
      .catch(() => {
        if (!active) return
        toast.error(t('errors.loadProjectsFailed'))
      })
      .finally(() => {
        if (!active) return
        setProjectsLoading(false)
      })

    return () => {
      active = false
    }
  }, [isReady, t])

  useEffect(() => {
    const editor = canvasRef.current
    const fabricModule = fabricModuleRef.current
    if (!editor || !fabricModule) return

    if (toolMode === 'select') {
      editor.isDrawingMode = false
      editor.selection = true
      editor.defaultCursor = 'default'
      editor.requestRenderAll()
      return
    }

    editor.discardActiveObject()
    editor.selection = false
    editor.isDrawingMode = true
    editor.freeDrawingBrush = toolMode === 'erase'
      ? createTrueEraserBrush(fabricModule, editor, brushSize)
      : (() => {
          const brush = new fabricModule.PencilBrush(editor)
          brush.width = brushSize
          brush.color = brushColor
          brush.decimate = 0
          brush.strokeLineCap = 'round'
          brush.strokeLineJoin = 'round'
          brush.limitedToCanvasSize = true
          return brush
        })()
    editor.defaultCursor = 'crosshair'
    editor.freeDrawingCursor = 'crosshair'
    editor.contextTopDirty = true
    editor.requestRenderAll()
    updateCanvasStats(editor)
  }, [brushColor, brushSize, toolMode])

  const handleWorkspaceMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (toolMode !== 'select' || event.button !== 1) return

    const workspace = workspaceRef.current
    if (!workspace) return

    event.preventDefault()

    const bounds = workspace.getBoundingClientRect()
    const startX = event.clientX - bounds.left
    const startY = event.clientY - bounds.top

    setMiddleSelection({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    })

    const editor = canvasRef.current
    if (editor) {
      editor.discardActiveObject()
      editor.requestRenderAll()
      updateCanvasStats(editor)
    }

  }

  const handleWorkspaceMouseMoveCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!middleSelectionRectRef.current || (event.buttons & 4) !== 4) return

    const workspace = workspaceRef.current
    if (!workspace) return

    const bounds = workspace.getBoundingClientRect()
    const currentX = event.clientX - bounds.left
    const currentY = event.clientY - bounds.top

    setMiddleSelection({
      ...middleSelectionRectRef.current,
      currentX,
      currentY,
    })
  }

  const handleWorkspaceMouseUpCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!middleSelectionRectRef.current || event.button !== 1) return

    event.preventDefault()

    const currentRect = middleSelectionRectRef.current
    setMiddleSelection(null)

    if (currentRect) {
      applyRectSelection(currentRect)
    }
  }

  const selectionOverlayStyle = middleSelectionRect
    ? {
        left: Math.min(middleSelectionRect.startX, middleSelectionRect.currentX),
        top: Math.min(middleSelectionRect.startY, middleSelectionRect.currentY),
        width: Math.abs(middleSelectionRect.currentX - middleSelectionRect.startX),
        height: Math.abs(middleSelectionRect.currentY - middleSelectionRect.startY),
      }
    : null

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const currentRect = middleSelectionRectRef.current
      if (!currentRect || (event.buttons & 4) !== 4) return

      const workspace = workspaceRef.current
      if (!workspace) return

      event.preventDefault()
      const bounds = workspace.getBoundingClientRect()
      const currentX = event.clientX - bounds.left
      const currentY = event.clientY - bounds.top

      setMiddleSelection({
        ...currentRect,
        currentX,
        currentY,
      })
    }

    const handleWindowMouseUp = (event: MouseEvent) => {
      const currentRect = middleSelectionRectRef.current
      if (!currentRect || event.button !== 1) return

      event.preventDefault()
      setMiddleSelection(null)
      applyRectSelection(currentRect)
    }

    const handleWindowBlur = () => {
      if (!middleSelectionRectRef.current) return
      setMiddleSelection(null)
    }

    window.addEventListener('mousemove', handleWindowMouseMove, true)
    window.addEventListener('mouseup', handleWindowMouseUp, true)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove, true)
      window.removeEventListener('mouseup', handleWindowMouseUp, true)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable

      if (isTypingTarget) return

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        getSelectedObjects().length > 0
      ) {
        event.preventDefault()
        deleteSelection()
        return
      }

      const isModKey = event.metaKey || event.ctrlKey
      if (!isModKey) return

      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault()
        void restoreHistory('redo')
        return
      }

      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        void restoreHistory('undo')
        return
      }

      if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        void restoreHistory('redo')
      }
    }

    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  const modeButtons = [
    {
      key: 'select' as const,
      label: t('tools.select'),
      icon: MousePointer2,
      active: toolMode === 'select',
      onClick: () => setToolMode('select'),
    },
    {
      key: 'draw' as const,
      label: t('tools.brush'),
      icon: Brush,
      active: toolMode === 'draw',
      onClick: () => setToolMode('draw'),
    },
    {
      key: 'erase' as const,
      label: t('tools.eraser'),
      icon: Eraser,
      active: toolMode === 'erase',
      onClick: () => setToolMode('erase'),
    },
  ]

  const insertButtons = [
    {
      key: 'rectangle' as const,
      label: t('tools.rectangle'),
      icon: Square,
      onClick: () => insertShape('rectangle'),
    },
    {
      key: 'circle' as const,
      label: t('tools.circle'),
      icon: CircleIcon,
      onClick: () => insertShape('circle'),
    },
    {
      key: 'line' as const,
      label: t('tools.line'),
      icon: Minus,
      onClick: () => insertShape('line'),
    },
    {
      key: 'text' as const,
      label: t('tools.text'),
      icon: Type,
      onClick: () => insertShape('text'),
    },
  ]

  const toolLabel =
    toolMode === 'draw'
      ? t('tools.brush')
      : toolMode === 'erase'
        ? t('tools.eraser')
        : t('tools.select')

  return (
    <PageTransition className={cn(styles.root, !isDarkTheme && styles.lightTheme)}>
      <div
        ref={workspaceRef}
        className={styles.canvasWorkspace}
        onMouseDownCapture={handleWorkspaceMouseDownCapture}
        onMouseMoveCapture={handleWorkspaceMouseMoveCapture}
        onMouseUpCapture={handleWorkspaceMouseUpCapture}
        onAuxClick={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
        onContextMenu={(event) => {
          if (middleSelectionRectRef.current || event.button === 1) {
            event.preventDefault()
          }
        }}
      >
        <canvas ref={canvasElementRef} />
        {selectionOverlayStyle ? (
          <div className={styles.middleSelectionBox} style={selectionOverlayStyle} />
        ) : null}
      </div>

      <div
        className={cn(styles.glassPanel, styles.toolbarTop, dragTop.isDragging && styles.dragging)}
        style={{
          transform: `translate(calc(-50% + ${dragTop.offset.x}px), ${dragTop.offset.y}px)`,
        }}
        {...dragTop.handlers}
      >
        {modeButtons.map((button) => {
          const Icon = button.icon
          return (
            <button
              key={button.key}
              type="button"
              title={button.label}
              onClick={button.onClick}
              className={cn(styles.iconBtn, button.active && styles.iconBtnActive)}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          )
        })}

        <div className={styles.dividerV} />

        {insertButtons.map((button) => {
          const Icon = button.icon
          return (
            <button
              key={button.key}
              type="button"
              title={button.label}
              onClick={button.onClick}
              className={styles.iconBtn}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          styles.glassPanel,
          styles.toolbarActions,
          dragActions.isDragging && styles.dragging
        )}
        style={{ transform: `translate(${dragActions.offset.x}px, ${dragActions.offset.y}px)` }}
        {...dragActions.handlers}
      >
        <button
          type="button"
          title={t('actions.undo')}
          onClick={() => void restoreHistory('undo')}
          disabled={!canUndo}
          className={styles.iconBtn}
        >
          <Undo2 className="h-[16px] w-[16px]" strokeWidth={2} />
        </button>

        <button
          type="button"
          title={t('actions.redo')}
          onClick={() => void restoreHistory('redo')}
          disabled={!canRedo}
          className={styles.iconBtn}
        >
          <Redo2 className="h-[16px] w-[16px]" strokeWidth={2} />
        </button>

        <div className={styles.dividerV} />

        <button
          type="button"
          title={t('actions.clear')}
          onClick={clearCanvas}
          className={cn(styles.btnText, styles.btnTextDanger)}
        >
          <Trash2 className="h-[14px] w-[14px]" strokeWidth={2} />
          {t('actions.clear')}
        </button>
      </div>

      <div
        className={cn(
          styles.glassPanel,
          styles.inspectorPanel,
          dragInspector.isDragging && styles.dragging
        )}
        style={{
          transform: `translate(${dragInspector.offset.x}px, ${dragInspector.offset.y}px)`,
        }}
        {...dragInspector.handlers}
      >
        <div className={styles.panelTitle}>外观 (Appearance)</div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>{t('style.stroke')}</span>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => {
              setBrushColor(e.target.value)
              applyColorToSelection('stroke', e.target.value)
            }}
            className={styles.colorPicker}
          />
        </div>

        <div className={styles.propRow}>
          <span className={styles.propLabel}>{t('style.fill')}</span>
          <input
            type="color"
            value={fillColor === 'transparent' ? '#ffffff' : fillColor}
            onChange={(e) => {
              setFillColor(e.target.value)
              applyColorToSelection('fill', e.target.value)
            }}
            className={styles.colorPicker}
            style={{
              backgroundColor: fillColor === 'transparent' ? 'transparent' : fillColor,
              borderStyle: fillColor === 'transparent' ? 'dashed' : 'solid',
            }}
          />
        </div>

        <div className={styles.sliderContainer}>
          <div className={styles.sliderHeader}>
            <span className={styles.propLabel}>{t('style.brushSize')}</span>
            <span className={styles.sliderValue}>{brushSize}px</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={brushSize}
            onChange={(e) => {
              const value = Number(e.target.value)
              setBrushSize(value)
              applyStrokeWidthToSelection(value)
            }}
            className={styles.rangeInput}
          />
        </div>

        <div className={styles.dividerH} />

        <div className={styles.panelTitle}>项目 (Project)</div>

        <div className={styles.actionGroup}>
          <button
            type="button"
            onClick={() => projectInputRef.current?.click()}
            className={styles.btnOutline}
          >
            <FileJson className="h-4 w-4" strokeWidth={2} />
            {t('actions.importProject')}
          </button>

          <button type="button" onClick={exportProject} className={styles.btnOutline}>
            <Download className="h-4 w-4" strokeWidth={2} />
            {t('actions.exportProject')}
          </button>

          <button type="button" onClick={exportPng} className={styles.btnPrimary}>
            <FileImage className="h-4 w-4" strokeWidth={2} />
            智能裁剪导出 PNG
          </button>
        </div>

        <div className={cn(styles.dividerH, styles.projectSaveBlock)} />

        <div className={styles.panelTitle}>{t('actions.saveToProject')}</div>

        {!isReady ? (
          <p className={styles.projectHint}>{t('projectImport.loading')}</p>
        ) : (
          <>
            <div className={styles.projectField}>
              <EnhancedSelect
                label={t('projectImport.projectLabel')}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                options={[
                  {
                    value: '',
                    label: t('projectImport.projectPlaceholder'),
                  },
                  ...projects.map((project): EnhancedSelectOption => ({
                    value: project.id,
                    label: project.name,
                  })),
                ]}
                className="w-full"
                disabled={projectsLoading || projects.length === 0}
              />
            </div>

            <input
              type="text"
              value={projectAssetTitle}
              onChange={(event) => setProjectAssetTitle(event.target.value)}
              placeholder={t('projectImport.assetTitlePlaceholder')}
              className={styles.projectInput}
            />

            <button
              type="button"
              onClick={saveToProject}
              disabled={
                savingToProject ||
                projectsLoading ||
                projects.length === 0 ||
                !selectedProjectId
              }
              className={styles.btnPrimary}
              style={{ marginTop: 12 }}
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              {savingToProject ? t('projectImport.loading') : '保存选区至项目'}
            </button>

            <Link href={`/${locale}/projects`} className={styles.secondaryLink}>
              {t('projectImport.manage')}
            </Link>
          </>
        )}
      </div>

      <div
        className={cn(styles.glassPanel, styles.statusBar, dragStatus.isDragging && styles.dragging)}
        style={{ transform: `translate(${dragStatus.offset.x}px, ${dragStatus.offset.y}px)` }}
        {...dragStatus.handlers}
      >
        <div className={styles.statusItem}>
          工具: <span className={styles.statusVal}>{toolLabel}</span>
        </div>
        <div className={styles.dividerV} style={{ height: 10 }} />
        <div className={styles.statusItem}>
          对象数量: <span className={styles.statusVal}>{objectCount}</span>
        </div>
        <div className={styles.dividerV} style={{ height: 10 }} />
        <div className={styles.statusItem}>
          画布: <span className={styles.statusVal}>{boardSize.width} × {boardSize.height}</span>
        </div>
      </div>

      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleProjectImport}
        style={{ display: 'none' }}
      />
    </PageTransition>
  )
}
