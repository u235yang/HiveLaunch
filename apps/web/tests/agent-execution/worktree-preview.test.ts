import { describe, expect, it } from 'vitest'
import {
  detectPreviewLanguageClass,
  formatWorktreePreviewContent,
  isMarkdownPreview,
} from '@/features/agent-execution/lib/worktree-preview'

describe('worktree-preview', () => {
  it('formats json preview content', () => {
    const content = formatWorktreePreviewContent({
      path: 'package.json',
      content: '{"name":"bee","private":true}',
      truncated: false,
      isBinary: false,
      size: 20,
      language: 'json',
    })
    expect(content).toContain('\n')
    expect(content).toContain('"name": "bee"')
  })

  it('keeps original content when json is invalid', () => {
    const content = formatWorktreePreviewContent({
      path: 'bad.json',
      content: '{"name":',
      truncated: false,
      isBinary: false,
      size: 8,
      language: 'json',
    })
    expect(content).toBe('{"name":')
  })

  it('returns plaintext class by default', () => {
    expect(detectPreviewLanguageClass(null)).toBe('plaintext')
    expect(detectPreviewLanguageClass('ts')).toBe('ts')
  })

  it('detects markdown by language and extension', () => {
    expect(isMarkdownPreview('md', 'README.txt')).toBe(true)
    expect(isMarkdownPreview('markdown', 'README.txt')).toBe(true)
    expect(isMarkdownPreview('txt', 'docs/guide.markdown')).toBe(true)
    expect(isMarkdownPreview('txt', 'docs/guide.mdx')).toBe(true)
    expect(isMarkdownPreview('txt', 'docs/guide.txt')).toBe(false)
  })
})
