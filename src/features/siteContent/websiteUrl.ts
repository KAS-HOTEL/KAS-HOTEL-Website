/**
 * The customer website's address, for "Xem trên website" links. The console runs on its own
 * host (admin.kasluxuryhotel.com), so a relative link would open the console itself.
 * NEXT_PUBLIC_WEBSITE_URL wins; otherwise a local console points at the local website (3001)
 * and any other host at production.
 */
export function websiteUrl(path: string, hostname?: string): string {
  const configured = process.env.NEXT_PUBLIC_WEBSITE_URL;
  const base = configured && configured.trim() !== ''
    ? configured.trim().replace(/\/+$/, '')
    : /^(localhost|127\.0\.0\.1)$/.test(hostname ?? '') ? 'http://localhost:3001' : 'https://kasluxuryhotel.com';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
