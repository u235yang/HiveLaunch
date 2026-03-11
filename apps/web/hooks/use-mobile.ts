import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

function detectMobile(): boolean {
  if (typeof window === 'undefined') return false

  const viewportMobile = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
  if (viewportMobile) return true

  const userAgent = window.navigator.userAgent
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  return isMobileUa
}

/**
 * 移动端检测 Hook
 *
 * 检测当前窗口宽度是否小于 768px (md 断点)
 *
 * @returns {boolean} 是否为移动端
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isMobile = useMobile()
 *
 *   if (isMobile) {
 *     return <MobileView />
 *   }
 *   return <DesktopView />
 * }
 * ```
 */
export function useMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => detectMobile())

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const update = () => setIsMobile(detectMobile())
    update()

    const handleMediaQueryChange = () => update()
    const handleResize = () => update()

    mediaQuery.addEventListener('change', handleMediaQueryChange)
    window.addEventListener('resize', handleResize)

    return () => {
      mediaQuery.removeEventListener('change', handleMediaQueryChange)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return isMobile
}

/**
 * 桌面端检测 Hook
 *
 * @returns {boolean} 是否为桌面端
 */
export function useDesktop(): boolean {
  return !useMobile()
}
