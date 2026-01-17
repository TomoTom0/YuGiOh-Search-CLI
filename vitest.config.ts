import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
exclude: ['**/node_modules/**', '**/dist/**', '**/tmp/**', '**/web/**'],
    testTimeout: 30000
  }
})
