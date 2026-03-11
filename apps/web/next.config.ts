import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const extraDevOrigins = process.env.NEXT_PUBLIC_DEV_ORIGINS
  ? process.env.NEXT_PUBLIC_DEV_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
  : []
const isTauriStaticBuild = process.env.TAURI_STATIC_EXPORT === '1'
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

const nextConfig: NextConfig = {
  ...(isTauriStaticBuild
    ? {
        output: 'export',
        distDir: 'out',
      }
    : {}),

  // 图片优化
  images: {
    unoptimized: true,
  },

  transpilePackages: ['@hivelaunch/shared-types', '@hivelaunch/shared-ui'],
  typescript: {
    ignoreBuildErrors: true,
  },
  allowedDevOrigins: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    ...extraDevOrigins,
  ],

  // 开发模式代理到 Rust HTTP 服务 (127.0.0.1:3847)
  // 移动端通过 NEXT_PUBLIC_API_BASE_URL 环境变量指定局域网地址
  async rewrites() {
    // 生产模式不需要 rewrites
    if (process.env.NODE_ENV === 'production') {
      return []
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3847'

    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/projects/:id/board',
        destination: '/projects?id=:id&view=board',
        permanent: false,
      },
      {
        source: '/projects/:id/config',
        destination: '/projects?id=:id&view=config',
        permanent: false,
      },
    ]
  },
}

export default withNextIntl(nextConfig)
