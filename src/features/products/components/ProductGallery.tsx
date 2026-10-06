import { useState } from 'react'
import { ChevronEndIcon, ChevronStartIcon } from '@/components/icons'
import { assetUrl } from '@/lib/assets'
import { IMAGE_SIZE } from '@/lib/imageSizes'

interface ProductGalleryProps {
  /** Image paths relative to `public/`. The first one is shown initially. */
  images: readonly string[]
  productName: string
}

const arrowClass =
  'absolute top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/90 text-ink shadow-sm transition hover:bg-white'

/**
 * Main image with previous/next buttons and thumbnails. Remount (via `key`) when the product
 * changes. The thumbnails stay on one row and scroll sideways, so many images never push the
 * page content down on a phone.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0)
  const total = images.length
  const mainImage = images[selected] ?? images[0]
  const goTo = (index: number) => setSelected((index + total) % total)

  return (
    // min-w-0: a grid item may not be wider than its column just because the thumbnails are.
    <div className="min-w-0 lg:sticky lg:top-32 lg:self-start">
      <div className="relative flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-white p-4 sm:aspect-square lg:max-h-[34rem]">
        {mainImage && (
          <img
            src={assetUrl(mainImage)}
            alt={`${productName} - תמונה ${selected + 1} מתוך ${total}`}
            decoding="async"
            fetchPriority="high"
            className="size-full object-contain"
          />
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              aria-label="תמונה קודמת"
              onClick={() => goTo(selected - 1)}
              className={`${arrowClass} start-3`}
            >
              <ChevronStartIcon />
            </button>
            <button
              type="button"
              aria-label="תמונה הבאה"
              onClick={() => goTo(selected + 1)}
              className={`${arrowClass} end-3`}
            >
              <ChevronEndIcon />
            </button>
            {/* The image's own text already says "image 2 of 5"; this is the same for the eyes. */}
            <p
              aria-hidden="true"
              dir="ltr"
              className="absolute bottom-3 end-3 rounded-full bg-ink/75 px-2.5 py-0.5 text-xs font-medium text-white"
            >
              {selected + 1} / {total}
            </p>
          </>
        )}
      </div>

      {total > 1 && (
        <ul
          className="mt-3 flex gap-2 overflow-x-auto p-1 [scrollbar-width:thin]"
          aria-label="תמונות המוצר"
        >
          {images.map((image, index) => (
            <li key={image} className="shrink-0">
              <button
                type="button"
                aria-label={`הצגת תמונה ${index + 1} מתוך ${total}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={`size-16 rounded-lg border bg-white p-1 transition sm:size-[4.5rem] ${
                  index === selected
                    ? 'border-brand ring-2 ring-brand'
                    : 'border-line opacity-80 hover:border-brand hover:opacity-100'
                }`}
              >
                <img
                  src={assetUrl(image)}
                  alt=""
                  {...IMAGE_SIZE.productPicture}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-contain"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
