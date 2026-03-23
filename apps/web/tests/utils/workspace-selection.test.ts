import { describe, expect, it } from 'vitest'
import { pickInitialWorkspaceId } from '@/features/kanban/lib/workspace-selection'
import type { WorkspaceInfo } from '@/features/kanban/ui/TaskDetailPanel/TaskPanel'

const baseWorkspace = {
  taskId: 'task-1',
  role: 'primary',
  sourceWorkspaceId: null,
  agentWorkingDir: '/tmp/ws',
  pinned: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  status: 'completed',
} as const satisfies Omit<WorkspaceInfo, 'id' | 'branch' | 'archived'>

describe('pickInitialWorkspaceId', () => {
  it('prefers active workspace when it is not archived', () => {
    const workspaces: WorkspaceInfo[] = [
      { ...baseWorkspace, id: 'ws-1', branch: 'feature/a', archived: false },
      { ...baseWorkspace, id: 'ws-2', branch: 'feature/b', archived: false },
    ]

    expect(pickInitialWorkspaceId(workspaces, 'ws-2')).toBe('ws-2')
  })

  it('falls back to first active workspace when active one is archived', () => {
    const workspaces: WorkspaceInfo[] = [
      { ...baseWorkspace, id: 'ws-archived', branch: 'feature/a', archived: true },
      { ...baseWorkspace, id: 'ws-active', branch: 'feature/b', archived: false },
    ]

    expect(pickInitialWorkspaceId(workspaces, 'ws-archived')).toBe('ws-active')
  })

  it('falls back to first archived workspace when no active workspace exists', () => {
    const workspaces: WorkspaceInfo[] = [
      { ...baseWorkspace, id: 'ws-archived-1', branch: 'feature/a', archived: true },
      { ...baseWorkspace, id: 'ws-archived-2', branch: 'feature/b', archived: true },
    ]

    expect(pickInitialWorkspaceId(workspaces, 'missing')).toBe('ws-archived-1')
  })

  it('returns undefined when no workspaces exist', () => {
    expect(pickInitialWorkspaceId([], 'ws-1')).toBeUndefined()
  })
})
