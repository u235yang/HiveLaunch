'use client'

import { CheckCircle, Circle, Clock, ListTodo, AlertCircle } from 'lucide-react'
import type { TodoItem, ToolStatus } from '@/features/agent-execution/types'
import { useUIStore } from '@/features/shared/store'

interface TodoToolUIProps {
  todos: TodoItem[]
  operation: string
  status: ToolStatus
}

function getStatusIcon(todoStatus: string) {
  switch (todoStatus.toLowerCase()) {
    case 'completed':
    case 'done':
      return <CheckCircle className="w-4 h-4 text-emerald-500" />
    case 'in_progress':
    case 'running':
      return <Clock className="w-4 h-4 text-blue-500" />
    case 'pending':
    case 'todo':
      return <Circle className="w-4 h-4 text-gray-400" />
    default:
      return <Circle className="w-4 h-4 text-gray-400" />
  }
}

function getStatusColor(todoStatus: string): string {
  switch (todoStatus.toLowerCase()) {
    case 'completed':
    case 'done':
      return 'bg-emerald-50 border-emerald-200'
    case 'in_progress':
    case 'running':
      return 'bg-blue-50 border-blue-200'
    case 'pending':
    case 'todo':
      return 'bg-gray-50 border-gray-200'
    default:
      return 'bg-gray-50 border-gray-200'
  }
}

function getOperationLabel(operation: string, txt: (zh: string, en: string) => string): string {
  switch (operation.toLowerCase()) {
    case 'create':
    case 'add':
      return txt('创建任务列表', 'Create task list')
    case 'update':
    case 'modify':
      return txt('更新任务列表', 'Update task list')
    case 'delete':
    case 'remove':
      return txt('删除任务列表', 'Delete task list')
    default:
      return txt('管理任务列表', 'Manage task list')
  }
}

function getPriorityBadge(priority?: string) {
  if (!priority) return null

  const getPriorityColor = () => {
    switch (priority.toLowerCase()) {
      case 'high':
      case 'urgent':
        return 'bg-red-100 text-red-700'
      case 'medium':
        return 'bg-amber-100 text-amber-700'
      case 'low':
        return 'bg-green-100 text-green-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor()}`}>
      {priority}
    </span>
  )
}

export function TodoToolUI({ todos, operation, status }: TodoToolUIProps) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const completedCount = todos.filter(
    (t) => t.status.toLowerCase() === 'completed' || t.status.toLowerCase() === 'done'
  ).length
  const progress = todos.length > 0 ? (completedCount / todos.length) * 100 : 0

  const config =
    status.status === 'success'
      ? { icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, color: 'text-emerald-500' }
      : status.status === 'failed'
        ? { icon: <AlertCircle className="w-4 h-4 text-red-500" />, color: 'text-red-500' }
        : { icon: <ListTodo className="w-4 h-4 text-blue-500" />, color: 'text-blue-500' }

  return (
    <div className="w-full max-w-[90%] my-2">
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {config.icon}
            <span className="text-sm font-medium text-gray-700">
              {getOperationLabel(operation, txt)}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            {completedCount}/{todos.length} {txt('已完成', 'completed')}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-200 rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Todo list */}
        <div className="space-y-2">
          {todos.map((todo, index) => (
            <div
              key={index}
              className={`flex items-start gap-2 p-2 border rounded-lg ${getStatusColor(todo.status)}`}
            >
              <div className="mt-0.5">{getStatusIcon(todo.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${
                      todo.status.toLowerCase() === 'completed' || todo.status.toLowerCase() === 'done'
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700'
                    }`}
                  >
                    {todo.content}
                  </span>
                  {getPriorityBadge(todo.priority)}
                </div>
                <span className="text-xs text-gray-400">{todo.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
