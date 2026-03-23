import type { WorkspaceInfo } from '@/features/kanban/ui/TaskDetailPanel/TaskPanel'

export function pickInitialWorkspaceId(
  workspaces: WorkspaceInfo[],
  activeWorkspaceId?: string
): string | undefined {
  const activeWorkspaces = workspaces.filter((workspace) => !workspace.archived)

  if (activeWorkspaceId) {
    const preferred = activeWorkspaces.find((workspace) => workspace.id === activeWorkspaceId)
    if (preferred) {
      return preferred.id
    }
  }

  if (activeWorkspaces.length > 0) {
    return activeWorkspaces[0].id
  }

  if (workspaces.length > 0) {
    return workspaces[0].id
  }

  return undefined
}
