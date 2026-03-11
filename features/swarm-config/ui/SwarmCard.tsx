'use client'

import { Hexagon, Settings, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SwarmAccent = 'amber' | 'violet' | 'teal'

export interface SwarmSummary {
  id: string
  name: string
  description: string
  cli: string
  defaultModelId?: string | null // 默认模型
  agents: string[]
  skillsCount: number
  mcpsCount: number
  ohMyOpencode: string
  opencodeConfig: string
  skills: string[]
  uploadedSkills: string[]
  createdAt: string
  isActive: boolean
  accent: SwarmAccent
}

interface SwarmCardProps {
  swarm: SwarmSummary
  onActivate?: (id: string) => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

const accentStyles: Record<SwarmAccent, { border: string; icon: string; badge: string }> = {
  amber: {
    border: 'bg-amber-500',
    icon: 'bg-amber-100 text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  violet: {
    border: 'bg-violet-500',
    icon: 'bg-violet-100 text-violet-700',
    badge: 'bg-violet-100 text-violet-700 border-violet-200',
  },
  teal: {
    border: 'bg-teal-500',
    icon: 'bg-teal-100 text-teal-700',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
  },
}

export function SwarmCard({ swarm, onActivate, onEdit, onDelete }: SwarmCardProps) {
  const styles = accentStyles[swarm.accent]

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className={cn('absolute left-0 top-0 bottom-0 w-1', styles.border)} />
      <div className="p-6">
        <div className="flex items-start justify-between mb-4 pl-2">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', styles.icon)}>
              <Hexagon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-card-foreground">{swarm.name}</h3>
              <div className="mt-0.5 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span>{swarm.cli}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>默认 Agent: {swarm.agents[0] ?? '—'}</span>
                  <span className="text-muted-foreground/50">•</span>
                  <span>MCP: {swarm.mcpsCount}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  配置包：oh-my-opencode.jsonc / opencode.json / skills
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Skills: {swarm.skillsCount}（含上传 {swarm.uploadedSkills.length}）
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onEdit?.(swarm.id)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(swarm.id)}
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-6 pl-2">
          {swarm.agents.map((agent) => (
            <span
              key={agent}
              className={cn(
                'inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border',
                styles.badge
              )}
            >
              {agent}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-4 pl-2">
          {swarm.isActive ? (
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-medium text-emerald-600">当前激活</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onActivate?.(swarm.id)}
              className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-md hover:bg-amber-100"
            >
              激活此蜂群
            </button>
          )}
          <span className="text-[11px] text-muted-foreground">安装于 {swarm.createdAt}</span>
        </div>
      </div>
    </div>
  )
}
