import { describe, expect, it } from 'vitest'
import { pickRecoverySession } from '@/features/agent-execution/lib/session-recovery'
import type { Session } from '@/features/agent-execution/types/execution-process'

const makeSession = (
  id: string,
  status: Session['status'],
  updated_at: string
): Session => ({
  id,
  workspace_id: 'ws-1',
  executor: 'OPENCODE',
  status,
  attempt_no: 1,
  parent_session_id: null,
  created_at: updated_at,
  updated_at,
})

describe('pickRecoverySession', () => {
  it('prefers active session when present', () => {
    const sessions = [
      makeSession('sess-1', 'closed', '2024-01-01T00:00:00.000Z'),
      makeSession('sess-2', 'running', '2024-01-01T01:00:00.000Z'),
    ]

    expect(pickRecoverySession(sessions, 'sess-1')?.id).toBe('sess-1')
  })

  it('falls back to latest open session', () => {
    const sessions = [
      makeSession('sess-1', 'closed', '2024-01-01T03:00:00.000Z'),
      makeSession('sess-2', 'inreview', '2024-01-01T02:00:00.000Z'),
      makeSession('sess-3', 'running', '2024-01-01T01:00:00.000Z'),
    ]

    expect(pickRecoverySession(sessions)?.id).toBe('sess-2')
  })

  it('falls back to latest session when all sessions are closed', () => {
    const sessions = [
      makeSession('sess-1', 'closed', '2024-01-01T01:00:00.000Z'),
      makeSession('sess-2', 'closed', '2024-01-01T02:00:00.000Z'),
    ]

    expect(pickRecoverySession(sessions)?.id).toBe('sess-2')
  })

  it('returns undefined for empty sessions', () => {
    expect(pickRecoverySession([])).toBeUndefined()
  })
})
