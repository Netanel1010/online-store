import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { createMemoryCartRepository } from '../testing/memoryCartRepository.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { CartConflictError, type CartRepository } from './repository.ts'
import { createCartService } from './service.ts'

const ME = 'user-me'
const SOMEONE = 'user-someone'

const card = makeProduct({ id: 'GV-N4060' })
const psu = makeProduct({ id: 'PSU-1' })

let clock = new Date('2026-01-01T10:00:00Z')
let carts: ReturnType<typeof createMemoryCartRepository>
let service: ReturnType<typeof setUp>

function setUp(repository?: CartRepository) {
  carts = createMemoryCartRepository()
  return createCartService({
    carts: repository ?? carts.repository,
    products: createMemoryProductRepository([card, psu]).repository,
    now: () => clock,
  })
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('it did not throw')
}

beforeEach(() => {
  clock = new Date('2026-01-01T10:00:00Z')
  service = setUp()
})

describe('reading the cart', () => {
  it('is empty for an account that has never used it', async () => {
    expect(await service.get(ME)).toEqual({ items: [], updatedAt: null })
  })

  it('gives back the lines in the order they were added, with the time of the last change', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 1 })
    clock = new Date('2026-01-01T11:00:00Z')
    await service.add(ME, { productId: 'GV-N4060', quantity: 2 })

    expect(await service.get(ME)).toEqual({
      items: [
        { productId: 'PSU-1', quantity: 1 },
        { productId: 'GV-N4060', quantity: 2 },
      ],
      updatedAt: '2026-01-01T11:00:00.000Z',
    })
  })
})

describe('adding to the cart', () => {
  it('makes a line, and answers with the whole cart', async () => {
    const cart = await service.add(ME, { productId: 'GV-N4060', quantity: 2 })

    expect(cart).toEqual({
      items: [{ productId: 'GV-N4060', quantity: 2 }],
      updatedAt: '2026-01-01T10:00:00.000Z',
    })
  })

  it('merges with the line of the same product', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 2 })

    const cart = await service.add(ME, { productId: 'GV-N4060', quantity: 3 })

    expect(cart.items).toEqual([{ productId: 'GV-N4060', quantity: 5 }])
  })

  it('stops at 99, like the cart of the storefront', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 98 })

    const cart = await service.add(ME, { productId: 'GV-N4060', quantity: 50 })

    expect(cart.items).toEqual([{ productId: 'GV-N4060', quantity: 99 }])
  })

  it('does not write, and does not touch the time, when the line is already at 99', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 99 })
    const save = vi.spyOn(carts.repository, 'save')
    clock = new Date('2026-02-02T10:00:00Z')

    const cart = await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    expect(save).not.toHaveBeenCalled()
    expect(cart.updatedAt).toBe('2026-01-01T10:00:00.000Z')
  })

  it('keeps nothing about the product but its id and the quantity', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    const document = carts.stored.get(ME)!
    expect(Object.keys(document).sort()).toEqual(['items', 'revision', 'updatedAt', 'userId'])
    expect(document.items).toEqual([{ productId: 'GV-N4060', quantity: 1 }])
    expect(JSON.stringify(document)).not.toContain(card.name)
    expect(JSON.stringify(document)).not.toContain('1500')
  })

  it('refuses a product that does not exist with 409 product_unavailable, and changes nothing', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    const error = await failure(service.add(ME, { productId: 'REMOVED-1', quantity: 1 }))

    expect(error.status).toBe(409)
    expect(error.code).toBe('product_unavailable')
    expect(error.details).toEqual({ productIds: ['REMOVED-1'] })
    expect((await service.get(ME)).items).toEqual([{ productId: 'GV-N4060', quantity: 1 }])
  })

  it('does not make a cart for a product that does not exist', async () => {
    await failure(service.add(ME, { productId: 'REMOVED-1', quantity: 1 }))

    expect(carts.stored.size).toBe(0)
  })

  it('holds 50 different products and refuses the 51st with 409 cart_full', async () => {
    const many = Array.from({ length: 51 }, (_, index) => makeProduct({ id: `P-${index}` }))
    service = createCartService({
      carts: carts.repository,
      products: createMemoryProductRepository(many).repository,
      now: () => clock,
    })
    for (const product of many.slice(0, 50)) {
      await service.add(ME, { productId: product.id, quantity: 1 })
    }

    const error = await failure(service.add(ME, { productId: 'P-50', quantity: 1 }))

    expect(error.status).toBe(409)
    expect(error.code).toBe('cart_full')
    expect((await service.get(ME)).items).toHaveLength(50)
    // A product that is already in the cart can still be added to.
    await expect(service.add(ME, { productId: 'P-0', quantity: 1 })).resolves.toBeDefined()
  })
})

