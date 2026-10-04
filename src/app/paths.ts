/** Single source of truth for app URLs. */
export const paths = {
  home: '/',
  products: '/products',
  category: (id: string) => `/category/${encodeURIComponent(id)}`,
  product: (id: string) => `/products/${encodeURIComponent(id)}`,
  cart: '/cart',
  favorites: '/favorites',
} as const
