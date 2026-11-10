import type { NextConfig } from 'next';

/**
 * Same-origin API proxy.
 *
 * The backend delivers the session as `HttpOnly`, `SameSite=Lax` cookies
 * (`kas_access`, `kas_refresh`), and its CORS list names only the website origins
 * in `SecurityConfig`. Doc 59 §8 forbids putting tokens anywhere JavaScript can
 * read them, and this console's origin is not on that list.
 *
 * So the browser talks only to the frontend origin, and Next.js forwards
 * `/api/v1/**` to the backend. Cookies and the CSRF pair survive because, to the
 * browser, nothing crossed an origin.
 *
 * The alternative — enabling CORS and relaxing `SameSite` — would weaken a
 * backend security decision to make the frontend simpler. That is explicitly
 * out of bounds.
 */
const apiOrigin = process.env.KAS_API_ORIGIN ?? 'http://localhost:8080';

const nextConfig: NextConfig = {
  // Docker images (docker/console.Dockerfile) set KAS_NEXT_STANDALONE=1: Next.js then
  // traces only the files the server needs into .next/standalone, which makes the image
  // ~5x smaller (and ~5x faster to push) than shipping the full node_modules.
  // The rewrites below are baked in at build time, so KAS_API_ORIGIN is a build argument.
  // `npm run dev` / `npm start` are unchanged.
  ...(process.env.KAS_NEXT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // The floating Next.js dev tools badge (Route / Bundler / Route Info /
  // Preferences) only appears in `next dev`; hide it so local runs look like the
  // real console. Errors still surface in the dev overlay and the terminal.
  devIndicators: false,

  experimental: {
    // src/proxy.ts forwards /api/v1 to the backend, and Next buffers a proxied body only up
    // to this size (default 10 MB). Image uploads go through it to the backend's disk store
    // and may be up to MAX_UPLOAD_BYTES (15 MB), so allow a little more than that.
    proxyClientMaxBodySize: '16mb',
  },

  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiOrigin}/api/v1/:path*` }];
  },

  async headers() {
    return [
      {
        // Doc 22 §8: the management consoles are `noindex`, and that is one of
        // three independent layers — the other two are robots.txt and the
        // authentication gate itself.
        source: '/:group(admin|partner)/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
};

export default nextConfig;
