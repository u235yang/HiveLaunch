'use client'

import { ProjectSettingsPage } from '@/features/swarm-config/ui/ProjectSettingsPage'

interface ProjectSettingsPageWrapperProps {
  projectId: string
}

export function ProjectSettingsPageWrapper({ projectId }: ProjectSettingsPageWrapperProps) {
  return <ProjectSettingsPage />
}
