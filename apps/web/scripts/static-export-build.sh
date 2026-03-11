#!/bin/bash

# 静态导出构建脚本
# 在 Tauri 构建时临时排除 API routes，因为 Desktop 直接调用 Rust API

set -e

API_DIR="app/api"
BACKUP_DIR=".app-api-backup"

echo "🔧 Preparing for static export..."

if [ -d "$API_DIR" ]; then
  echo "📦 Temporarily moving $API_DIR to $BACKUP_DIR"
  mv "$API_DIR" "$BACKUP_DIR"
fi

echo "🏗️  Building with static export..."
pnpm build

echo "✅ Restoring $API_DIR"
if [ -d "$BACKUP_DIR" ]; then
  mv "$BACKUP_DIR" "$API_DIR"
fi

echo "✨ Static export complete!"
