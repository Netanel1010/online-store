import type { DeliveryDetails } from '../../../src/features/checkout/delivery.ts'

export type { DeliveryDetails }

/**
 * One line of an order, frozen at the moment it was placed: what the product was called and what
 * it cost then. A later change to the catalog never changes an order.
 */
export interface OrderLine {
  productId: string
  name: string
  /** The price of one unit, in whole ILS. */
  unitPrice: number
  /** The price before the sale, only when the product was on sale. */
  originalUnitPrice?: number
  quantity: number
}

/**
 * An order as it is stored. Orders are never changed after they are made, and they always belong
 * to one account. An order is identified outside by its order number.
 */
export interface Order {
  orderNumber: string
  userId: string
  /** What the client sent to make a retry of the same request safe (see the service). */
  idempotencyKey: string
  /** A digest of what the request asked for, to tell a retry from a different request. */
  requestHash: string
  createdAt: Date
  /** There is only one state: payment, shipping and the rest of an order's life are not modelled. */
  status: 'placed'
  lines: OrderLine[]
  /** All amounts are whole ILS, worked out by the server from the products it holds. */
  total: number
  originalTotal: number
  savings: number
  delivery: DeliveryDetails
}

/** What the API shows of an order: nothing that identifies the request or the account. */
export interface PublicOrder {
  orderNumber: string
  createdAt: string
  status: 'placed'
  lines: OrderLine[]
  total: number
  originalTotal: number
  savings: number
  delivery: DeliveryDetails
}

/** One page of an account's orders, the newest first. */
export interface OrderPage {
  items: PublicOrder[]
  page: number
  limit: number
  /** Number of orders the account has in all. */
  total: number
  totalPages: number
}
