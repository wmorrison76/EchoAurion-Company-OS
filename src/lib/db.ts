import { PrismaClient } from '@prisma/client'

// Prisma client singleton — prevents exhausting the Neon connection pool
// during Next.js hot-reload in development. See CLAUDE.md §22.2.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
