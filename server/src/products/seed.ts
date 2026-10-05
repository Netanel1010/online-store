import type { ProductRepository } from './repository.ts'
import { catalogSchema } from './schemas.ts'
import type { Product, UpsertResult } from './types.ts'

export interface SeedSummary extends UpsertResult {
  /** Products in the source. */
  total: number
  /** Stored products that are not in the source. The seed never deletes them. */
  notInSource: number
}

const MAX_REPORTED_ISSUES = 20

/** The source data is not a valid catalog. `issues` say what is wrong and where, one per line. */
export class SeedValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`The product data is invalid (${issues.length} problem${issues.length === 1 ? '' : 's'})`)
    this.name = 'SeedValidationError'
    this.issues = issues
  }
}

/**
 * Checks the whole source against the product schema before anything is written, so one bad
 * product stops the seed with nothing changed.
 */
export function validateCatalog(source: unknown): Product[] {
  const result = catalogSchema.safeParse(source)
  if (result.success) return result.data

  const issues = result.error.issues.map(
    (issue) => `${issue.path.map(String).join('.') || '(catalog)'}: ${issue.message}`,
  )
  const hidden = issues.length - MAX_REPORTED_ISSUES
  throw new SeedValidationError(
    hidden > 0 ? [...issues.slice(0, MAX_REPORTED_ISSUES), `... and ${hidden} more`] : issues,
  )
}

/**
 * Makes the collection contain the given products: new ones are inserted, existing ones (same
 * `id`) are updated, and running it again with the same products changes nothing. Products that
 * are in the database but not in the source are left exactly as they are: the seed adds and
 * updates, it never removes.
 */
export async function seedProducts(
  repository: Pick<ProductRepository, 'ensureIndexes' | 'upsertMany' | 'countNotIn'>,
  products: readonly Product[],
): Promise<SeedSummary> {
  // The unique index first: it is what makes a repeated or concurrent run unable to duplicate.
  await repository.ensureIndexes()
  const result = await repository.upsertMany(products)
  const notInSource = await repository.countNotIn(products.map((product) => product.id))
  return { ...result, total: products.length, notInSource }
}

export function formatSeedSummary(summary: SeedSummary): string {
  return [
    'Products seed completed',
    `Inserted: ${summary.inserted}`,
    `Updated: ${summary.updated}`,
    `Unchanged: ${summary.unchanged}`,
    `Total source products: ${summary.total}`,
    `Not in source (left untouched): ${summary.notInSource}`,
  ].join('\n')
}
