/**
 * The base path a production build of the site is served from, read from `VITE_BASE_PATH`.
 *
 * GitHub Pages serves the site from `https://<user>.github.io/online-store/`, so that is the default
 * and what every build without the variable gets. A host that serves the site from the root of its
 * own address (Netlify) builds with `VITE_BASE_PATH=/`.
 *
 * The value has to be `/` or a path that starts and ends with `/`: anything else would build a site
 * whose assets and routes silently do not load, so it stops the build with a message instead.
 */
export const DEFAULT_BASE_PATH = '/online-store/'

const VALID_BASE_PATH = /^\/(?:[A-Za-z0-9._~-]+\/)*$/

export function resolveBasePath(value: string | undefined): string {
  if (value === undefined || value.trim() === '') return DEFAULT_BASE_PATH
  const base = value.trim()
  const isDotSegment = base.split('/').some((segment) => segment === '.' || segment === '..')
  if (!VALID_BASE_PATH.test(base) || isDotSegment) {
    throw new Error(
      `VITE_BASE_PATH must be "/" or a path that starts and ends with "/", such as "${DEFAULT_BASE_PATH}" (got "${base}")`,
    )
  }
  return base
}
