/**
 * Check if a prompt is a slash command (e.g., /init, /pr-review)
 */
function isSlashCommandPrompt(prompt: string): boolean {
  const trimmed = prompt.trimStart()
  if (!trimmed.startsWith('/')) return false

  const match = /^\/([^\s/]+)(?:\s|$)/.exec(trimmed)
  if (!match) return false

  return true
}

/**
 * Build agent prompt with context parts.
 * Slash commands are passed through directly; other messages get context prepended.
 */
export function buildAgentPrompt(
  rawUserMessage: string,
  contextParts: (string | null | undefined)[]
) {
  const trimmed = rawUserMessage.trim()
  const isSlashCommand = !!trimmed && isSlashCommandPrompt(trimmed)

  const parts = isSlashCommand
    ? [trimmed]
    : [...contextParts, rawUserMessage].filter(Boolean)

  return {
    prompt: parts.join('\n\n'),
    isSlashCommand,
  }
}
