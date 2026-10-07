/**
 * Makes text safe to put between the quotes of an HTML attribute. No imports, because the build
 * (vite.config.ts) uses it too, to write the API hints into the page's HTML.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
