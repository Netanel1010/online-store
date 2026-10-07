// Compares the catalog file with the catalog the API serves. The file (public/data/products.json) is
// the one source of the catalog: `npm run seed:products` copies it to MongoDB, and the build writes
// the static pages, the sitemap and the structured data of the products from it. So the two can
// only differ when the file was changed and the seed has not been run yet (or the other way round),
// and that is what this reports. It reads no secret and changes nothing.

/** The same value with the keys of every object in the same order, so that two copies compare as text. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    )
  }
  return value
}

const byId = (products) => new Map(products.map((product) => [product.id, product]))
const list = (ids) => {
  const shown = ids.slice(0, 5).join(', ')
  return ids.length > 5 ? `${shown} and ${ids.length - 5} more` : shown
}

/**
 * What differs between the products of the file and those of the API, one sentence each; an empty
 * list when they are the same products with the same data.
 */
export function catalogDrift(fileProducts, apiProducts) {
  const inFile = byId(fileProducts)
  const inApi = byId(apiProducts)
  const problems = []

  const onlyInFile = [...inFile.keys()].filter((id) => !inApi.has(id))
  if (onlyInFile.length > 0) {
    problems.push(
      `${onlyInFile.length} product(s) are in products.json but not in the API (run the seed): ${list(onlyInFile)}`,
    )
  }
  const onlyInApi = [...inApi.keys()].filter((id) => !inFile.has(id))
  if (onlyInApi.length > 0) {
    problems.push(
      `${onlyInApi.length} product(s) are in the API but not in products.json (the seed never deletes): ${list(onlyInApi)}`,
    )
  }
  const changed = [...inFile.keys()].filter(
    (id) =>
      inApi.has(id) &&
      JSON.stringify(canonical(inFile.get(id))) !== JSON.stringify(canonical(inApi.get(id))),
  )
  if (changed.length > 0) {
    problems.push(
      `${changed.length} product(s) differ between products.json and the API (run the seed): ${list(changed)}`,
    )
  }
  return problems
}
