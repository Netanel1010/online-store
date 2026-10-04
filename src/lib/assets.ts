/**
 * Resolves a path relative to `public/` (e.g. "images/hero/slide-1.avif") against the
 * deployed base URL, so it works both in dev ("/") and on GitHub Pages ("/online-store/").
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
