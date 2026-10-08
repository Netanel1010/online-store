import { BRANDS } from '../features/products/brands.ts'
import type { Category } from '../features/products/categories.ts'
import type { Product } from '../features/products/schema.ts'
import { INFO_PAGES, type InfoPageId } from './infoPages.ts'

/* ---------------------------------------------------------------------------------------------
 * Page metadata (title, description, canonical URL, social tags, structured data).
 *
 * One definition feeds two places, so they cannot drift apart:
 *  - the React app (`PageMeta`) keeps the tags in sync while the visitor navigates, and
 *  - `scripts/static-routes.mjs` writes the same tags into the HTML file of every indexable
 *    page at build time. Search engines and link previews read that HTML, and most of them do
 *    not run the app first.
 *
 * This file is imported by Node directly (type stripping), so it only uses erasable TypeScript
 * and imports with explicit `.ts` extensions.
 * ------------------------------------------------------------------------------------------- */

/** Where the site is deployed (GitHub Pages project site). Canonical and social URLs are absolute. */
export const SITE_URL = 'https://netanel1010.github.io/online-store/'
export const SITE_NAME = 'N.M.S'

export interface PageMetaData {
  title: string
  description: string
  /** Path of the page below the site root, without slashes at the ends ("" for the home page).
   *  Leave it out for pages that must not be indexed: they get `noindex` and no canonical URL. */
  path?: string
  /** Image for link previews, relative to `public/`. */
  image?: string
  /** Structured data (schema.org) written into the static HTML of the page. */
  jsonLd?: readonly object[]
}

const DEMO_NOTE = 'פרויקט הדגמה ללא רכישה אמיתית.'

/** Absolute URL of a page. Pages are served as folders, so they end with a slash. */
export function pageUrl(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, '')
  if (clean === '') return SITE_URL
  return `${SITE_URL}${clean.split('/').map(encodeURIComponent).join('/')}/`
}

/** Absolute URL of a file from `public/`. */
export function assetPageUrl(path: string): string {
  return `${SITE_URL}${path.replace(/^\/+/, '')}`
}

export function homeMeta(): PageMetaData {
  return {
    title: `${SITE_NAME} | חנות רכיבי מחשב`,
    description: `חנות רכיבי מחשב: מעבדים, כרטיסי מסך, לוחות אם, מסכים ועוד. ${DEMO_NOTE}`,
    path: '',
  }
}

export function productsMeta(): PageMetaData {
  return {
    title: `כל המוצרים | ${SITE_NAME}`,
    description:
      'כל רכיבי המחשב בחנות: מעבדים, כרטיסי מסך, לוחות אם, זיכרונות, מסכים ועוד, עם סינון לפי מותג ומפרט.',
    path: 'products',
  }
}

export function categoryMeta(category: Pick<Category, 'id' | 'label'>): PageMetaData {
  return {
    title: `${category.label} | ${SITE_NAME}`,
    description: `${category.label} בחנות ${SITE_NAME}: מוצרים, מחירים ומפרטים, עם סינון לפי מותג ומפרט.`,
    path: `category/${category.id}`,
  }
}

export function productMeta(
  product: Product,
  category?: Pick<Category, 'id' | 'label'>,
): PageMetaData {
  const brand = BRANDS[product.brand]
  const path = `products/${product.id}`
  // The full name usually starts with the brand; only add the brand when it does not.
  const named = product.fullName.toLowerCase().includes(brand.name.toLowerCase())
    ? product.fullName
    : `${product.fullName} (${brand.name})`
  return {
    title: `${product.name} | ${SITE_NAME}`,
    description: `${named}, מק"ט ${product.id}. אחריות: ${product.warranty}.`,
    path,
    image: product.images.card,
    jsonLd: [productJsonLd(product), breadcrumbJsonLd(product, category)],
  }
}

/** An information page (about, contact, accessibility, privacy, terms): public and indexable. */
export function infoMeta(id: InfoPageId): PageMetaData {
  const page = INFO_PAGES[id]
  return {
    title: `${page.label} | ${SITE_NAME}`,
    description: page.description,
    path: page.path,
  }
}

/** Results of a search are not a page worth indexing: they depend on what was typed. */
export function searchMeta(query: string): PageMetaData {
  return {
    title: query ? `חיפוש: ${query} | ${SITE_NAME}` : `חיפוש | ${SITE_NAME}`,
    description: 'תוצאות חיפוש בחנות רכיבי המחשב.',
  }
}

/** Pages with no value for search engines: the cart, the account pages, checkout, errors. */
export function noindexMeta(pageTitle: string): PageMetaData {
  return {
    title: `${pageTitle} | ${SITE_NAME}`,
    description: `${pageTitle} בחנות רכיבי המחשב. ${DEMO_NOTE}`,
  }
}

/* ------------------------------------------------------------------------- structured data */

/**
 * schema.org Product, generated only from what the catalog really says: the name, the
 * manufacturer SKU, the brand, the images and the current price in shekels. There is no
 * availability, rating or review in the data, so none is claimed.
 */
export function productJsonLd(product: Product): object {
  const url = pageUrl(`products/${product.id}`)
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.fullName,
    sku: product.id,
    mpn: product.id,
    brand: { '@type': 'Brand', name: BRANDS[product.brand].name },
    image: product.images.gallery.map(assetPageUrl),
    url,
    offers: {
      '@type': 'Offer',
      url,
      price: product.price.current,
      priceCurrency: 'ILS',
    },
  }
}

export function breadcrumbJsonLd(
  product: Product,
  category?: Pick<Category, 'id' | 'label'>,
): object {
  const crumbs = [
    { name: 'בית', url: pageUrl('') },
    { name: 'מוצרים', url: pageUrl('products') },
    ...(category ? [{ name: category.label, url: pageUrl(`category/${category.id}`) }] : []),
    { name: product.name, url: pageUrl(`products/${product.id}`) },
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  }
}

/* ----------------------------------------------------------------------------- static HTML */

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** JSON for a <script> element: "<" is escaped so the data can never close the element. */
function jsonForScript(data: object): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c')
}

/** The head tags of a page, as HTML. Pages without a `path` are marked noindex. */
export function renderSeoTags(meta: PageMetaData): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
  ]
  if (meta.path === undefined) {
    tags.push('<meta name="robots" content="noindex, follow" />')
  } else {
    const url = pageUrl(meta.path)
    tags.push(`<link rel="canonical" href="${escapeHtml(url)}" />`)
    tags.push(`<meta property="og:url" content="${escapeHtml(url)}" />`)
  }
  tags.push(
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    '<meta property="og:locale" content="he_IL" />',
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
  )
  if (meta.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(assetPageUrl(meta.image))}" />`)
  }
  tags.push('<meta name="twitter:card" content="summary" />')
  for (const data of meta.jsonLd ?? []) {
    tags.push(`<script type="application/ld+json">${jsonForScript(data)}</script>`)
  }
  return tags.join('\n    ')
}
