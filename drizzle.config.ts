import { defineConfig } from 'drizzle-kit';
import { sqlite } from 'drizzle-kit/better-sqlite3';
import { sql } from 'drizzle-kit/sql';

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',  // 使用 SQLite 而非 PostgreSQL
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./hivelaunch.db', // 本地文件数据库
  },
});