describe('setting a quantity', () => {
  it('changes the quantity of the line and keeps its place', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 1 })
    await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    const cart = await service.setQuantity(ME, 'PSU-1', 7)

    expect(cart.items).toEqual([
      { productId: 'PSU-1', quantity: 7 },
      { productId: 'GV-N4060', quantity: 1 },
    ])
  })

  it('makes the line when there is none, so that setting it twice is the same as once', async () => {
    const first = await service.setQuantity(ME, 'GV-N4060', 4)
    const second = await service.setQuantity(ME, 'GV-N4060', 4)

    expect(first.items).toEqual([{ productId: 'GV-N4060', quantity: 4 }])
    expect(second.items).toEqual(first.items)
  })

  it('does not write when the quantity is the one it has', async () => {
    await service.setQuantity(ME, 'GV-N4060', 4)
    const save = vi.spyOn(carts.repository, 'save')

    await service.setQuantity(ME, 'GV-N4060', 4)

    expect(save).not.toHaveBeenCalled()
  })

  it('can set it lower than it was (unlike adding)', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 10 })

    expect((await service.setQuantity(ME, 'GV-N4060', 2)).items[0]!.quantity).toBe(2)
  })

  it('refuses a product that does not exist with 409 product_unavailable', async () => {
    const error = await failure(service.setQuantity(ME, 'REMOVED-1', 2))

    expect(error.code).toBe('product_unavailable')
    expect(error.details).toEqual({ productIds: ['REMOVED-1'] })
    expect(carts.stored.size).toBe(0)
  })

  it('refuses a 51st line with 409 cart_full', async () => {
    const many = Array.from({ length: 51 }, (_, index) => makeProduct({ id: `P-${index}` }))
    service = createCartService({
      carts: carts.repository,
      products: createMemoryProductRepository(many).repository,
      now: () => clock,
    })
    for (const product of many.slice(0, 50)) await service.setQuantity(ME, product.id, 1)

    const error = await failure(service.setQuantity(ME, 'P-50', 1))

    expect(error.code).toBe('cart_full')
  })
})

describe('removing from the cart', () => {
  it('takes the line out and keeps the others in order', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 1 })
    await service.add(ME, { productId: 'GV-N4060', quantity: 2 })

    const cart = await service.remove(ME, 'PSU-1')

    expect(cart.items).toEqual([{ productId: 'GV-N4060', quantity: 2 }])
  })

  it('does nothing, and writes nothing, for a product that is not in the cart', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 2 })
    const save = vi.spyOn(carts.repository, 'save')

    const cart = await service.remove(ME, 'PSU-1')

    expect(save).not.toHaveBeenCalled()
    expect(cart.items).toEqual([{ productId: 'GV-N4060', quantity: 2 }])
  })

  it('answers with an empty cart, and makes none, for an account that has no cart', async () => {
    expect(await service.remove(ME, 'PSU-1')).toEqual({ items: [], updatedAt: null })
    expect(carts.stored.size).toBe(0)
  })

  it('can take out a line whose product has since been removed from the catalog', async () => {
    await carts.repository.save(ME, [{ productId: 'GONE-1', quantity: 2 }], null, clock)

    const cart = await service.remove(ME, 'GONE-1')

    expect(cart.items).toEqual([])
  })

  it('keeps an emptied cart as a cart with no lines', async () => {
    await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    const cart = await service.remove(ME, 'GV-N4060')

    expect(cart.items).toEqual([])
    expect(cart.updatedAt).not.toBeNull()
  })
})

