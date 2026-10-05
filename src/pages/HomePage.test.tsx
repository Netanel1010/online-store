import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HERO_SLIDES } from '@/features/home/heroSlides'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'
import { stubReducedMotion } from '@/test/reducedMotion'

const onSale = makeProduct({
  id: 'SALE-1',
  name: 'מוצר במבצע',
  price: { current: 750, original: 1000 },
})
const recommended = makeProduct({ id: 'REC-1', name: 'מוצר מומלץ', isRecommended: true })
const regular = makeProduct({ id: 'REG-1', name: 'מוצר רגיל' })

describe('HomePage', () => {
  it('shows the sale and recommended sections with only their own products', async () => {
    renderApp('/', [onSale, recommended, regular])

    const sale = await screen.findByRole('region', { name: 'מבצעים' })
    expect(within(sale).getAllByRole('article')).toHaveLength(1)
    expect(within(sale).getByRole('heading', { level: 3, name: 'מוצר במבצע' })).toBeInTheDocument()

    const picks = screen.getByRole('region', { name: 'מומלצים' })
    expect(within(picks).getAllByRole('article')).toHaveLength(1)
    expect(within(picks).getByRole('link', { name: 'מוצר מומלץ' })).toBeInTheDocument()
    expect(screen.queryByText('מוצר רגיל')).not.toBeInTheDocument()
  })

  it('hides a product section that has no products', async () => {
    renderApp('/', [regular])

    expect(await screen.findByRole('region', { name: 'מותגים' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'מבצעים' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'מומלצים' })).not.toBeInTheDocument()
  })

  it('links the category tiles to their category pages', async () => {
    renderApp('/', [])
    const tiles = await screen.findByRole('region', { name: 'קטגוריות' })

    expect(within(tiles).getByRole('link', { name: 'מעבדים' })).toHaveAttribute(
      'href',
      '/category/cpu',
    )
    expect(within(tiles).getAllByRole('link')).toHaveLength(6)
  })

  it('keeps the hero, categories and brands visible when the catalog fails', async () => {
    renderApp('/', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
    expect(screen.getByRole('region', { name: 'באנרים' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'קטגוריות' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'מותגים' })).toBeInTheDocument()
  })

  it('shows a loading status for the product sections first', async () => {
    renderApp('/', [recommended])

    expect(screen.getByText('טוען מוצרים…')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'מומלצים' })).toBeInTheDocument()
  })
})

describe('HeroCarousel', () => {
  const total = HERO_SLIDES.length

  // Rotation has its own tests (HeroCarousel.test.tsx). Here the slides must stay where the
  // test left them, however slowly the test runs.
  beforeEach(() => {
    stubReducedMotion(true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function renderCarousel() {
    renderApp('/', [])
    const carousel = await screen.findByRole('region', { name: 'באנרים' })
    // Hidden slides are not matched by an accessible-name filter, so select them by role
    // description and check the `hidden` attribute directly.
    const currentSlide = () =>
      within(carousel)
        .getAllByRole('group', { hidden: true })
        .filter((group) => group.getAttribute('aria-roledescription') === 'slide')
        .findIndex((slide) => !slide.hidden)
    return { carousel, currentSlide }
  }

  it('starts on the first slide and exposes only that slide', async () => {
    const { carousel, currentSlide } = await renderCarousel()

    expect(currentSlide()).toBe(0)
    expect(within(carousel).getAllByRole('img')).toHaveLength(1)
    expect(within(carousel).getByRole('img', { name: HERO_SLIDES[0]!.alt })).toBeInTheDocument()
  })

  it('moves with the next and previous buttons and wraps around', async () => {
    const { carousel, currentSlide } = await renderCarousel()

    await userEvent.click(within(carousel).getByRole('button', { name: 'הבא' }))
    expect(currentSlide()).toBe(1)

    await userEvent.click(within(carousel).getByRole('button', { name: 'הקודם' }))
    await userEvent.click(within(carousel).getByRole('button', { name: 'הקודם' }))
    expect(currentSlide()).toBe(total - 1)

    await userEvent.click(within(carousel).getByRole('button', { name: 'הבא' }))
    expect(currentSlide()).toBe(0)
  })

  it('jumps to a slide from the dots and marks the current one', async () => {
    const { carousel, currentSlide } = await renderCarousel()

    const dot = within(carousel).getByRole('button', { name: `באנר 3 מתוך ${total}` })
    await userEvent.click(dot)

    expect(currentSlide()).toBe(2)
    expect(dot).toHaveAttribute('aria-current', 'true')
  })

  it('has a dot for each of the eight slides', async () => {
    const { carousel } = await renderCarousel()

    expect(total).toBe(8)
    expect(within(carousel).getAllByRole('button', { name: /^באנר \d+ מתוך 8$/ })).toHaveLength(8)
  })
})
