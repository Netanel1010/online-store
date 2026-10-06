import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { stubReducedMotion } from '@/test/reducedMotion'
import { HERO_AUTOPLAY_DELAY_MS, type HeroSlide } from '../heroSlides'
import { HeroCarousel } from './HeroCarousel'

const SIZE = { width: 1834, height: 788 }
const slides: HeroSlide[] = [
  { image: 'images/hero/a.avif', alt: 'ראשון', ...SIZE },
  { image: 'images/hero/b.avif', alt: 'שני', ...SIZE },
  { image: 'images/hero/c.avif', alt: 'שלישי', ...SIZE },
]
const DELAY = HERO_AUTOPLAY_DELAY_MS

const pauseButton = () => screen.getByRole('button', { name: 'השהיית מעבר אוטומטי בין הבאנרים' })
const playButton = () => screen.getByRole('button', { name: 'הפעלת מעבר אוטומטי בין הבאנרים' })
const carousel = () => screen.getByRole('region', { name: 'באנרים' })
const slideElements = () =>
  within(carousel())
    .getAllByRole('group', { hidden: true })
    .filter((group) => group.getAttribute('aria-roledescription') === 'slide')
const currentIndex = () => slideElements().findIndex((slide) => !slide.hidden)

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function setPageHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function setup() {
  stubReducedMotion(false)
  vi.useFakeTimers()
  render(<HeroCarousel slides={slides} />)
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

describe('HeroCarousel autoplay', () => {
  it('moves to the next slide every 4 seconds and wraps around', () => {
    setup()
    expect(DELAY).toBe(4000)
    expect(currentIndex()).toBe(0)

    advance(DELAY - 1)
    expect(currentIndex()).toBe(0)
    advance(1)
    expect(currentIndex()).toBe(1)
    advance(DELAY)
    expect(currentIndex()).toBe(2)
    advance(DELAY)
    expect(currentIndex()).toBe(0)
  })

  it('runs a single timer and clears it when the carousel goes away', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    const { unmount } = render(<HeroCarousel slides={slides} />)
    expect(vi.getTimerCount()).toBe(1)

    advance(DELAY)
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses while the pointer is over the carousel and resumes when it leaves', () => {
    setup()

    fireEvent.mouseEnter(carousel())
    expect(vi.getTimerCount()).toBe(0)
    advance(DELAY * 3)
    expect(currentIndex()).toBe(0)

    fireEvent.mouseLeave(carousel())
    advance(DELAY)
    expect(currentIndex()).toBe(1)
  })

  it('pauses while keyboard focus is inside the carousel and resumes when it leaves', () => {
    setup()
    const next = screen.getByRole('button', { name: 'הבא' })

    act(() => next.focus())
    advance(DELAY * 3)
    expect(currentIndex()).toBe(0)

    act(() => next.blur())
    advance(DELAY)
    expect(currentIndex()).toBe(1)
  })

  it('stays paused when focus moves between controls inside the carousel', () => {
    setup()
    act(() => screen.getByRole('button', { name: 'הבא' }).focus())
    act(() => pauseButton().focus())

    advance(DELAY * 2)
    expect(currentIndex()).toBe(0)
  })

  it('waits while the browser tab is hidden and continues when it is visible again', () => {
    setup()

    setPageHidden(true)
    advance(DELAY * 3)
    expect(currentIndex()).toBe(0)

    setPageHidden(false)
    advance(DELAY)
    expect(currentIndex()).toBe(1)
  })

  it('stops for good after the visitor uses an arrow or a dot', () => {
    setup()

    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(currentIndex()).toBe(1)
    advance(DELAY * 5)
    expect(currentIndex()).toBe(1)
    expect(vi.getTimerCount()).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'באנר 3 מתוך 3' }))
    advance(DELAY * 5)
    expect(currentIndex()).toBe(2)
  })

  it('pauses and resumes from the pause button, which names its current action', () => {
    setup()

    fireEvent.click(pauseButton())
    expect(playButton()).toBeInTheDocument()
    advance(DELAY * 3)
    expect(currentIndex()).toBe(0)

    // Hover and focus are on the carousel now, but playing was asked for explicitly.
    fireEvent.click(playButton())
    expect(pauseButton()).toBeInTheDocument()
    advance(DELAY)
    expect(currentIndex()).toBe(1)
  })

  it('announces slide changes politely only while it is not rotating by itself', () => {
    setup()
    const liveRegion = () => carousel().querySelector('[aria-live]')

    expect(liveRegion()).toHaveAttribute('aria-live', 'off')
    fireEvent.click(pauseButton())
    expect(liveRegion()).toHaveAttribute('aria-live', 'polite')
  })

  it('keeps the carousel semantics, the arrows and the dots', () => {
    setup()

    expect(carousel()).toHaveAttribute('aria-roledescription', 'carousel')
    expect(slideElements()).toHaveLength(3)
    expect(within(carousel()).getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'הקודם' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'באנר 1 מתוך 3' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })
})

