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
  reactStrictMode: true,
  poweredByHeader: false,
  // The floating Next.js dev tools badge (Route / Bundler / Route Info /
  // Preferences) only appears in `next dev`; hide it so local runs look like the
  // real console. Errors still surface in the dev overlay and the terminal.
  devIndicators: false,

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
