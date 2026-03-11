'use client'

import { ListChecks, ChevronDown, Circle, Check, CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodoItem } from './types'

interface ChatTodoListProps {
  todos: TodoItem[]
  expanded?: boolean
  onToggle?: () => void
}

function getStatusIcon(status?: string) {
  const s = (status || '').toLowerCase()
  if (s === 'completed')
    return <Check aria-hidden className="h-4 w-4 text-emerald-500" />
  if (s === 'in_progress' || s === 'in-progress')
    return <CircleDot aria-hidden className="h-4 w-4 text-blue-500" />
  if (s === 'cancelled')
    return <Circle aria-hidden className="h-4 w-4 text-gray-400" />
  return <Circle aria-hidden className="h-4 w-4 text-gray-400" />
}

export function ChatTodoList({ todos, expanded, onToggle }: ChatTodoListProps) {
  return (
    <div className="text-sm">
      <div
        className="flex items-center gap-2 text-gray-500 cursor-pointer hover:text-gray-700"
        onClick={onToggle}
        role="button"
      >
        <ListChecks className="shrink-0 w-4 h-4" />
        <span className="flex-1">更新了 {todos.length} 个 TODO</span>
        <ChevronDown
          className={cn(
            'shrink-0 w-4 h-4 transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </div>
      {expanded && todos.length > 0 && (
        <ul className="pt-2 ml-6 space-y-1">
          {todos.map((todo, index) => (
            <li
              key={`${todo.content}-${index}`}
              className="flex items-start gap-2"
            >
              <span className="pt-0.5 h-4 w-4 flex items-center justify-center shrink-0">
                {getStatusIcon(todo.status)}
              </span>
              <span className="leading-5 break-words">
                {todo.status?.toLowerCase() === 'cancelled' ? (
                  <s className="text-gray-400">{todo.content}</s>
                ) : (
                  todo.content
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
