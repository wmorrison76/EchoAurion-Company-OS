// NOTE(claude): CLAUDE.md §5.2 specifies `next.config.ts`, but the pinned
// Next.js 14.2.x does not support a TypeScript config file (that landed in
// Next 15). Using `.mjs` is the conservative, working equivalent. Revisit if
// the project upgrades to Next 15+.

// Content-Security-Policy: 'unsafe-inline'/'unsafe-eval' in script-src are the
// minimum Next 14 app-router + Plaid Link tolerate without a nonce pipeline;
// cdn.plaid.com script/frame + production/sandbox.plaid.com connect are required
// by react-plaid-link. Tighten to nonces if/when the app moves to Next 15.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://cdn.plaid.com https://production.plaid.com https://sandbox.plaid.com",
  "frame-src https://cdn.plaid.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), usb=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'avatars.githubusercontent.com' }],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