describe('emptying the cart', () => {
  it('removes every line', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 1 })
    await service.add(ME, { productId: 'GV-N4060', quantity: 1 })

    expect(await service.clear(ME)).toEqual({ items: [], updatedAt: null })
    expect(await service.get(ME)).toEqual({ items: [], updatedAt: null })
    expect(carts.stored.size).toBe(0)
  })

  it('does nothing for an account that has no cart', async () => {
    await expect(service.clear(ME)).resolves.toEqual({ items: [], updatedAt: null })
  })

  it('lets the account start again', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 5 })
    await service.clear(ME)

    const cart = await service.add(ME, { productId: 'PSU-1', quantity: 1 })

    expect(cart.items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })
})

describe('an account only has its own cart', () => {
  it('keeps two accounts apart in every operation', async () => {
    await service.add(ME, { productId: 'PSU-1', quantity: 2 })
    await service.add(SOMEONE, { productId: 'GV-N4060', quantity: 5 })

    await service.setQuantity(ME, 'PSU-1', 3)
    await service.remove(SOMEONE, 'PSU-1') // not theirs to remove

    expect((await service.get(ME)).items).toEqual([{ productId: 'PSU-1', quantity: 3 }])
    expect((await service.get(SOMEONE)).items).toEqual([{ productId: 'GV-N4060', quantity: 5 }])

    await service.clear(ME)

    expect((await service.get(ME)).items).toEqual([])
    expect((await service.get(SOMEONE)).items).toEqual([{ productId: 'GV-N4060', quantity: 5 }])
  })
})

describe('two changes at the same moment', () => {
  it('both count: four adds at once make a quantity of four', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () => service.add(ME, { productId: 'GV-N4060', quantity: 1 })),
    )

    expect((await service.get(ME)).items).toEqual([{ productId: 'GV-N4060', quantity: 4 }])
    expect(carts.stored.get(ME)!.revision).toBe(4)
  })

  it('reads the cart again and makes the change on top of the other one', async () => {
    const real = createMemoryCartRepository()
    await real.repository.save(ME, [{ productId: 'GV-N4060', quantity: 1 }], null, clock)
    let raced = false
    const racing: CartRepository = {
      ...real.repository,
      save: async (userId, items, expectedRevision, updatedAt) => {
        if (!raced) {
          raced = true
          // Another tab adds a product between this change's read and its write.
          const current = (await real.repository.find(userId))!
          await real.repository.save(
            userId,
            [...current.items, { productId: 'PSU-1', quantity: 4 }],
            current.revision,
            updatedAt,
          )
        }
        return real.repository.save(userId, items, expectedRevision, updatedAt)
      },
    }
    service = setUp(racing)

    const cart = await service.add(ME, { productId: 'GV-N4060', quantity: 2 })

    expect(raced).toBe(true)
    expect(cart.items).toEqual([
      { productId: 'GV-N4060', quantity: 3 },
      { productId: 'PSU-1', quantity: 4 },
    ])
  })

  it('gives up with 409 cart_conflict after five conflicts in a row', async () => {
    const save = vi.fn().mockRejectedValue(new CartConflictError())
    service = setUp({ ...carts.repository, save })

    const error = await failure(service.add(ME, { productId: 'GV-N4060', quantity: 1 }))

    expect(error.status).toBe(409)
    expect(error.code).toBe('cart_conflict')
    expect(save).toHaveBeenCalledTimes(5)
  })

  it('does not hide an error that is not a conflict', async () => {
    service = setUp({
      ...carts.repository,
      save: () => Promise.reject(new Error('not primary')),
    })

    await expect(service.add(ME, { productId: 'GV-N4060', quantity: 1 })).rejects.toThrow(
      'not primary',
    )
  })
})
