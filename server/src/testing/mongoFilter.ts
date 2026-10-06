/**
 * Evaluates the few MongoDB query operators the products repository uses, on a plain document:
 * equality, `$in`, `$regex`, `$elemMatch`, `$and` and `$or`, on dotted paths. It lets the tests
 * check what a filter selects without a database. It supports nothing else and throws on any other
 * operator, so a new operator in a filter cannot go unchecked.
 */
export type Filter = Record<string, unknown>

function valueAt(document: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      document,
    )
}

function conditionMatches(value: unknown, condition: unknown): boolean {
  if (condition === null || typeof condition !== 'object' || Array.isArray(condition)) {
    return value === condition
  }
  return Object.entries(condition).every(([operator, argument]) => {
    switch (operator) {
      case '$in':
        return (argument as unknown[]).includes(value)
      case '$regex':
        return typeof value === 'string' && new RegExp(argument as string, 'u').test(value)
      case '$elemMatch':
        return Array.isArray(value) && value.some((item) => matchesFilter(item, argument as Filter))
      default:
        throw new Error(`mongoFilter: unsupported operator ${operator}`)
    }
  })
}

export function matchesFilter(document: unknown, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and')
      return (condition as Filter[]).every((part) => matchesFilter(document, part))
    if (key === '$or') return (condition as Filter[]).some((part) => matchesFilter(document, part))
    if (key.startsWith('$')) throw new Error(`mongoFilter: unsupported operator ${key}`)
    return conditionMatches(valueAt(document, key), condition)
  })
}
