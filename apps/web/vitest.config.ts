import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        jsx: 'react-jsx',
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@shared\/ui(\/.*)?$/,
        replacement: `${path.resolve(__dirname, '../../packages/shared-ui/src')}$1`,
      },
      {
        find: /^@shared\/types(\/.*)?$/,
        replacement: `${path.resolve(__dirname, '../../packages/shared-types/src')}$1`,
      },
      {
        find: /^@\/features\//,
        replacement: `${path.resolve(__dirname, '../../features')}/`,
      },
      {
        find: /^@\//,
        replacement: `${path.resolve(__dirname, '.')}/`,
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'vitest.setup.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
    },
  },
});
