import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { productsSchema } from '../src/features/products/schema.ts'
import { catalogDrift } from './catalogDrift.mjs'

const product = (id, extra = {}) => ({
  id,
  name: `Product ${id}`,
  price: { current: 100 },
  specs: [{ label: 'a', value: 'b' }],
  ...extra,
})

describe('catalogDrift', () => {
  it('finds nothing when the API serves the products of the file', () => {
    const file = [product('A'), product('B')]

    expect(catalogDrift(file, structuredClone(file))).toEqual([])
  })

  it('does not mind the order of the products or of the keys', () => {
    const file = [product('A'), product('B')]
    const api = [
      { specs: [{ value: 'b', label: 'a' }], price: { current: 100 }, name: 'Product B', id: 'B' },
      product('A'),
    ]

    expect(catalogDrift(file, api)).toEqual([])
  })

  it('says which products the API is missing: the file was changed and the seed not run', () => {
    const problems = catalogDrift([product('A'), product('NEW-1')], [product('A')])

    expect(problems).toEqual([
      expect.stringMatching(/1 product\(s\) are in products.json but not in the API.*NEW-1/),
    ])
  })

  it('says which products only the API has, because the seed never deletes', () => {
    const problems = catalogDrift([product('A')], [product('A'), product('OLD-1')])

    expect(problems).toEqual([expect.stringMatching(/in the API but not in products.json.*OLD-1/)])
  })

  it('says which products have other data, such as a new price', () => {
    const problems = catalogDrift(
      [product('A', { price: { current: 90, original: 100 } }), product('B')],
      [product('A'), product('B')],
    )

    expect(problems).toEqual([expect.stringMatching(/1 product\(s\) differ.*A/)])
  })

  it('reports each kind of difference, and shortens a long list', () => {
    const file = Array.from({ length: 8 }, (_, i) => product(`F-${i}`))
    const problems = catalogDrift(file, [product('X-1')])

    expect(problems).toHaveLength(2)
    expect(problems[0]).toContain('8 product(s)')
    expect(problems[0]).toContain('and 3 more')
  })

  it('finds a catalog that is not served at all', () => {
    expect(catalogDrift([product('A')], [])).toHaveLength(1)
    expect(catalogDrift([], [])).toEqual([])
  })

  it('compares what the seed stores: the file read through the schema, which trims the text', () => {
    const real = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/data/products.json'), 'utf8'),
    )
    const padded = [{ ...real[0], name: `  ${real[0].name} ` }]
    const stored = productsSchema.parse([real[0]])

    // Read as it is, the file looks different from the API; read through the schema, it is the same.
    expect(catalogDrift(padded, stored)).toHaveLength(1)
    expect(catalogDrift(productsSchema.parse(padded), stored)).toEqual([])
  })

  it('is satisfied by the real catalog compared with itself', () => {
    const real = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/data/products.json'), 'utf8'),
    )

    expect(catalogDrift(real, structuredClone(real))).toEqual([])
    expect(real.length).toBeGreaterThan(0)
  })
})
