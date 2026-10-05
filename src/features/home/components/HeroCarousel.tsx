import { useEffect, useState, useSyncExternalStore, type FocusEvent } from 'react'
import { ChevronEndIcon, ChevronStartIcon, PauseIcon, PlayIcon } from '@/components/icons'
import { assetUrl } from '@/lib/assets'
import { HERO_AUTOPLAY_DELAY_MS, type HeroSlide } from '../heroSlides'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

const arrowClass =
  'absolute top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow hover:bg-white'

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(REDUCED_MOTION_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

/**
 * Autoplay is `auto` until the visitor acts: it then pauses while the pointer is over the
 * carousel or focus is inside it. Using an arrow or a dot, or the pause button, `stopped` it
 * for good. Pressing play (`forced`) is an explicit request, so hover and focus no longer pause it.
 * In every mode it also waits while the tab is hidden, and it never runs when the visitor
 * prefers reduced motion.
 */
type Autoplay = 'auto' | 'stopped' | 'forced'

/**
 * Banner carousel with previous/next buttons, slide dots and automatic rotation that the visitor
 * can pause. Only the current slide is exposed to assistive technology, and the live region is
 * silent while the carousel rotates by itself so it does not interrupt a screen reader.
 */
export function HeroCarousel({ slides }: { slides: readonly HeroSlide[] }) {
  const [current, setCurrent] = useState(0)
  const [hasMoved, setHasMoved] = useState(false)
  const [autoplay, setAutoplay] = useState<Autoplay>('auto')
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false,
  )
  const pageHidden = useSyncExternalStore(
    subscribeToVisibility,
    () => document.hidden,
    () => false,
  )

  const count = slides.length
  const canAutoplay = count > 1 && !reducedMotion
  const advancing =
    canAutoplay &&
    !pageHidden &&
    (autoplay === 'forced' || (autoplay === 'auto' && !hovered && !focused))

  const goTo = (index: number) => {
    setCurrent((index + count) % count)
    setHasMoved(true)
  }

  // One timer at a time: it is restarted whenever the slide or the conditions change, so a
  // manual change always gets a full delay, and it is cleared on unmount.
  useEffect(() => {
    if (!advancing) return
    const timer = setTimeout(() => {
      setCurrent((index) => (index + 1) % count)
      setHasMoved(true)
    }, HERO_AUTOPLAY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [advancing, current, count])

  if (count === 0) return null

  const chooseSlide = (index: number) => {
    setAutoplay('stopped')
    goTo(index)
  }

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="באנרים"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
    >
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <div aria-live={advancing ? 'off' : 'polite'}>
          {slides.map((slide, index) => (
            <div
              key={slide.image}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} מתוך ${count}`}
              hidden={index !== current}
              className={
                index === current && hasMoved ? 'motion-safe:animate-hero-fade' : undefined
              }
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
              onClick={() => chooseSlide(current - 1)}
              className={`${arrowClass} start-3`}
            >
              <ChevronStartIcon />
            </button>
            <button
              type="button"
              aria-label="הבא"
              onClick={() => chooseSlide(current + 1)}
              className={`${arrowClass} end-3`}
            >
              <ChevronEndIcon />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1">
          {canAutoplay && (
            <button
              type="button"
              aria-label={
                autoplay === 'stopped'
                  ? 'הפעלת מעבר אוטומטי בין הבאנרים'
                  : 'השהיית מעבר אוטומטי בין הבאנרים'
              }
              onClick={() => setAutoplay(autoplay === 'stopped' ? 'forced' : 'stopped')}
              className="me-2 inline-flex size-8 items-center justify-center rounded-full border border-line text-ink hover:bg-surface"
            >
              {autoplay === 'stopped' ? <PlayIcon /> : <PauseIcon />}
            </button>
          )}
          <div role="group" aria-label="בחירת באנר" className="flex gap-1">
            {slides.map((slide, index) => (
              <button
                key={slide.image}
                type="button"
                aria-label={`באנר ${index + 1} מתוך ${count}`}
                aria-current={index === current ? 'true' : undefined}
                onClick={() => chooseSlide(index)}
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
        </div>
      )}
    </section>
  )
}
