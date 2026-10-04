export const CATEGORY_IDS = [
  'cpu',
  'gpu',
  'memory',
  'storage',
  'motherboard',
  'monitor',
  'psu',
  'cooler',
  'case',
  'keyboard',
  'thermal',
  'headset',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export interface Category {
  id: CategoryId
  label: string
  /** Path relative to `public/`. Only some categories have artwork. */
  image?: string
}

export const CATEGORIES: readonly Category[] = [
  { id: 'cpu', label: 'מעבדים', image: 'images/categories/cpu.webp' },
  { id: 'gpu', label: 'כרטיסי מסך', image: 'images/categories/gpu.webp' },
  { id: 'motherboard', label: 'לוחות אם', image: 'images/categories/motherboard.webp' },
  { id: 'psu', label: 'ספקי כוח', image: 'images/categories/psu.webp' },
  { id: 'cooler', label: 'פתרונות קירור', image: 'images/categories/cooler.webp' },
  { id: 'monitor', label: 'מסכי מחשב', image: 'images/categories/monitor.webp' },
  { id: 'memory', label: 'זיכרונות' },
  { id: 'storage', label: 'אחסון' },
  { id: 'case', label: 'מארזים' },
  { id: 'keyboard', label: 'מקלדות' },
  { id: 'thermal', label: 'משחות טרמיות' },
  { id: 'headset', label: 'אוזניות' },
]

const categoriesById = new Map<string, Category>(CATEGORIES.map((c) => [c.id, c]))

/** Looks up a category from untrusted input such as a URL parameter. */
export function findCategory(id: string | undefined): Category | undefined {
  return id === undefined ? undefined : categoriesById.get(id)
}
