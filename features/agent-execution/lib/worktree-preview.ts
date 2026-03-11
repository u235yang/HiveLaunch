import type { WorktreeFilePreview } from './git-operations'

export function formatWorktreePreviewContent(preview: WorktreeFilePreview): string {
  const raw = preview.content ?? ''
  if (!raw) {
    return ''
  }

  if (preview.language === 'json') {
    try {
      const parsed = JSON.parse(raw)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return raw
    }
  }

  return raw
}

export function detectPreviewLanguageClass(language: string | null): string {
  if (!language) {
    return 'plaintext'
  }
  return language
}

export function isMarkdownPreview(language: string | null, filePath: string | null): boolean {
  const normalizedLanguage = (language ?? '').toLowerCase()
  if (['md', 'mdx', 'markdown', 'mkd', 'mdown'].includes(normalizedLanguage)) {
    return true
  }

  if (!filePath) {
    return false
  }

  const normalizedPath = filePath.toLowerCase()
  return normalizedPath.endsWith('.md') || normalizedPath.endsWith('.mdx') || normalizedPath.endsWith('.markdown')
}
