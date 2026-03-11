'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { KanbanBoardWrapper } from './KanbanBoardWrapper'
import { ProjectSettingsPageWrapper } from './ProjectSettingsPageWrapper'

function ProjectsContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const view = searchParams.get('view') as 'board' | 'config' | null

  // 如果没有提供 id，显示项目列表
  if (!id) {
    return <ProjectsList />
  }

  // 根据视图参数渲染对应组件
  if (view === 'config') {
    return <ProjectSettingsPageWrapper projectId={id} />
  }

  // 默认显示看板视图
  return (
    <div className="-m-4 h-[calc(100dvh-var(--top-nav-height,2.5rem))] overflow-hidden md:-m-8">
      <KanbanBoardWrapper projectId={id} />
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsLoading />}>
      <ProjectsContent />
    </Suspense>
  )
}

function ProjectsLoading() {
  const t = useTranslations('common')

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-gray-500 dark:text-gray-400">{t('loading')}</div>
    </div>
  )
}

function ProjectsList() {
  const t = useTranslations('projects')

  // 临时实现：显示创建项目提示
  // TODO: 实现项目列表页面
  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex items-center justify-center">
      {/* 多彩渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-rose-50 to-violet-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800" />

      {/* 装饰性彩色圆形 */}
      <div className="absolute top-20 left-20 w-72 h-72 bg-amber-300/30 dark:bg-amber-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-violet-300/30 dark:bg-violet-500/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-rose-300/20 dark:bg-rose-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-teal-300/20 dark:bg-teal-500/10 rounded-full blur-3xl" />

      {/* 内容区 */}
      <div className="relative z-10 text-center">
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-8 shadow-xl border border-white/50 dark:border-gray-700/50">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200/50">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {t('listTitle')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">
            {t('emptyDescription')}
          </p>
          <a
            href="/projects/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-200/50 dark:shadow-amber-500/20 transition-all hover:scale-105"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('createProject')}
          </a>
        </div>
      </div>
    </div>
  )
}
