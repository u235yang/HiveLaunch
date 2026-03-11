import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { DEFAULT_LOCALE, type AppLocale } from '@/i18n/config'

// ==================== Types ====================

export interface UIState {
  themeMode: ThemeMode
  setThemeMode: (mode: ThemeMode) => void
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  // 移动端侧边栏状态
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void
}

export type ThemeMode = 'light' | 'dark' | 'system'

// ==================== Store ====================

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        themeMode: 'system',
        setThemeMode: (mode: ThemeMode) => set({ themeMode: mode }),
        sidebarCollapsed: false,
        toggleSidebar: () =>
          set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        setSidebarCollapsed: (collapsed: boolean) =>
          set({ sidebarCollapsed: collapsed }),
        locale: DEFAULT_LOCALE,
        setLocale: (locale: AppLocale) => set({ locale }),
        // 移动端侧边栏状态（不需要持久化，每次会话默认关闭）
        mobileSidebarOpen: false,
        setMobileSidebarOpen: (open: boolean) =>
          set({ mobileSidebarOpen: open }),
        toggleMobileSidebar: () =>
          set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      }),
      {
        name: 'bee-ui-store',
        // 排除移动端侧边栏状态（不需要持久化）
        partialize: (state) => ({
          themeMode: state.themeMode,
          sidebarCollapsed: state.sidebarCollapsed,
          locale: state.locale,
        }),
      }
    ),
    {
      name: 'UIStore',
    }
  )
)

// ==================== Selectors ====================

export const uiSelectors = {
  selectThemeMode: (state: UIState) => state.themeMode,
  selectSidebarCollapsed: (state: UIState) => state.sidebarCollapsed,
  selectMobileSidebarOpen: (state: UIState) => state.mobileSidebarOpen,
  selectLocale: (state: UIState) => state.locale,
}
