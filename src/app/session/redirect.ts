/**
 * Validates a post-login redirect target taken from the URL. Only same-origin
 * absolute paths are allowed; anything else (//evil.com, https://..., \\host,
 * javascript:) falls back to the dashboard.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\') || [...raw].some((ch) => ch.charCodeAt(0) < 0x20)) return fallback;
  const path = (raw.split(/[?#]/)[0] ?? '').toLowerCase().trim();
  const authPatterns = ['/login', '/signup', '/auth', '/(auth)'];
  if (
    authPatterns.some(
      (p) => path === p || path.startsWith(`${p}/`) || path.endsWith('/login') || path.endsWith('/signup'),
    )
  ) {
    return fallback;
  }
  return raw;
}
