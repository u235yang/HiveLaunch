'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Search, X, CheckCircle, Circle } from 'lucide-react'
import { resolveHttpUrl } from '../lib/api-config'
import { useUIStore } from '@/features/shared/store'

// Agent 信息类型（与后端 AgentInfo 对应）
interface AgentItem {
  id: string
  name: string
  description: string
  capabilities: string[]
  is_available: boolean
}

// Fallback: 预定义的 Agent 列表（当无法获取后端列表时使用）
const FALLBACK_AGENTS: AgentItem[] = [
  { id: 'opencode', name: 'OpenCode', description: 'OpenCode AI Programming Assistant', capabilities: ['session_fork', 'context_usage'], is_available: false },
  { id: 'claude', name: 'Claude', description: 'Anthropic Claude Code', capabilities: ['session_fork', 'context_usage'], is_available: false },
  { id: 'cursor', name: 'Cursor', description: 'AI-driven code editor', capabilities: ['setup_helper'], is_available: false },
  { id: 'qwen', name: 'Qwen', description: 'Alibaba Qwen', capabilities: ['session_fork'], is_available: false },
  { id: 'copilot', name: 'Copilot', description: 'GitHub Copilot', capabilities: [], is_available: false },
  { id: 'droid', name: 'Droid', description: 'Google AI for Android', capabilities: [], is_available: false },
  { id: 'gemini', name: 'Gemini', description: 'Google Gemini', capabilities: ['session_fork'], is_available: false },
  { id: 'amp', name: 'Amp', description: 'Anthropic AMP', capabilities: ['session_fork'], is_available: false },
]

/**
 * 从后端获取可用的 Agent 列表
 */
async function fetchAvailableAgents(): Promise<AgentItem[]> {
  try {
    const response = await fetch(resolveHttpUrl('/api/agents/available'))
    if (response.ok) {
      return await response.json()
    }
  } catch (e) {
    console.error('[AgentSelector] Failed to fetch agents from HTTP:', e)
  }
  return FALLBACK_AGENTS
}

interface AgentSelectorProps {
  value?: string
  onChange: (agentId: string) => void
  agents?: AgentItem[]
  placeholder?: string
  className?: string
}

export function AgentSelector({
  value,
  onChange,
  agents,
  placeholder = 'Select agent...',
  className = '',
}: AgentSelectorProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [loadedAgents, setLoadedAgents] = useState<AgentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 加载 Agent 列表
  useEffect(() => {
    async function loadAgents() {
      const fetched = await fetchAvailableAgents()
      setLoadedAgents(fetched)
      setIsLoading(false)
    }
    loadAgents()
  }, [])

  // 使用 props.agents 或加载的列表
  const agentList = agents || loadedAgents
  const selectedAgent = agentList.find((a) => a.id === value)

  const filteredAgents = agentList.filter(
    (agent) =>
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.id.toLowerCase().includes(search.toLowerCase()) ||
      agent.description.toLowerCase().includes(search.toLowerCase())
  )

  const handleSelect = useCallback(
    (agentId: string) => {
      onChange(agentId)
      setIsOpen(false)
      setSearch('')
    },
    [onChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((i) => Math.min(i + 1, filteredAgents.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filteredAgents[highlightedIndex]) {
            handleSelect(filteredAgents[highlightedIndex].id)
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSearch('')
          break
      }
    },
    [filteredAgents, highlightedIndex, handleSelect]
  )

  // 滚动到高亮项
  useEffect(() => {
    if (listRef.current && isOpen) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex, isOpen])

  // 重置高亮索引
  useEffect(() => {
    setHighlightedIndex(0)
  }, [search])

  return (
    <div className={`relative ${className}`}>
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 focus-within:ring-2 focus-within:ring-amber-500 focus-within:border-transparent dark:bg-gray-900 dark:border-gray-700 dark:hover:border-gray-600"
      >
        <Bot className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        {selectedAgent ? (
          <span className="flex-1 text-sm">
            <span className="font-medium text-amber-600">/{selectedAgent.id}</span>
            <span className="text-gray-500 dark:text-gray-400 ml-1">{selectedAgent.name}</span>
          </span>
        ) : (
          <span className="flex-1 text-sm text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden dark:bg-gray-900 dark:border-gray-700">
          {/* Search input */}
          <div className="p-2 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded dark:bg-gray-800">
              <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={txt('搜索 Agent...', 'Search agents...')}
                className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                </button>
              )}
            </div>
          </div>

          {/* Agent list */}
          <div ref={listRef} className="max-h-60 overflow-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                {txt('加载 Agent 中...', 'Loading agents...')}
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                {txt('未找到 Agent', 'No agents found')}
              </div>
            ) : (
              filteredAgents.map((agent, index) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelect(agent.id)}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    index === highlightedIndex ? 'bg-amber-50 dark:bg-amber-500/10' : ''
                  } ${agent.id === value ? 'bg-amber-100/50 dark:bg-amber-500/20' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-amber-600">
                        /{agent.id}
                      </span>
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{agent.name}</span>
                    </div>
                    {agent.is_available ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{agent.description}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setIsOpen(false)
            setSearch('')
          }}
        />
      )}
    </div>
  )
}

/**
 * 解析输入中的 Agent 命令
 * 格式: /agent-name 任务描述
 */
export function parseAgentCommand(input: string): {
  agentId: string | null
  prompt: string
} {
  const match = input.match(/^\/(\S+)\s*(.*)$/)
  if (match) {
    return {
      agentId: match[1],
      prompt: match[2].trim(),
    }
  }
  return {
    agentId: null,
    prompt: input.trim(),
  }
}

/**
 * 格式化 Agent 命令
 */
export function formatAgentCommand(agentId: string, prompt: string): string {
  if (!agentId) return prompt
  return `/${agentId} ${prompt}`
}
