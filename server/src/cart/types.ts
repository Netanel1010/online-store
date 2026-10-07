/** One line of a cart: which product, and how many. Nothing else about the product is kept. */
export interface CartItem {
  productId: string
  quantity: number
}

/**
 * A cart as it is stored: one document per account. Names and prices are never kept in it (they are
 * read from the products when an order is placed), so a cart can never show or charge a stale price.
 */
export interface StoredCart {
  userId: string
  /** In the order the products were added. */
  items: CartItem[]
  /**
   * Counts the changes. A change is written only if the cart is still at the revision it was read
   * at, so two changes at the same moment can never overwrite each other (see the service).
   */
  revision: number
  updatedAt: Date
}

/** What the API shows of a cart. An account that has never added anything has an empty one. */
export interface PublicCart {
  items: CartItem[]
  /** When the cart was last changed, or null for a cart that has never been used. */
  updatedAt: string | null
}
