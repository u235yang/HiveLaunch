'use client'

import { useEffect, useState } from 'react'
import { Hexagon, Plus, Check, Trash2 } from 'lucide-react'
import { Button } from '@shared/ui'
import { useProjectStore, useUIStore } from '@/features/shared/store'
import type { GlobalSwarmSummary } from './GlobalSwarmCard'
import { resolveHttpUrl } from '@/features/agent-execution/lib/api-config'

/**
 * 项目蜂群绑定摘要
 */
interface ProjectSwarmBinding {
  id: string
  projectId: string
  swarmTemplateId: string
  isActive: boolean
  boundAt: string | Date
  swarm: {
    id: string
    name: string
    description: string | null
    cli: string
    skillsCount: number
    agents: string[]
    mcpsCount: number
    accent: string | null
  }
}

/**
 * 项目蜂群绑定页面
 * 用于项目详情页中管理该项目绑定的蜂群
 */
interface ProjectSwarmBindingsPageProps {
  embedded?: boolean
}

export function ProjectSwarmBindingsPage({ embedded = false }: ProjectSwarmBindingsPageProps) {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const projectId = useProjectStore((state) => state.currentProject?.id)
  const [bindings, setBindings] = useState<ProjectSwarmBinding[]>([])
  const [availableSwarms, setAvailableSwarms] = useState<GlobalSwarmSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // 加载项目绑定的蜂群
  useEffect(() => {
    if (!projectId) return

    let active = true
    setIsLoading(true)
    setError(null)

    fetch(resolveHttpUrl(`/api/projects/${projectId}/swarm-bindings`))
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch bindings')
        return response.json()
      })
      .then((data: ProjectSwarmBinding[]) => {
        if (!active) return
        setBindings(data)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unknown error')
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [projectId])

  // 加载可用的全局蜂群
  useEffect(() => {
    let active = true

    fetch(resolveHttpUrl('/api/swarms'))
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch swarms')
        return response.json()
      })
      .then((data: GlobalSwarmSummary[]) => {
        if (!active) return
        setAvailableSwarms(data)
      })
      .catch((err) => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unknown error')
      })

    return () => {
      active = false
    }
  }, [])

  // 绑定蜂群到项目
  const handleBind = async (swarmTemplateId: string) => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(resolveHttpUrl(`/api/projects/${projectId}/swarm-bindings`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swarmTemplateId,
          isActive: bindings.length === 0, // 第一个绑定时默认激活
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to bind swarm')
      }

      const newBinding: ProjectSwarmBinding = await response.json()
      setBindings((prev) => [...prev, newBinding])
      setShowAddModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  // 激活蜂群
  const handleActivate = async (bindingId: string) => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(resolveHttpUrl(`/api/projects/${projectId}/swarm-bindings/${bindingId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activate: true }),
      })

      if (!response.ok) throw new Error('Failed to activate swarm')

      // 更新本地状态
      setBindings((prev) =>
        prev.map((b) => ({
          ...b,
          isActive: b.id === bindingId,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  // 解绑蜂群
  const handleUnbind = async (bindingId: string) => {
    if (!projectId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(resolveHttpUrl(`/api/projects/${projectId}/swarm-bindings/${bindingId}`), {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to unbind swarm')
      }

      setBindings((prev) => prev.filter((b) => b.id !== bindingId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  // 过滤出未绑定的蜂群
  const boundSwarmIds = new Set(bindings.map((b) => b.swarmTemplateId))
  const unboundSwarms = availableSwarms.filter((s) => !boundSwarmIds.has(s.id))

  return (
    <div className={`flex flex-col ${embedded ? '' : 'h-full'}`}>
      <div className={`flex items-center justify-between bg-card ${embedded ? 'rounded-lg border border-border px-4 py-3' : 'h-16 border-b border-border px-6'}`}>
        <div className="flex items-center gap-2">
          <Hexagon className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-lg font-bold text-foreground">{txt('项目蜂群', 'Project Swarms')}</h1>
        </div>
        <Button onClick={() => setShowAddModal(true)} disabled={!projectId || isLoading || unboundSwarms.length === 0}>
          <Plus className="w-4 h-4 mr-1" />
          {txt('添加蜂群', 'Add Swarm')}
        </Button>
      </div>

      <div className={embedded ? 'p-0 pt-4' : 'flex-1 overflow-y-auto p-6'}>
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        {!projectId ? (
          <p className="mb-4 text-sm text-muted-foreground">{txt('请先选择项目', 'Please select a project first')}</p>
        ) : isLoading && bindings.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">{txt('正在加载...', 'Loading...')}</p>
        ) : null}

        <p className="mb-6 text-sm text-muted-foreground">
          {txt('管理项目使用的 AI 蜂群。同一时间只能激活一个蜂群，激活的蜂群配置将被复制到项目目录。', 'Manage AI swarms for this project. Only one swarm can be active at a time, and active config is copied to project directory.')}
        </p>

        {bindings.length === 0 && !isLoading ? (
          <div className="py-12 text-center">
            <Hexagon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-muted-foreground">{txt('暂未绑定蜂群', 'No swarm bound')}</p>
            <p className="mb-4 text-sm text-muted-foreground">{txt('从平台蜂群库中选择一个蜂群绑定到项目', 'Select a swarm from library to bind')}</p>
            <Button onClick={() => setShowAddModal(true)} disabled={unboundSwarms.length === 0}>
              <Plus className="w-4 h-4 mr-1" />
              {txt('添加蜂群', 'Add Swarm')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {bindings.filter((b) => b.swarm).map((binding) => (
              <div
                key={binding.id}
                className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${binding.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                <div className="p-6 pl-7">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-card-foreground">{binding.swarm.name}</h3>
                      <p className="text-xs text-muted-foreground">{binding.swarm.cli}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUnbind(binding.id)}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        title={txt('解绑蜂群', 'Unbind Swarm')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {binding.swarm.agents.map((agent) => (
                      <span
                        key={agent}
                        className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      >
                        {agent}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-4">
                    {binding.isActive ? (
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-600">{txt('当前激活', 'Active')}</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleActivate(binding.id)}
                        disabled={isLoading}
                      >
                        {txt('激活', 'Activate')}
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {binding.swarm.skillsCount} skills • {binding.swarm.mcpsCount} MCP
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 添加蜂群弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[80dvh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-lg font-semibold text-card-foreground">{txt('从蜂群库选择', 'Select from Swarm Library')}</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60dvh]">
              {unboundSwarms.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {txt('所有蜂群已绑定到项目', 'All swarms already bound')}
                </p>
              ) : (
                <div className="space-y-3">
                  {unboundSwarms.map((swarm) => (
                    <div
                      key={swarm.id}
                      className="cursor-pointer rounded-lg border border-border p-4 transition-colors hover:border-ring/50"
                      onClick={() => handleBind(swarm.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-foreground">{swarm.name}</h3>
                          <p className="text-sm text-muted-foreground">{swarm.description || txt('无描述', 'No description')}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{swarm.cli}</span>
                            <span>•</span>
                            <span>{swarm.agents.length} agents</span>
                            <span>•</span>
                            <span>{swarm.skillsCount} skills</span>
                          </div>
                        </div>
                        <Button size="sm">{txt('添加', 'Add')}</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
