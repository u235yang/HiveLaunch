#!/usr/bin/env node

/**
 * 静态导出构建脚本
 * 在 Tauri 构建时临时排除 API routes，因为 Desktop 直接调用 Rust API
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const apiDir = path.join(process.cwd(), 'app/api')
const backupDir = path.join(process.cwd(), '.app-api-backup')

console.log('🔧 Preparing for static export...')

// 临时移动 API 目录
if (fs.existsSync(apiDir)) {
  console.log(`📦 Temporarily moving ${apiDir} to ${backupDir}`)
  fs.renameSync(apiDir, backupDir)
}

try {
  console.log('🏗️  Building with static export...')
  execSync('pnpm build', {
    stdio: 'inherit',
    env: {
      ...process.env,
      TAURI_STATIC_EXPORT: '1',
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:3847',
      NEXT_PUBLIC_WS_BASE_URL: 'ws://127.0.0.1:3847',
    },
  })
  const outDir = path.join(process.cwd(), 'out')
  const compatOutDir = path.join(process.cwd(), '../apps/web/out')
  if (fs.existsSync(outDir)) {
    fs.mkdirSync(path.dirname(compatOutDir), { recursive: true })
    fs.cpSync(outDir, compatOutDir, { recursive: true, force: true })
  }
  console.log('✨ Static export complete!')
} finally {
  // 恢复 API 目录
  if (fs.existsSync(backupDir)) {
    console.log(`✅ Restoring ${apiDir}`)
    fs.renameSync(backupDir, apiDir)
  }
}
