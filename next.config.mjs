// NOTE(claude): CLAUDE.md §5.2 specifies `next.config.ts`, but the pinned
// Next.js 14.2.x does not support a TypeScript config file (that landed in
// Next 15). Using `.mjs` is the conservative, working equivalent. Revisit if
// the project upgrades to Next 15+.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'avatars.githubusercontent.com' }],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
}

export default nextConfig
