import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import Sidebar from '../components/Sidebar'
import TopNav from '../components/TopNav'
import { Providers } from '../components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'HiveLaunch',
  description: 'AI-driven development platform',
}

// 移动端 viewport 配置 - 解决地址栏导致的 vh 问题
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className="h-dvh overflow-hidden bg-[#f8f7f5] dark:bg-[#1c1917]">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <div className="flex flex-col h-dvh min-h-0">
              {/* Top Navigation Bar */}
              <Suspense fallback={null}>
                <TopNav />
              </Suspense>

              {/* Main Layout */}
              <div className="flex-1 flex min-h-0 overflow-hidden">
                <Suspense fallback={null}>
                  <Sidebar />
                </Suspense>
                <main className="flex-1 min-h-0 overflow-y-auto bg-[#f8f7f5] dark:bg-[#1c1917]">
                  <div className="p-4 md:p-8">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
