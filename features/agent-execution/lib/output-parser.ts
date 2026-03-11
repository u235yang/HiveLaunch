// F3: Output Parser - Agent 输出解析

export interface ParsedOutput {
  type: 'message' | 'tool_use' | 'error' | 'completion'
  content: string
  metadata?: Record<string, unknown>
}

export function parseAgentOutput(rawOutput: string): ParsedOutput[] {
  const results: ParsedOutput[] = []
  const lines = rawOutput.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Simple parsing logic - in real implementation, this would be more sophisticated
    if (trimmed.startsWith('[TOOL]')) {
      results.push({
        type: 'tool_use',
        content: trimmed.slice(6).trim(),
      })
    } else if (trimmed.startsWith('[ERROR]')) {
      results.push({
        type: 'error',
        content: trimmed.slice(7).trim(),
      })
    } else if (trimmed.startsWith('[DONE]')) {
      results.push({
        type: 'completion',
        content: trimmed.slice(6).trim(),
      })
    } else {
      results.push({
        type: 'message',
        content: trimmed,
      })
    }
  }

  return results
}

export function extractCodeBlocks(text: string): Array<{ language?: string; code: string }> {
  const blocks: Array<{ language?: string; code: string }> = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1],
      code: match[2].trim(),
    })
  }

  return blocks
}
