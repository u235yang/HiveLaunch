// F1: TaskCard Component
// 任务卡片 - 展示Agent执行会话的基本信息

'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui'
import { Bot, Loader2, XCircle, CheckCircle, MoreHorizontal, GripVertical, Trash2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useMobile } from '@/hooks/use-mobile'

// ==================== Types ====================

export type TaskStatus = 'todo' | 'inprogress' | 'pending' | 'done' | 'cancelled'

export interface Task {
  id: string
  projectId: string
  title: string | null
  description: string
  status: TaskStatus
  agentCli?: string // CLI 类型，如 'OPENCODE'
  agentId?: string
  modelId?: string // 使用的模型
  taskType?: 'normal' | 'direct'
  directBranch?: string
  imageIds?: string[]
  hasInProgressAttempt?: boolean
  lastAttemptFailed?: boolean
  createdAt: string
  updatedAt: string
}

interface TaskCardProps {
  task: Task
  onClick?: (task: Task) => void
  onMenuClick?: (task: Task, e: React.MouseEvent) => void
  onDelete?: (task: Task) => void
  isSelected?: boolean
  onSelect?: (task: Task, selected: boolean) => void
  selectionMode?: boolean
  className?: string
}

// ==================== Status Configuration ====================

const statusConfig: Record<TaskStatus, {
  dotColor: string
  bgColor: string
  badgeBg: string
  badgeText: string
}> = {
  todo: {
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50/30 dark:bg-blue-500/10',
    badgeBg: 'bg-blue-100/50 dark:bg-blue-500/20',
    badgeText: 'text-blue-600 dark:text-blue-300',
  },
  inprogress: {
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50/40 dark:bg-amber-500/10',
    badgeBg: 'bg-amber-100/50 dark:bg-amber-500/20',
    badgeText: 'text-amber-700 dark:text-amber-300',
  },
  pending: {
    dotColor: 'bg-violet-500',
    bgColor: 'bg-violet-50/30 dark:bg-violet-500/10',
    badgeBg: 'bg-violet-100/50 dark:bg-violet-500/20',
    badgeText: 'text-violet-700 dark:text-violet-300',
  },
  done: {
    dotColor: 'bg-emerald-500',
    bgColor: 'bg-emerald-50/30 dark:bg-emerald-500/10',
    badgeBg: 'bg-emerald-100/50 dark:bg-emerald-500/20',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
  },
  cancelled: {
    dotColor: 'bg-gray-400',
    bgColor: 'bg-gray-100/30 dark:bg-gray-700/30',
    badgeBg: 'bg-gray-200 dark:bg-gray-700',
    badgeText: 'text-gray-600 dark:text-gray-300',
  },
}

// ==================== Draggable Task Card ====================

