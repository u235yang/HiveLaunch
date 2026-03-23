import type { Session } from '@/features/agent-execution/types/execution-process'

function getSessionTimestamp(session: Session): number {
  const raw =
    session.updatedAt ??
    session.updated_at ??
    session.createdAt ??
    session.created_at

  return raw ? new Date(raw).getTime() : 0
}

export function pickRecoverySession(
  sessions: Session[],
  activeSessionId?: string
): Session | undefined {
  if (sessions.length === 0) {
    return undefined
  }

  if (activeSessionId) {
    const preferred = sessions.find((session) => session.id === activeSessionId)
    if (preferred) {
      return preferred
    }
  }

  const sortByUpdatedAtDesc = (items: Session[]) =>
    [...items].sort((a, b) => getSessionTimestamp(b) - getSessionTimestamp(a))

  const latestOpen = sortByUpdatedAtDesc(
    sessions.filter((session) => session.status !== 'closed')
  )[0]

  return latestOpen ?? sortByUpdatedAtDesc(sessions)[0]
}
