'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useUIStore } from '@/features/shared/store'
import { useProjectStore } from '@/features/shared/store'
import { useMobile } from '@/hooks/use-mobile'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIDEBAR_EXPANDED_WIDTH = 240
const SIDEBAR_COLLAPSED_WIDTH = 56

export default function TopNav() {
  const t = useTranslations('topNav')
  const searchParams = useSearchParams()
  const isMobile = useMobile()
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const setMobileSidebarOpen = useUIStore((state) => state.setMobileSidebarOpen)
  const projects = useProjectStore((state) => state.projects)
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH
  const activeProjectName = useMemo(() => {
    const activeProjectId = searchParams.get('id')
    if (!activeProjectId) return null
    return projects.find((project) => project.id === activeProjectId)?.name ?? null
  }, [projects, searchParams])

  return (
    <header
      className={cn(
        "relative bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center shrink-0 z-20 transition-all duration-200",
        "h-[var(--top-nav-height)] px-3 md:px-4"
      )}
      style={{
        ['--top-nav-height' as string]: '2.5rem',
        paddingTop: isMobile ? 'env(safe-area-inset-top)' : undefined
      }}
    >
      {/* Left: Branding & Hamburger Menu */}
      <div
        className="flex items-center transition-all duration-200"
        style={{ width: isMobile ? 'auto' : sidebarWidth }}
      >
        {/* Hamburger Menu - Mobile Only */}
        {isMobile && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMobileSidebarOpen(true)
            }}
            className="flex items-center gap-2 p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white mr-2"
            aria-label={t('openMenu')}
          >
            <Menu className="w-5 h-5" />
            <span className="text-xs font-medium">{t('menu')}</span>
          </button>
        )}

        {/* Branding */}
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold tracking-tight">
          {/* Hive Icon */}
          <svg
            className="text-primary"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          {/* Brand Text - Hidden on Mobile */}
          <span className="hidden md:inline text-sm">HiveLaunch</span>
        </div>
        {isMobile && activeProjectName && (
          <span className="max-w-40 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
            {activeProjectName}
          </span>
        )}

        {/* Beta Badge - Hidden on Mobile */}
        <span className="hidden md:inline px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide">
          Beta
        </span>
      </div>

      {/* Right: Spacer - 保持布局平衡 */}
      <div className="flex-1" />
    </header>
  )
}