export function TaskCard({
  task,
  onClick,
  onMenuClick,
  onDelete,
  isSelected,
  onSelect,
  selectionMode,
  className
}: TaskCardProps) {
  const t = useTranslations('taskCard')
  // 移动端检测
  const isMobile = useMobile()

  // 判断是否为进行中（显示 spinner + 禁用拖拽）
  const isRunning = task.hasInProgressAttempt || task.status === 'inprogress'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: {
      type: 'task',
      task,
    },
    disabled: isRunning, // 执行中禁止拖拽
  })

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined

  const config = statusConfig[task.status]
  
  // 获取显示标题
  const displayTitle = task.title || task.description.slice(0, 50) || t('untitledTask')
  
  // 获取描述预览
  const descriptionPreview = task.description.slice(0, 100)
  
  // 判断是否为完成状态（用于样式调整）
  const isDone = task.status === 'done'
  
  // 判断是否失败
  const isFailed = task.lastAttemptFailed

  const handleClick = () => {
    onClick?.(task)
  }

  // 处理卡片内容点击
  const handleCardClick = () => {
    if (selectionMode) {
      // 选择模式下，点击切换选中状态
      onSelect?.(task, !isSelected)
    } else {
      // 非选择模式下，打开详情
      onClick?.(task)
    }
  }

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMenuClick?.(task, e)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        // 基础样式
        'bg-white border rounded-xl shadow-sm dark:bg-gray-900 dark:border-gray-700',
        'transition-all duration-200 ease-out',
        'cursor-pointer group',
        // 边框颜色 - 根据状态变化
        task.status === 'inprogress' 
          ? 'border-amber-200 dark:border-amber-800' 
          : 'border-gray-200/80 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
        // Hover 效果
        'hover:shadow-md',
        // 完成状态的透明度
        isDone && 'opacity-80 hover:opacity-100',
        // 选中状态
        isSelected && 'ring-2 ring-amber-400 border-amber-400',
        // 拖拽状态
        isDragging && [
          'shadow-lg ring-2 ring-amber-400/50',
          'rotate-[2deg] scale-[1.02]',
          'opacity-90',
        ],
        className
      )}
    >
      {/* 拖拽手柄 + 内容区域 */}
      <div className="flex">
        {/* 拖拽手柄 / 选择模式复选框 */}
        <div
          {...listeners}
          className={cn(
            'flex items-center justify-center w-6 flex-shrink-0',
            selectionMode ? 'border-r border-gray-100 bg-amber-50/50 dark:border-gray-700 dark:bg-amber-900/20' : 'rounded-l-xl border-r border-gray-100 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/60',
            'transition-opacity',
            isRunning
              ? 'opacity-50 cursor-not-allowed'
              // 移动端始终显示拖拽手柄，桌面端 hover 显示
              : isMobile
                ? 'opacity-60 active:opacity-100 cursor-grab active:cursor-grabbing'
                : 'opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing',
            isDragging && 'opacity-100',
            selectionMode && 'opacity-100'
          )}
        >
          {selectionMode ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(task, !isSelected)
              }}
              className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                isSelected 
                  ? 'bg-amber-500 border-amber-500' 
                  : 'border-gray-300 bg-white hover:border-amber-400 dark:border-gray-600 dark:bg-gray-900 dark:hover:border-amber-500'
              )}
            >
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </button>
          ) : (
            <GripVertical className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          )}
        </div>
        
        {/* 内容区域 */}
        <div 
          className="flex-1 p-4 pl-3"
          onClick={handleCardClick}
        >
          {/* 标题 */}
          <h4 
            className={cn(
              'text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug mb-2',
              'transition-colors duration-150',
              'group-hover:text-amber-600 dark:group-hover:text-amber-300',
              // 完成状态添加删除线
              isDone && 'line-through decoration-gray-300 dark:decoration-gray-600'
            )}
          >
            {displayTitle}
          </h4>
          
          {/* 描述预览 */}
          {descriptionPreview && (
            <p 
              className={cn(
                'text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4',
                'line-clamp-2',
                // 完成状态添加删除线
                isDone && 'line-through decoration-gray-200 dark:decoration-gray-600'
              )}
            >
              {descriptionPreview}
            </p>
          )}
          
          {/* 底部区域 */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800">
            {/* 左侧：Agent 信息 */}
            <div className="flex items-center gap-2">
              <Bot 
                className={cn(
                  'w-4 h-4',
                  isRunning ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
                )} 
              />
              <span className={cn(
                'text-[11px] font-medium',
                isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-600 dark:text-gray-300'
              )}
              >
                {task.agentCli || 'OPENCODE'}
              </span>
            </div>
            
            {/* 右侧：状态指示或菜单 */}
            <div className="flex items-center gap-1">
              {isRunning ? (
                // 运行中状态
                <div className="flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wide">
                    {t('running')}
                  </span>
                </div>
              ) : isFailed ? (
                // 失败状态
                <div className="flex items-center gap-1">
                  <XCircle className="w-4 h-4 text-red-500" />
                </div>
              ) : isDone ? (
                // 完成状态
                <div className="flex items-center gap-1">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </div>
              ) : (
                // 默认菜单按钮 - 使用 Popover 包裹
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    sideOffset={5}
                    className="w-40 p-1"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete?.(task)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-300 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('deleteTask')}
                    </button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== Drag Overlay Card ====================
// 拖拽时显示的卡片预览

interface DragOverlayCardProps {
  task: Task
}

export function DragOverlayCard({ task }: DragOverlayCardProps) {
  const t = useTranslations('taskCard')
  const displayTitle = task.title || task.description.slice(0, 50) || t('untitledTask')
  
  return (
    <div
      className={cn(
        'bg-white border rounded-xl p-4 shadow-lg',
        'ring-2 ring-amber-400/50',
        'rotate-[2deg] scale-[1.02]',
        'border-gray-200/80',
      )}
    >
      <h4 className="text-sm font-bold text-gray-900 leading-snug mb-1">
        {displayTitle}
      </h4>
      <p className="text-xs text-gray-500">
        {task.agentCli || 'OPENCODE'}
      </p>
    </div>
  )
}

// ==================== Utility Functions ====================

export function getStatusLabel(status: TaskStatus): string {
  return status
}

export function getStatusColors(status: TaskStatus) {
  return statusConfig[status] || statusConfig.todo
}
