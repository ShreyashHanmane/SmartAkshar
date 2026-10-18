/**
 * Validates a post-login redirect target taken from the URL. Only same-origin
 * absolute paths are allowed; anything else (//evil.com, https://..., \\host,
 * javascript:) falls back to the dashboard.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\') || [...raw].some((ch) => ch.charCodeAt(0) < 0x20)) return fallback;
  const authPages = ['/login', '/signup', '/forgot-password', '/verify-email'];
  if (authPages.some((p) => raw === p || raw.startsWith(`${p}?`) || raw.startsWith(`${p}/`))) return fallback;
  return raw;
}
