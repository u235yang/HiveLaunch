'use client'

import { memo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUIStore } from '@/features/shared/store'

interface MarkdownTextProps {
  text: string
}

function CopyButton({ text }: { text: string }) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
      title={txt('复制代码', 'Copy code')}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-300" />
      )}
    </button>
  )
}

export const MarkdownText = memo(function MarkdownText({ text }: MarkdownTextProps) {
  return (
    <div className="prose prose-sm max-w-none prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-a:text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const language = (className ?? '').replace('language-', '').trim()
            const code = String(children ?? '').replace(/\n$/, '')
            const isBlock = Boolean(className)

            if (!isBlock) {
              return (
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {children}
                </code>
              )
            }

            return (
              <div className="relative my-3">
                <div className="flex items-center justify-between rounded-t-lg border-b border-slate-700 bg-slate-800 px-4 py-2">
                  <span className="text-xs text-slate-300 font-mono">{language || 'text'}</span>
                </div>
                <pre className="overflow-x-auto rounded-b-lg bg-slate-900 p-4">
                  <code className={className}>{code}</code>
                </pre>
                <CopyButton text={code} />
              </div>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})
