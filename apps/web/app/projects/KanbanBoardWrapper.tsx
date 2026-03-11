'use client'

import { KanbanBoard } from '@/components/kanban/KanbanBoard'

interface KanbanBoardWrapperProps {
  projectId: string
}

export function KanbanBoardWrapper({ projectId }: KanbanBoardWrapperProps) {
  return <KanbanBoard projectId={projectId} />
}
