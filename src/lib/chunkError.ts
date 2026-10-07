/**
 * Whether an error is a page of the site that could not be loaded (a lazily loaded chunk), which
 * after a new deployment usually means the visitor still has the old version of the site open and
 * the file it asks for no longer exists. Retrying does not help (React remembers that the import
 * failed): only loading the site again does. The browsers word it differently.
 */
export function isChunkLoadError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (css )?chunk [\w-]+ failed|unable to preload css/i.test(
    text,
  )
}
