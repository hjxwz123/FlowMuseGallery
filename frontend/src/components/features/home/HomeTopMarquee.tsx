import Link from '@/lib/compat/link'
import { Fragment } from 'react'

interface HomeTopMarqueeProps {
  text: string
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

export function HomeTopMarquee({ text }: HomeTopMarqueeProps) {
  const message = text.trim()
  if (!message) return null

  const segments = parseNoticeSegments(message)
  if (segments.length === 0) return null

  return (
    <div className="border-b border-amber-200/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100 text-stone-800 dark:border-amber-900/40 dark:from-stone-950 dark:via-amber-950/30 dark:to-stone-950 dark:text-amber-100">
      <div className="mx-auto flex w-full max-w-6xl px-4 py-3 md:px-8">
        <p className="min-w-0 flex-1 break-words text-sm font-medium leading-6 text-stone-700 dark:text-amber-100/95">
          {segments.map((segment, index) => {
            if (segment.type === 'text') {
              return <Fragment key={`notice-text-${index}`}>{segment.content}</Fragment>
            }

            const content = (
              <span className="font-semibold text-amber-700 underline decoration-amber-400/80 underline-offset-4 transition-colors hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100">
                {segment.label}
              </span>
            )

            if (isInternalHref(segment.href)) {
              return (
                <Link
                  key={`notice-link-${index}`}
                  href={segment.href}
                  target={segment.target}
                  rel={segment.rel ?? (segment.target === '_blank' ? 'noopener noreferrer' : undefined)}
                  className="mx-1 inline-block align-baseline"
                >
                  {content}
                </Link>
              )
            }

            return (
              <a
                key={`notice-link-${index}`}
                href={segment.href}
                target={segment.target}
                rel={segment.rel ?? (segment.target === '_blank' ? 'noopener noreferrer' : undefined)}
                className="mx-1 inline-block align-baseline"
              >
                {content}
              </a>
            )
          })}
        </p>
      </div>
    </div>
  )
}
