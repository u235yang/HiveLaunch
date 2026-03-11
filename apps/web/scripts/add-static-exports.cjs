#!/usr/bin/env node

/**
 * 批量为 API routes 添加静态导出配置
 * 在 Tauri 构建时使用
 */

const fs = require('fs')
const path = require('path')

function findRouteFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      findRouteFiles(fullPath, files)
    } else if (entry.name === 'route.ts') {
      files.push(fullPath)
    }
  }

  return files
}

const apiDir = path.join(process.cwd(), 'app/api')
const apiRoutes = findRouteFiles(apiDir)

// 使用 'error' 让 Next.js 跳过这些 API routes
const staticExports = `// Static export configuration for Tauri builds
// API routes are not included in static exports - Desktop app uses Rust HTTP Server directly
export const dynamic = 'error'
export const generateStaticParams = () => []
`

console.log(`Found ${apiRoutes.length} API route files`)

for (const filePath of apiRoutes) {
  let content = fs.readFileSync(filePath, 'utf-8')

  // 检查是否已经有 export const dynamic
  if (content.includes('export const dynamic')) {
    console.log(`⏭️  Skipping ${path.relative(process.cwd(), filePath)} (already has dynamic export)`)
    continue
  }

  // 在文件开头添加配置
  const lines = content.split('\n')
  let insertIndex = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '' || trimmed === '// @ts-nocheck' || trimmed === '// @ts-ignore') {
      insertIndex = i + 1
    } else if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
      insertIndex = i
      break
    } else if (trimmed.startsWith('//') && trimmed.length > 2 && !trimmed.startsWith('// Static')) {
      insertIndex = i + 1
    } else {
      break
    }
  }

  lines.splice(insertIndex, 0, staticExports)
  content = lines.join('\n')

  fs.writeFileSync(filePath, content, 'utf-8')
  console.log(`✅ Updated ${path.relative(process.cwd(), filePath)}`)
}

console.log(`\n✨ Updated ${apiRoutes.length} API route files`)
