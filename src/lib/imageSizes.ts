/**
 * The `width` and `height` attributes of the images the storefront loads lazily. The browser
 * derives each image's aspect ratio from them, so the space is reserved before the file arrives
 * and the content below does not jump (layout shift). They describe the shape of the file only:
 * the CSS classes on each `<img>` still decide the size that is shown, and `object-fit` still
 * decides how it fills its box, so nothing is stretched. Spread them: `<img {...IMAGE_SIZE.x} />`.
 *
 * `imageSizes.test.ts` checks them against the real files.
 */
export const IMAGE_SIZE = {
  /** Every brand logo in `public/images/brands/` is 90x40. */
  brandLogo: { width: 90, height: 40 },
  /** Every category artwork in `public/images/categories/` is 163x102. */
  category: { width: 163, height: 102 },
  /**
   * Product pictures (card and gallery) are square, and they are always shown in a box of fixed
   * size with `object-contain`. The one gallery picture that is not square is therefore never
   * stretched: the box, not the file, gives the layout its shape.
   */
  productPicture: { width: 228, height: 228 },
} as const
