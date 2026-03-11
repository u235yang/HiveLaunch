// F1: KanbanBoardHeader Component
// 看板头部工具栏 - 搜索、筛选、新建任务

'use client'

import { Search, Plus, Filter, Trash2, X, CheckSquare, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobile } from '@/hooks/use-mobile'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui'

// ==================== Types ====================

interface KanbanBoardHeaderProps {
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onCreateTask?: () => void
  // 选择模式相关
  selectionMode?: boolean
  selectedCount?: number
  onEnterSelectionMode?: () => void
  onExitSelectionMode?: () => void
  onBatchDelete?: () => void
  labels?: {
    searchPlaceholder: string
    selectedTasks: (count: number) => string
    deleteTasksTitle: (count: number) => string
    bulkDelete: string
    cancelSelection: string
    multiSelect: string
    newTask: string
    filterTasks: string
    multi: string
  }
  className?: string
}

// ==================== Component ====================

export function KanbanBoardHeader({
  searchQuery = '',
  onSearchChange,
  onCreateTask,
  selectionMode = false,
  selectedCount = 0,
  onEnterSelectionMode,
  onExitSelectionMode,
  onBatchDelete,
  labels = {
    searchPlaceholder: '搜索任务...',
    selectedTasks: (count) => `已选 ${count} 个任务`,
    deleteTasksTitle: (count) => `删除 ${count} 个任务`,
    bulkDelete: '批量删除',
    cancelSelection: '取消选择',
    multiSelect: '批量选择',
    newTask: '新建任务',
    filterTasks: '筛选任务',
    multi: '多选',
  },
  className,
}: KanbanBoardHeaderProps) {
  const isMobile = useMobile()

  return (
    <header
      className={cn(
        'h-16 flex-shrink-0 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
        'px-4 md:px-6 flex items-center justify-between gap-2',
        'z-10',
        className
      )}
    >
      {/* 左侧：搜索 */}
      <div className={cn(
        'flex items-center gap-4 md:gap-6',
        isMobile ? 'flex-1' : 'flex-1'
      )}>
        {/* 搜索框 - 移动端占满宽度 */}
        <div className={cn('relative', isMobile ? 'flex-1' : 'w-64')}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className={cn(
              'w-full bg-gray-50 dark:bg-gray-800 border-none rounded-full',
              'py-1.5 pl-9 pr-4 text-sm text-gray-900 dark:text-gray-100',
              'focus:ring-2 focus:ring-amber-500/20 focus:outline-none',
              'transition-all',
              'placeholder:text-gray-400 dark:placeholder:text-gray-500'
            )}
          />
        </div>
      </div>

      {/* 右侧：选择模式 UI 或普通 UI */}
      <div className="flex items-center gap-2 md:gap-4">
        {selectionMode ? (
          <>
            {/* 选择模式：显示已选数量和操作按钮 */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* 已选数量 - 移动端隐藏文字 */}
              {!isMobile && (
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {labels.selectedTasks(selectedCount)}
                </span>
              )}

              {/* 批量删除按钮 */}
              <button
                onClick={onBatchDelete}
                className={cn(
                  'px-2 md:px-3 py-1.5 rounded-lg text-sm font-medium',
                  'bg-red-50 hover:bg-red-100 text-red-600',
                  'border border-red-200 hover:border-red-300',
                  'transition-all flex items-center gap-1.5'
                )}
                title={isMobile ? labels.deleteTasksTitle(selectedCount) : labels.bulkDelete}
              >
                <Trash2 className="w-4 h-4" />
                {!isMobile && labels.bulkDelete}
              </button>

              {/* 退出选择模式 */}
              <button
                onClick={onExitSelectionMode}
                className={cn(
                  'p-2 rounded-lg border border-gray-200',
                  'text-gray-500 hover:text-gray-700 hover:border-gray-300',
                  'dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600',
                  'transition-all hover:bg-gray-50 dark:hover:bg-gray-800'
                )}
                title={labels.cancelSelection}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 移动端：折叠菜单 */}
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'p-2 rounded-lg border border-gray-200',
                      'text-gray-500 hover:text-gray-700 hover:border-gray-300',
                      'dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600',
                      'transition-all hover:bg-gray-50 dark:hover:bg-gray-800'
                    )}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEnterSelectionMode}>
                    <CheckSquare className="w-4 h-4 mr-2" />
                    {labels.multiSelect}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onCreateTask}
                    className="text-amber-600 focus:text-amber-600"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {labels.newTask}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                {/* 筛选按钮 */}
                <button
                  className={cn(
                    'p-2 rounded-lg border border-gray-200',
                    'text-gray-500 hover:text-gray-700 hover:border-gray-300',
                    'dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600',
                    'transition-all hover:bg-gray-50 dark:hover:bg-gray-800'
                  )}
                  title={labels.filterTasks}
                >
                  <Filter className="w-4 h-4" />
                </button>

                {/* 多选按钮 */}
                <button
                  onClick={onEnterSelectionMode}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium',
                    'border border-gray-200',
                    'text-gray-600 hover:text-gray-800 hover:border-gray-300',
                    'dark:border-gray-700 dark:text-gray-300 dark:hover:text-gray-100 dark:hover:border-gray-600',
                    'transition-all hover:bg-gray-50 dark:hover:bg-gray-800',
                    'flex items-center gap-1.5'
                  )}
                  title={labels.multiSelect}
                >
                  <CheckSquare className="w-4 h-4" />
                  {labels.multi}
                </button>

                {/* 新建任务按钮 */}
                <button
                  onClick={onCreateTask}
                  className={cn(
                    'bg-amber-500 hover:bg-amber-600 text-white',
                    'px-5 py-2 rounded-lg text-sm font-semibold',
                    'transition-all',
                    'shadow-sm shadow-amber-500/30',
                    'flex items-center gap-2'
                  )}
                >
                  <Plus className="w-[18px] h-[18px]" />
                  {labels.newTask}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </header>
  )
}
