import { MAX_ORDER_LINES, MAX_QUANTITY } from '../../../src/features/cart/limits.ts'
import { HttpError } from '../lib/httpError.ts'
import type { ProductRepository } from '../products/repository.ts'
import { CartConflictError, type CartRepository } from './repository.ts'
import type { AddItemInput } from './schemas.ts'
import type { CartItem, PublicCart, StoredCart } from './types.ts'

/** How often a change is read and made again when another change got in first. */
const MAX_ATTEMPTS = 5

export interface CartService {
  /** The account's cart (an empty one if it has never added anything). */
  get(userId: string): Promise<PublicCart>
  /** Adds units of a product, merging with its line and stopping at the largest quantity allowed. */
  add(userId: string, input: AddItemInput): Promise<PublicCart>
  /** Sets the quantity of a product's line, making the line if there is none. */
  setQuantity(userId: string, productId: string, quantity: number): Promise<PublicCart>
  /** Removes a product's line. Quietly does nothing when there is none. */
  remove(userId: string, productId: string): Promise<PublicCart>
  /** Empties the cart. */
  clear(userId: string): Promise<PublicCart>
}

interface Dependencies {
  carts: CartRepository
  products: Pick<ProductRepository, 'findByIds'>
  now?: () => Date
}

const EMPTY: PublicCart = { items: [], updatedAt: null }

const toPublic = (cart: Pick<StoredCart, 'items' | 'updatedAt'> | null): PublicCart =>
  cart === null
    ? EMPTY
    : {
        items: cart.items.map(({ productId, quantity }) => ({ productId, quantity })),
        updatedAt: cart.updatedAt.toISOString(),
      }

const cartFull = () =>
  new HttpError(409, 'cart_full', `The cart can hold at most ${MAX_ORDER_LINES} different products`)

/**
 * The rules of the cart: what may be put in it and how a change is made. It talks to the
 * repositories, never to MongoDB, and knows nothing about Express. A failure the client caused is
 * thrown as an `HttpError`, so the central error handler answers it.
 *
 * The cart keeps product ids and quantities and nothing else. A product must exist in the catalog
 * to be put in the cart (a missing one is the same `409 product_unavailable` an order gives), but
 * nothing about it is copied: names and prices are read from the products when an order is placed.
 * A line whose product has been removed since can still be taken out, as it stays in the cart.
 *
 * A change reads the cart, makes the new list of lines and writes it only if the cart is still at
 * the revision that was read (see the repository), reading and changing again if it is not, so two
 * changes at the same moment, from two tabs, are both made.
 */
export function createCartService({
  carts,
  products,
  now = () => new Date(),
}: Dependencies): CartService {
  async function requireProduct(productId: string) {
    const [found] = await products.findByIds([productId])
    if (found === undefined) {
      throw new HttpError(
        409,
        'product_unavailable',
        'Some of the products are not available',
        {},
        { productIds: [productId] },
      )
    }
  }

  /**
   * Applies a change to the account's lines. `change` returns the new lines, or null for "nothing to
   * change", in which case nothing is written.
   */
  async function change(
    userId: string,
    next: (items: CartItem[]) => CartItem[] | null,
  ): Promise<PublicCart> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const cart = await carts.find(userId)
      const items = next(cart?.items ?? [])
      if (items === null || JSON.stringify(items) === JSON.stringify(cart?.items ?? [])) {
        return toPublic(cart)
      }
      const updatedAt = now()
      try {
        await carts.save(userId, items, cart?.revision ?? null, updatedAt)
        return toPublic({ items, updatedAt })
      } catch (error) {
        if (!(error instanceof CartConflictError)) throw error
      }
    }
    throw new HttpError(409, 'cart_conflict', 'The cart was changed at the same time. Try again')
  }

  return {
    async get(userId) {
      return toPublic(await carts.find(userId))
    },

    async add(userId, { productId, quantity }) {
      await requireProduct(productId)
      return change(userId, (items) => {
        if (items.some((item) => item.productId === productId)) {
          return items.map((item) =>
            item.productId === productId
              ? { productId, quantity: Math.min(MAX_QUANTITY, item.quantity + quantity) }
              : item,
          )
        }
        if (items.length >= MAX_ORDER_LINES) throw cartFull()
        return [...items, { productId, quantity }]
      })
    },

    async setQuantity(userId, productId, quantity) {
      await requireProduct(productId)
      return change(userId, (items) => {
        if (items.some((item) => item.productId === productId)) {
          return items.map((item) =>
            item.productId === productId ? { productId, quantity } : item,
          )
        }
        if (items.length >= MAX_ORDER_LINES) throw cartFull()
        return [...items, { productId, quantity }]
      })
    },

    remove(userId, productId) {
      return change(userId, (items) => {
        const left = items.filter((item) => item.productId !== productId)
        return left.length === items.length ? null : left
      })
    },

    async clear(userId) {
      await carts.delete(userId)
      return EMPTY
    },
  }
}
