'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'
import { initializeMobileRelayTransport } from '@/features/agent-execution/lib/api-config'
import { resolveLocale } from '@/i18n/config'
import { useUIStore, type ThemeMode } from '@/features/shared/store'

function resolveShouldUseDark(mode: ThemeMode): boolean {
  if (mode === 'dark') {
    return true
  }

  if (mode === 'light') {
    return false
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', resolveShouldUseDark(mode))
}

export function Providers({ children }: { children: React.ReactNode }) {
  const locale = useLocale()
  const setLocale = useUIStore((state) => state.setLocale)
  const themeMode = useUIStore((state) => state.themeMode)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  useEffect(() => {
    initializeMobileRelayTransport()
  }, [])

  useEffect(() => {
    setLocale(resolveLocale(locale))
  }, [locale, setLocale])

  useEffect(() => {
    applyTheme(themeMode)
  }, [themeMode])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (useUIStore.getState().themeMode === 'system') {
        applyTheme('system')
      }
    }

    mediaQuery.addEventListener('change', onChange)
    return () => mediaQuery.removeEventListener('change', onChange)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
