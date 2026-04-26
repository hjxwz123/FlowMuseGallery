import Link from '@/lib/compat/link'
import { Fragment } from 'react'
import { X } from 'lucide-react'

interface SiteTopNoticeBarProps {
  text: string
  onClose: () => void
}

type NoticeSegment =
  | {
      type: 'text'
      content: string
    }
  | {
      type: 'link'
      href: string
      label: string
      target?: string
      rel?: string
    }

const ANCHOR_TAG_REGEX = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  )
}

function normalizeText(value: string) {
  return stripHtml(value).replace(/\s+/g, ' ').trim()
}

function readAttribute(source: string, attributeName: string) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const match = source.match(pattern)
  return match?.[1] || match?.[2] || match?.[3] || ''
}

function normalizeHref(value: string) {
  const href = decodeHtmlEntities(value).trim()
  if (!href) return ''
  if (/^(javascript|data|vbscript):/i.test(href)) return ''
  return href
}

function parseNoticeSegments(text: string): NoticeSegment[] {
  const segments: NoticeSegment[] = []
  let lastIndex = 0

  for (const match of text.matchAll(ANCHOR_TAG_REGEX)) {
    const matchIndex = match.index ?? 0
    const fullMatch = match[0] || ''
    const attributes = match[1] || ''
    const innerHtml = match[2] || ''

    const before = normalizeText(text.slice(lastIndex, matchIndex))
    if (before) {
      segments.push({ type: 'text', content: before })
    }

    const href = normalizeHref(readAttribute(attributes, 'href'))
    const label = normalizeText(innerHtml)
    if (href && label) {
      const target = readAttribute(attributes, 'target') || undefined
      const rel = readAttribute(attributes, 'rel') || undefined
      segments.push({
        type: 'link',
        href,
        label,
        target,
        rel,
      })
    } else {
      const fallbackText = normalizeText(fullMatch)
      if (fallbackText) {
        segments.push({ type: 'text', content: fallbackText })
      }
    }

    lastIndex = matchIndex + fullMatch.length
  }

  const tail = normalizeText(text.slice(lastIndex))
  if (tail) {
    segments.push({ type: 'text', content: tail })
  }

  return segments
}

function isInternalHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//')
}

export function SiteTopNoticeBar({ text, onClose }: SiteTopNoticeBarProps) {
  const message = text.trim()
  if (!message) return null

  const segments = parseNoticeSegments(message)
  if (segments.length === 0) return null

  return (
    <div className="border-b border-stone-200 bg-white text-black dark:border-stone-800 dark:bg-black dark:text-white">
      <div className="relative mx-auto flex min-h-12 w-full max-w-7xl items-center justify-center px-14 py-3 md:px-16">
        <p className="max-w-full text-center text-sm font-medium leading-6 text-stone-950 dark:text-white">
          {segments.map((segment, index) => {
            if (segment.type === 'text') {
              return <Fragment key={`site-notice-text-${index}`}>{segment.content}</Fragment>
            }

            const content = (
              <span className="font-semibold underline decoration-current/40 underline-offset-4 transition-opacity hover:opacity-70">
                {segment.label}
              </span>
            )

            if (isInternalHref(segment.href)) {
              return (
                <Link
                  key={`site-notice-link-${index}`}
                  href={segment.href}
                  target={segment.target}
                  rel={segment.rel ?? (segment.target === '_blank' ? 'noopener noreferrer' : undefined)}
                  className="mx-1 inline-block align-baseline text-stone-950 dark:text-white"
                >
                  {content}
                </Link>
              )
            }

            return (
              <a
                key={`site-notice-link-${index}`}
                href={segment.href}
                target={segment.target}
                rel={segment.rel ?? (segment.target === '_blank' ? 'noopener noreferrer' : undefined)}
                className="mx-1 inline-block align-baseline text-stone-950 dark:text-white"
              >
                {content}
              </a>
            )
          })}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close notice"
          className="absolute right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-100 hover:text-black dark:border-stone-800 dark:bg-black dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
