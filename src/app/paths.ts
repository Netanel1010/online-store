/** Single source of truth for app URLs. */
export const paths = {
  home: '/',
  products: '/products',
  category: (id: string) => `/category/${encodeURIComponent(id)}`,
  product: (id: string) => `/products/${encodeURIComponent(id)}`,
  search: '/search',
  /** Search results for a text, e.g. /search?q=intel. */
  searchFor: (q: string) => `/search?${new URLSearchParams({ q }).toString()}`,
  cart: '/cart',
  favorites: '/favorites',
  login: '/login',
  register: '/register',
  checkout: '/checkout',
  /** One order of the signed-in account, by its order number. */
  order: (orderNumber: string) => `/orders/${encodeURIComponent(orderNumber)}`,
} as const
