import { HERO_SLIDES } from './heroSlides'

// The files that exist under public/images/hero (only listed, never loaded).
const heroFiles = Object.keys(import.meta.glob('/public/images/hero/*.avif')).map((path) =>
  path.replace('/public/', ''),
)

describe('HERO_SLIDES', () => {
  it('has the ten banners of the carousel', () => {
    expect(HERO_SLIDES).toHaveLength(10)
  })

  it('starts with the Corsair banner, and no longer has the AORUS motherboards banner', () => {
    const images = HERO_SLIDES.map((slide) => slide.image)

    expect(images[0]).toBe('images/hero/slide-5.avif')
    expect(images).not.toContain('images/hero/slide-1.avif')
    expect(heroFiles).not.toContain('images/hero/slide-1.avif')
  })

  it('points every slide at an image that exists in public/', () => {
    for (const slide of HERO_SLIDES) {
      expect(heroFiles, slide.image).toContain(slide.image)
    }
  })

  it('uses a different image for every slide', () => {
    expect(new Set(HERO_SLIDES.map((slide) => slide.image)).size).toBe(HERO_SLIDES.length)
  })

  it('describes every banner in Hebrew with its own text, never the legacy placeholder', () => {
    const alts = HERO_SLIDES.map((slide) => slide.alt)

    expect(new Set(alts).size).toBe(alts.length)
    for (const alt of alts) {
      expect(alt).toMatch(/[֐-׿]/)
      expect(alt.length).toBeGreaterThan(10)
      expect(alt).not.toMatch(/MainImage/i)
    }
  })

  it('includes the three banners restored from the legacy site', () => {
    const images = HERO_SLIDES.map((slide) => slide.image)

    expect(images).toEqual(
      expect.arrayContaining([
        'images/hero/slide-6.avif',
        'images/hero/slide-7.avif',
        'images/hero/slide-8.avif',
      ]),
    )
  })

  it('includes the three banners added after them', () => {
    const images = HERO_SLIDES.map((slide) => slide.image)

    expect(images).toEqual(
      expect.arrayContaining([
        'images/hero/slide-9.avif',
        'images/hero/slide-10.avif',
        'images/hero/slide-11.avif',
      ]),
    )
  })
})

describe('HERO_SLIDES fit', () => {
  it('has only banners of the frame own shape, 1834x788, so every one fills the frame', () => {
    for (const slide of HERO_SLIDES) {
      expect({ width: slide.width, height: slide.height }, slide.image).toEqual({
        width: 1834,
        height: 788,
      })
      expect(slide.fit, slide.image).toBeUndefined()
    }
  })
})
