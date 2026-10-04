import { useState } from 'react'
import { ChevronEndIcon, ChevronStartIcon } from '@/components/icons'
import { assetUrl } from '@/lib/assets'
import type { HeroSlide } from '../heroSlides'

const arrowClass =
  'absolute top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow hover:bg-white'

/**
 * Banner carousel. It never advances on its own (auto-rotation is hard to use with assistive
 * technology and for people who need more time), only through the previous/next buttons and
 * the slide dots. Only the current slide is exposed to assistive technology.
 */
export function HeroCarousel({ slides }: { slides: readonly HeroSlide[] }) {
  const [current, setCurrent] = useState(0)
  const count = slides.length
  const goTo = (index: number) => setCurrent((index + count) % count)

  if (count === 0) return null

  return (
    <section aria-roledescription="carousel" aria-label="באנרים">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <div aria-live="polite">
          {slides.map((slide, index) => (
            <div
              key={slide.image}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} מתוך ${count}`}
              hidden={index !== current}
            >
              <img
                src={assetUrl(slide.image)}
                alt={slide.alt}
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                className="aspect-[2/1] w-full object-cover sm:aspect-[1834/788] sm:max-h-[33rem]"
              />
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="הקודם"
              onClick={() => goTo(current - 1)}
              className={`${arrowClass} start-3`}
            >
              <ChevronStartIcon />
            </button>
            <button
              type="button"
              aria-label="הבא"
              onClick={() => goTo(current + 1)}
              className={`${arrowClass} end-3`}
            >
              <ChevronEndIcon />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div role="group" aria-label="בחירת באנר" className="mt-3 flex justify-center gap-1">
          {slides.map((slide, index) => (
            <button
              key={slide.image}
              type="button"
              aria-label={`באנר ${index + 1} מתוך ${count}`}
              aria-current={index === current ? 'true' : undefined}
              onClick={() => goTo(index)}
              className="inline-flex size-6 items-center justify-center rounded-full"
            >
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full transition-colors ${
                  index === current ? 'bg-brand' : 'bg-line hover:bg-muted'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
