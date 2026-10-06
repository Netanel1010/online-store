/**
 * The catalog request every page starts with. It is one small module with no imports because the
 * build (vite.config.ts) uses it too: the page's HTML asks the browser to start this exact request
 * before the scripts have run, and a hint for a different address would be wasted.
 */

/** The API's largest page, so the whole catalog takes as few requests as possible. */
export const CATALOG_PAGE_SIZE = 100

/** The address (after the API's origin) of one page of the whole catalog. */
export function catalogPagePath(page: number): string {
  return `/api/products?page=${page}&limit=${CATALOG_PAGE_SIZE}`
}
