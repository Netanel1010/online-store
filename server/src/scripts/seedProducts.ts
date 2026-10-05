import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../config.ts'
import { createDatabase } from '../db/database.ts'
import { createProductRepository } from '../products/repository.ts'
import {
  formatSeedSummary,
  seedProducts,
  SeedValidationError,
  validateCatalog,
} from '../products/seed.ts'

// The storefront's catalog is the source. It is not changed: the seed only copies it to MongoDB.
const DEFAULT_SOURCE = fileURLToPath(new URL('../../../public/data/products.json', import.meta.url))

async function main() {
  // A path given to `npm run seed:products -- <file>` is relative to where npm was started.
  const argument = process.argv[2]
  const file = argument ? resolve(process.env.INIT_CWD ?? process.cwd(), argument) : DEFAULT_SOURCE

  // 1. The source is read and validated completely before the database is even contacted.
  let source: unknown
  try {
    source = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read the product data from ${file}: ${reason}`, { cause: error })
  }
  const products = validateCatalog(source)

  // 2. Only then the database, with the same configuration and life cycle as the API.
  const { mongodb } = loadConfig()
  if (!mongodb) throw new Error('MONGODB_URI is not set: the seed needs a database to write to')
  const database = createDatabase(mongodb)
  try {
    await database.connect()
    const summary = await seedProducts(createProductRepository(database), products)
    console.log(formatSeedSummary(summary))
    console.log(`Database: ${mongodb.dbName}`)
  } finally {
    await database.close()
  }
}

main().catch((error) => {
  if (error instanceof SeedValidationError) {
    console.error(`${error.message}. Nothing was written.`)
    for (const issue of error.issues) console.error(`  ${issue}`)
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exit(1)
})
