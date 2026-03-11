// features/kanban/ui/TaskDetailLayout.tsx
'use client'

import React, { useState } from 'react'
import { useMobile } from '@/hooks/use-mobile'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/ui'
import { FolderKanban, MessageSquare, GitCompare } from 'lucide-react'
import { useUIStore } from '@/features/shared/store'

interface TaskDetailLayoutProps {
  header: React.ReactNode
  taskPanel: React.ReactNode
  attemptPanel: React.ReactNode
  diffsPanel: React.ReactNode
}

const TaskDetailLayout: React.FC<TaskDetailLayoutProps> = ({
  header,
  taskPanel,
  attemptPanel,
  diffsPanel,
}) => {
  const locale = useUIStore((state) => state.locale)
  const isEn = locale === 'en-US'
  const txt = (zh: string, en: string) => (isEn ? en : zh)
  const isMobile = useMobile()
  const [mobileTab, setMobileTab] = useState<'task' | 'attempt' | 'diffs'>('attempt')

  if (isMobile) {
    // 移动端：使用标签页切换
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
        {header}
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as typeof mobileTab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0 h-12 w-full flex overflow-x-auto no-scrollbar rounded-none border-b border-border bg-card">
            <TabsTrigger
              value="task"
              className="flex-shrink-0 min-w-[70px] flex items-center gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <FolderKanban className="w-4 h-4" />
              <span className="text-xs">{txt('任务', 'Task')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="attempt"
              className="flex-shrink-0 min-w-[70px] flex items-center gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-xs">{txt('执行', 'Execution')}</span>
            </TabsTrigger>
            <TabsTrigger
              value="diffs"
              className="flex-shrink-0 min-w-[70px] flex items-center gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              <GitCompare className="w-4 h-4" />
              <span className="text-xs">{txt('代码', 'Code')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="task" className="flex-1 m-0 p-0 overflow-y-auto">
            {taskPanel}
          </TabsContent>
          <TabsContent value="attempt" className="flex-1 m-0 p-0 overflow-y-auto">
            {attemptPanel}
          </TabsContent>
          <TabsContent value="diffs" className="flex-1 m-0 p-0 overflow-y-auto">
            {diffsPanel}
          </TabsContent>
        </Tabs>
      </div>
    )
  }

  // 桌面端：三栏布局
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {header}
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-[260px] shrink-0 border-r border-border bg-muted/40 flex flex-col">
          {taskPanel}
        </aside>
        <section className="flex-1 border-r border-border bg-background flex flex-col">
          {attemptPanel}
        </section>
        <aside className="w-[340px] shrink-0 border-l border-border bg-card flex flex-col">
          {diffsPanel}
        </aside>
      </div>
    </div>
  )
}

export default TaskDetailLayout
