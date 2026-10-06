# Product data migration

The catalog moved from the legacy `products.json` (tag `legacy-v1`) to
`public/data/products.json`, validated by the Zod schema in `src/features/products/schema.ts`.

That file is now the **source** of the catalog, not what the site reads: `npm run seed:products`
copies it to MongoDB, the API serves it from there, and the site validates what the API sends with
the same schema. The build still generates the static SEO pages from it, and the tests read it
(see [`deployment.md`](deployment.md#updating-the-products)). The migration below describes how the
data in that file was shaped.

## Field mapping (old → new)

| Legacy field                      | New field                      | Notes                                                                       |
| --------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `id`                              | `id`                           | Manufacturer SKU, unchanged. Used in URLs (`/products/:id`).                |
| `category`                        | `category`                     | Same ids, validated against `CATEGORY_IDS`.                                 |
| `company`                         | `brand`                        | `cooler master` → `cooler-master`; other values unchanged.                  |
| `name`, `fullName`                | `name`, `fullName`             | Unchanged.                                                                  |
| `priceNew`                        | `price.current`                |                                                                             |
| `priceOld` (`null`)               | `price.original` (omitted)     | `null` becomes an absent key.                                               |
| `priceEilat` (`null`)             | `price.eilat` (omitted)        |                                                                             |
| `Recommend`                       | `isRecommended`                |                                                                             |
| `image`                           | `images.card`                  | Converted to WebP.                                                          |
| `mainImage` + `gallery[].large`   | `images.gallery[]`             | `mainImage` was always `gallery[0].large`; the first entry is the main one. |
| `gallery[].small`                 | _dropped_                      | 74×74 thumbnails; the UI scales the gallery images instead.                 |
| `brand`, `brandPage` (logo paths) | _derived_                      | Logos now come from the brand registry (`brands.ts`).                       |
| `link`                            | `manufacturerUrl`              | Must be an http(s) URL.                                                     |
| `warranty`                        | `warranty`                     | Translated, see below.                                                      |
| `features`                        | `features`                     | Unchanged.                                                                  |
| `attributes` (object)             | `specs` (`[{ label, value }]`) | Order preserved; some labels translated, see below.                         |

## Data corrections

1. **Removed `banana`**: a joke/test entry (GPU, ₪15,000, Eilat ₪20, warranty "1 minutes",
   marked recommended). Excluded at the owner's request; still in `legacy-v1`.
2. **`N406TGAMINGOC8GD`**: `priceOld` 1924 was lower than `priceNew` 2138, which showed a
   price increase as a "sale". `priceOld` removed.
3. **`M27Q`**: `priceOld` 858 was lower than `priceNew` 969. `priceOld` removed.

For 2 and 3 the real previous price is unknown, so none was invented. The schema now rejects
any product whose `original` price is not higher than `current`.

## Presentation normalisation

- **Warranty**: `2 Years` → `שנתיים`, `3 Years` → `3 שנים`, `5 Years` → `5 שנים`,
  `Lifetime` → `לכל החיים`.
- **Spec labels**: 19 labels were raw English keys that the old filter code relied on. They
  are now Hebrew like the rest: `Recommended PSU` → `ספק כוח מומלץ`, `socket` → `תושבת מעבד`,
  `chipset` → `ערכת שבבים`, `form factor` → `גודל לוח`, `memory slots` → `חריצי זיכרון`,
  `max memory` → `זיכרון מקסימלי`, `memory speed` → `מהירות זיכרון`,
  `expansion slots` → `חריצי הרחבה`, `storage` → `אחסון`, `audio` → `שמע`, `network` → `רשת`,
  `USB ports` → `חיבורי USB`, `rear I/O` → `חיבורים אחוריים`,
  `power connectors` → `מחברי חשמל`, `cooling` → `קירור`, `ram` → `זיכרון`,
  `rezolution` → `רזולוציה`, `Hz` → `קצב רענון`, `VESA` → `VESA`.
- **Images**: renamed to `images/products/<sku>/card.webp` and `1.webp`, `2.webp`, …

## Known data issues (not changed)

- `FO32U`: `priceOld` 7551 vs `priceNew` 4096 (a 46% discount). Valid per the schema but
  worth confirming.
- `C225TC225T`: the SKU looks duplicated (`C225T` + `C225T`). Kept as the URL id.
- Category "memory", "storage", "case", "keyboard", "thermal" and "headset" have no
  category artwork, so they appear in navigation only.
