// F1: KanbanColumn Component
// 看板列 - 展示特定状态的任务列表

'use client'

import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { TaskCard, Task, TaskStatus } from './TaskCard'
import { cn } from '@/lib/utils'

// ==================== Types ====================

interface KanbanColumnProps {
  status: TaskStatus
  tasks: Task[]
  onTaskClick?: (task: Task) => void
  onTaskMenuClick?: (task: Task, e: React.MouseEvent) => void
  onTaskDelete?: (task: Task) => void
  // 选择相关
  selectedTaskIds?: Set<string>
  onTaskSelect?: (task: Task, selected: boolean) => void
  onSelectAll?: (status: TaskStatus) => void
  // 是否显示选择模式
  selectionMode?: boolean
  headerActions?: ReactNode
  className?: string
}

// ==================== Column Configuration ====================

const columnConfig: Record<TaskStatus, {
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

// ==================== Component ====================

export function KanbanColumn({
  status,
  tasks,
  onTaskClick,
  onTaskMenuClick,
  onTaskDelete,
  selectedTaskIds,
  onTaskSelect,
  onSelectAll,
  selectionMode,
  headerActions,
  className,
}: KanbanColumnProps) {
  const t = useTranslations('kanbanColumn')
  const config = columnConfig[status]
  const title = t(`status.${status}`)
  const isEmpty = tasks.length === 0
  
  // 计算该列选中的数量
  const selectedCount = selectedTaskIds 
    ? tasks.filter(t => selectedTaskIds.has(t.id)).length
    : 0
  const allSelected = tasks.length > 0 && selectedCount === tasks.length

  // 设置 droppable 区域
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  })

  const handleSelectAll = () => {
    if (onSelectAll) {
      onSelectAll(status)
    }
  }

  return (
    <section
      className={cn(
        // 基础布局 - PRD: minmax(280px, 400px) 宽度
        'flex flex-col flex-shrink-0 h-full',
        // 默认宽度（可通过 className 覆盖）- 移动端全宽，桌面端固定
        'w-full min-w-0 md:min-w-[280px] md:max-w-[400px] md:w-[320px]',
        // 分隔线（移动端隐藏）
        'border-r border-gray-200/60 last:border-r-0 md:border-r dark:border-gray-800/70',
        // 背景色
        config.bgColor,
        className
      )}
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 px-4 py-4 flex items-center justify-between bg-inherit backdrop-blur-sm">
        {/* 左侧：全选复选框 + 状态标识 + 标题 + 计数 */}
        <div className="flex items-center gap-2">
          {/* 选择模式下显示全选复选框 */}
          {selectionMode && (
            <button
              onClick={handleSelectAll}
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                allSelected 
                  ? 'bg-amber-500 border-amber-500' 
                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
              )}
              title={allSelected ? t('unselectAll') : t('selectAll')}
            >
              {allSelected && <Check className="w-3 h-3 text-white" />}
            </button>
          )}
          
          {/* 状态圆点 */}
          <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
          
          {/* 状态名称 */}
          <span className="font-bold text-sm text-gray-700 dark:text-gray-200">
            {title}
          </span>
          
          {/* 任务计数 Badge */}
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-bold',
              config.badgeBg,
              config.badgeText
            )}
          >
            {selectionMode && selectedCount > 0 
              ? `${selectedCount}/${tasks.length}`
              : tasks.length
            }
          </span>
        </div>

        {/* 右侧：空占位，保持对齐 */}
        <div className="flex items-center gap-1">{headerActions}</div>
      </div>

      {/* 内容区域 */}
      <div 
        ref={setNodeRef}
        className={cn(
          'flex-1 overflow-y-auto px-4 space-y-3 pb-8 no-scrollbar transition-colors',
          isOver && 'bg-amber-50/50 dark:bg-amber-900/20'
        )}
      >
        {isEmpty ? (
          // 空状态
          <EmptyColumnState status={status} isOver={isOver} />
        ) : (
          // 任务列表
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={onTaskClick}
              onMenuClick={onTaskMenuClick}
              onDelete={onTaskDelete}
              isSelected={selectedTaskIds?.has(task.id)}
              onSelect={onTaskSelect}
              selectionMode={selectionMode}
            />
          ))
        )}
      </div>
    </section>
  )
}

// ==================== Empty State Component ====================

function EmptyColumnState({ status, isOver }: { status: TaskStatus; isOver?: boolean }) {
  const t = useTranslations('kanbanColumn')
  const isCancelled = status === 'cancelled'

  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 text-center h-full min-h-[200px] transition-colors",
      isOver && "bg-amber-100/30 dark:bg-amber-900/20 rounded-lg"
    )}>
      {isCancelled ? (
        <>
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
            <svg
              className="w-6 h-6 text-gray-300 dark:text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('cancelledEmpty')}</p>
        </>
      ) : (
        <div className={cn(
          "text-sm py-8 px-4 rounded-lg border-2 border-dashed transition-colors",
          isOver ? "text-amber-600 dark:text-amber-300 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20" : "text-gray-300 dark:text-gray-400 border-gray-200 dark:border-gray-700"
        )}>
          {isOver ? t('dropTaskHere') : t('dragTaskHere')}
        </div>
      )}
    </div>
  )
}
