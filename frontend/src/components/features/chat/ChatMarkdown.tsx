'use client'

import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { cn } from '@/lib/utils/cn'

interface ChatMarkdownProps {
  content: string
  isUser?: boolean
}

function normalizeMarkdownContent(raw: string) {
  let text = raw.replace(/\r\n/g, '\n')

  // Some upstream models escape new lines as plain text.
  if (text.includes('\\n')) {
    text = text.replace(/\\n/g, '\n')
  }

  // Support common LaTeX delimiters from multiple providers.
  text = text.replace(/\\\[((?:.|\n)+?)\\\]/g, (_, expr: string) => `$$${expr}$$`)
  text = text.replace(/\\\(((?:.|\n)+?)\\\)/g, (_, expr: string) => `$${expr}$`)

  return text
}

export function ChatMarkdown({ content, isUser = false }: ChatMarkdownProps) {
  const normalizedContent = normalizeMarkdownContent(content)
  if (!normalizedContent.trim()) return null

  return (
    <div
      className={cn(
        'chat-markdown max-w-none break-words text-[15px] leading-7',
        isUser ? 'text-current' : 'text-stone-800 dark:text-stone-100'
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code(props) {
            const { inline, className, children } = props as {
              inline?: boolean
              className?: string
              children?: ReactNode
            }

            if (inline) {
              return (
                <code
                  className={cn(
                    'rounded px-1 py-0.5 font-mono text-[0.85em]',
                    isUser
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100'
                  )}
                >
                  {children}
                </code>
              )
            }

            return (
              <code
                className={cn(
                  className,
                  'block overflow-x-auto rounded-lg p-3 font-mono text-xs',
                  isUser
                    ? 'border border-white/30 bg-white/15 text-white'
                    : 'border border-stone-200 bg-stone-50 text-stone-800 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100'
                )}
              >
                {children}
              </code>
            )
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>
          },
          ul({ children }) {
            return <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>
          },
          ol({ children }) {
            return <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'underline underline-offset-2',
                  isUser ? 'text-white/90' : 'text-aurora-purple'
                )}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  )
}
