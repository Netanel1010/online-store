import { useState } from 'react'
import { assetUrl } from '@/lib/assets'

interface ProductGalleryProps {
  /** Image paths relative to `public/`. The first one is shown initially. */
  images: readonly string[]
  productName: string
}

/** Main image with thumbnail buttons. Remount (via `key`) when the product changes. */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0)
  const total = images.length
  const mainImage = images[selected] ?? images[0]

  return (
    <div>
      <div className="flex aspect-square items-center justify-center rounded-xl border border-line bg-white p-4">
        {mainImage && (
          <img
            src={assetUrl(mainImage)}
            alt={`${productName} - תמונה ${selected + 1} מתוך ${total}`}
            decoding="async"
            className="size-full object-contain"
          />
        )}
      </div>

      {total > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="תמונות המוצר">
          {images.map((image, index) => (
            <li key={image}>
              <button
                type="button"
                aria-label={`הצגת תמונה ${index + 1} מתוך ${total}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={`size-16 rounded-lg border bg-white p-1 transition-colors ${
                  index === selected
                    ? 'border-brand ring-1 ring-brand'
                    : 'border-line hover:border-brand'
                }`}
              >
                <img
                  src={assetUrl(image)}
                  alt=""
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
