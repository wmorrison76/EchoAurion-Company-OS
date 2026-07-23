import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors tsconfig `paths` — without this, any test importing a module that
// itself uses `@/lib/...` fails to resolve (e.g. support-sla.test.ts).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
