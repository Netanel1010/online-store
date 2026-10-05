import { z } from 'zod'
// The extensions are required because the API (server/) imports this file as well: it runs as Node
// ES modules, which do not resolve extensionless imports. The app and its tests are not affected.
import { BRAND_IDS } from './brands.ts'
import { CATEGORY_IDS } from './categories.ts'

const nonEmpty = z.string().trim().min(1)

const priceSchema = z
  .object({
    /** Current selling price in ILS. */
    current: z.number().int().positive(),
    /** Previous price in ILS. Only present when the product is on sale. */
    original: z.number().int().positive().optional(),
    /** Price in ILS for purchases in Eilat. */
    eilat: z.number().int().positive().optional(),
  })
  .refine((price) => price.original === undefined || price.original > price.current, {
    message: 'original price must be greater than the current price',
    path: ['original'],
  })

export const productSchema = z.object({
  /** Manufacturer SKU. Used as the product identifier in URLs. */
  id: nonEmpty,
  category: z.enum(CATEGORY_IDS),
  brand: z.enum(BRAND_IDS),
  name: nonEmpty,
  fullName: nonEmpty,
  price: priceSchema,
  images: z.object({
    /** Listing-card image, relative to `public/`. */
    card: nonEmpty,
    /** Detail-page images, relative to `public/`. The first one is the main image. */
    gallery: z.array(nonEmpty).min(1),
  }),
  isRecommended: z.boolean(),
  warranty: nonEmpty,
  manufacturerUrl: z.httpUrl(),
  features: z.array(nonEmpty),
  specs: z.array(z.object({ label: nonEmpty, value: nonEmpty })),
})

export const productsSchema = z.array(productSchema).superRefine((products, ctx) => {
  const seen = new Set<string>()
  products.forEach((product, index) => {
    if (seen.has(product.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate product id "${product.id}"`,
        path: [index, 'id'],
      })
    }
    seen.add(product.id)
  })
})

export type Product = z.infer<typeof productSchema>