describe('HeroCarousel fade', () => {
  it('does not animate the first slide, then fades in each slide that replaces it', () => {
    setup()
    expect(slideElements()[0]).not.toHaveClass('motion-safe:animate-hero-fade')

    advance(DELAY)
    expect(slideElements()[1]).toHaveClass('motion-safe:animate-hero-fade')
    expect(slideElements()[0]).not.toHaveClass('motion-safe:animate-hero-fade')

    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(slideElements()[2]).toHaveClass('motion-safe:animate-hero-fade')
  })

  it('only fades visibility, so hidden slides keep their `hidden` state for assistive technology', () => {
    setup()
    advance(DELAY)

    expect(slideElements().filter((slide) => !slide.hidden)).toHaveLength(1)
  })
})

describe('HeroCarousel with reduced motion', () => {
  it('never advances by itself and has no pause button, but still works by hand', () => {
    stubReducedMotion(true)
    vi.useFakeTimers()
    render(<HeroCarousel slides={slides} />)

    advance(DELAY * 5)
    expect(currentIndex()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.queryByRole('button', { name: /מעבר אוטומטי/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'הבא' }))
    expect(currentIndex()).toBe(1)
  })

  it('stops when the preference is turned on while the page is open', () => {
    const change = stubReducedMotion(false)
    vi.useFakeTimers()
    render(<HeroCarousel slides={slides} />)

    advance(DELAY)
    expect(currentIndex()).toBe(1)

    act(() => change(true))
    advance(DELAY * 3)
    expect(currentIndex()).toBe(1)
    expect(screen.queryByRole('button', { name: /מעבר אוטומטי/ })).not.toBeInTheDocument()
  })
})

describe('HeroCarousel with a single slide', () => {
  it('has no controls and no timer', () => {
    stubReducedMotion(false)
    vi.useFakeTimers()
    render(<HeroCarousel slides={slides.slice(0, 1)} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('HeroCarousel image fit', () => {
  it('fills the frame with an image by default and shows a slide marked "contain" whole', () => {
    stubReducedMotion(true)
    render(
      <HeroCarousel
        slides={[
          { image: 'images/hero/wide.avif', alt: 'רחב', width: 1154, height: 368, fit: 'contain' },
          { image: 'images/hero/normal.avif', alt: 'רגיל', ...SIZE },
        ]}
      />,
    )
    const images = within(carousel()).getAllByRole('img', { hidden: true })

    expect(images[0]).toHaveClass('object-contain')
    expect(images[0]).not.toHaveClass('object-cover')
    expect(images[1]).toHaveClass('object-cover')
    expect(images[1]).not.toHaveClass('object-contain')
  })
})

describe('HeroCarousel image size', () => {
  it('gives every slide, the lazy ones included, the size of its own file', () => {
    stubReducedMotion(true)
    render(
      <HeroCarousel
        slides={[
          { image: 'images/hero/wide.avif', alt: 'רחב', width: 1154, height: 368, fit: 'contain' },
          { image: 'images/hero/normal.avif', alt: 'רגיל', ...SIZE },
        ]}
      />,
    )
    const images = within(carousel()).getAllByRole('img', { hidden: true })

    expect(images[0]).toHaveAttribute('loading', 'eager')
    expect(images[0]).toHaveAttribute('width', '1154')
    expect(images[0]).toHaveAttribute('height', '368')
    expect(images[1]).toHaveAttribute('loading', 'lazy')
    expect(images[1]).toHaveAttribute('width', '1834')
    expect(images[1]).toHaveAttribute('height', '788')
  })
})
