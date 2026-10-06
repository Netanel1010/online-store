import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { DEFAULT_LIMIT, MAX_LIMIT, createProductService } from './service.ts'

// 45 products with ids P-001 ... P-045, so the pages are easy to read.
const products = Array.from({ length: 45 }, (_, index) =>
  makeProduct({ id: `P-${String(index + 1).padStart(3, '0')}` }),
)
const ids = (items: { id: string }[]) => items.map((item) => item.id)

function setup() {
  const { repository } = createMemoryProductRepository(products)
  const list = vi.spyOn(repository, 'list')
  return { service: createProductService(repository), repository, list }
}

describe('list', () => {
  it('uses the first page and the default page size when nothing is asked', async () => {
    const { service, list } = setup()

    const page = await service.list()

    expect(DEFAULT_LIMIT).toBe(20)
    expect(page).toMatchObject({ page: 1, limit: 20, total: 45, totalPages: 3 })
    expect(page.items).toHaveLength(20)
    expect(list).toHaveBeenCalledWith(
      { brands: [], specs: new Map(), category: undefined, search: undefined },
      { sort: 'default', skip: 0, limit: 20 },
    )
  })

  it('returns the page that was asked for, and asks the repository for only that range', async () => {
    const { service, list } = setup()

    const page = await service.list({ page: 3, limit: 10 })

    expect(list).toHaveBeenCalledWith(expect.anything(), { sort: 'default', skip: 20, limit: 10 })
    expect(ids(page.items)).toEqual(
      Array.from({ length: 10 }, (_, index) => `P-${String(index + 21).padStart(3, '0')}`),
    )
    expect(page).toMatchObject({ page: 3, limit: 10, total: 45, totalPages: 5 })
  })

  it('returns a shorter last page', async () => {
    const { service } = setup()

    const page = await service.list({ page: 3 })

    expect(page.items).toHaveLength(5)
    expect(page.totalPages).toBe(3)
  })

  it('returns an empty page past the end, with the real total', async () => {
    const { service } = setup()

    const page = await service.list({ page: 99 })

    expect(page).toEqual({ items: [], page: 99, limit: 20, total: 45, totalPages: 3 })
  })

  it('has no pages for an empty catalog', async () => {
    const service = createProductService(createMemoryProductRepository().repository)

    expect(await service.list()).toEqual({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 })
  })

  it('allows a page as large as the maximum', async () => {
    const { service } = setup()

    const page = await service.list({ limit: MAX_LIMIT })

    expect(MAX_LIMIT).toBe(100)
    expect(page.items).toHaveLength(45)
    expect(page.totalPages).toBe(1)
  })

  it.each([
    ['a limit above the maximum', { limit: MAX_LIMIT + 1 }],
    ['a huge limit', { limit: 1_000_000 }],
    ['a limit of 0', { limit: 0 }],
    ['a negative limit', { limit: -5 }],
    ['a page of 0', { page: 0 }],
    ['a negative page', { page: -1 }],
    ['a fractional page', { page: 1.5 }],
    ['a fractional limit', { limit: 2.5 }],
    ['a page that is not a number', { page: Number.NaN }],
    ['an infinite limit', { limit: Number.POSITIVE_INFINITY }],
    ['a page that makes the offset unsafe', { page: Number.MAX_SAFE_INTEGER, limit: 100 }],
  ])('rejects %s with a 400, without asking the repository', async (_name, params) => {
    const { service, list } = setup()

    const failure = await service.list(params).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({ status: 400, code: 'invalid_pagination' })
    expect(list).not.toHaveBeenCalled()
  })

  it('passes on a repository failure as it is', async () => {
    const { repository } = setup()
    vi.spyOn(repository, 'list').mockRejectedValue(new Error('connection lost'))

    await expect(createProductService(repository).list()).rejects.toThrow('connection lost')
  })
})

describe('get', () => {
  it('returns the product with that id', async () => {
    const { service } = setup()

    expect(await service.get('P-007')).toEqual(products[6])
  })

  it('answers a product that does not exist with a 404', async () => {
    const { service } = setup()

    const failure = await service.get('P-999').catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({ status: 404, code: 'product_not_found' })
  })

  it('looks the id up exactly: ids differ by case', async () => {
    const { service } = setup()

    await expect(service.get('p-007')).rejects.toMatchObject({ status: 404 })
  })

  it('passes on a repository failure as it is', async () => {
    const { repository } = setup()
    vi.spyOn(repository, 'findById').mockRejectedValue(new Error('connection lost'))

    await expect(createProductService(repository).get('P-001')).rejects.toThrow('connection lost')
  })
})
