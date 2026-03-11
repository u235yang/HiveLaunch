import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE_NAME, resolveLocale } from './config'

export default getRequestConfig(async () => {
  // 静态导出时无法访问 cookies，使用默认值
  const isStaticExport = process.env.TAURI_STATIC_EXPORT === '1' || process.env.NEXT_STATIC_BUILD === 'true'
  
  let locale: string
  
  if (isStaticExport) {
    // 静态导出时使用默认语言
    locale = 'zh-CN'
  } else {
    // 动态模式从 cookie 读取
    const cookieStore = await cookies()
    locale = resolveLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value)
  }
  
  const messages =
    locale === 'zh-CN'
      ? (await import('../messages/zh-CN.json')).default
      : (await import('../messages/en-US.json')).default

  return {
    locale,
    messages,
  }
})
