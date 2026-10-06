export interface HeroSlide {
  /** Path relative to `public/`. */
  image: string
  alt: string
  /** Size of the file in pixels. It reserves the slide's space before the image arrives. */
  width: number
  height: number
  /**
   * How the image fills the banner. Banners are 1834x788, which is the shape of the frame, so
   * they fill it ("cover"). An image of another shape would be cropped and enlarged to fill the
   * frame, so it is shown whole ("contain") on the banner's black background instead.
   */
  fit?: 'contain'
}

/** How long a banner stays before the carousel moves on by itself. */
export const HERO_AUTOPLAY_DELAY_MS = 4000

export const HERO_SLIDES: readonly HeroSlide[] = [
  {
    // 1154x368, a much wider shape than the other banners: cropped to the frame it loses the
    // AORUS logo and the Intel badges at its edges and is enlarged past its resolution.
    image: 'images/hero/slide-1.avif',
    width: 1154,
    height: 368,
    alt: 'לוחות אם Gigabyte AORUS מסדרת Z890',
    fit: 'contain',
  },
  {
    image: 'images/hero/slide-2.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב גיימינג עם מעבדי Intel Core Ultra במארז לבן',
  },
  {
    image: 'images/hero/slide-3.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב גיימינג עם מסך במארז לבן',
  },
  {
    image: 'images/hero/slide-4.avif',
    width: 1834,
    height: 788,
    alt: 'יצירת תוכן עם כרטיסי מסך GeForce RTX',
  },
  {
    image: 'images/hero/slide-5.avif',
    width: 1834,
    height: 788,
    alt: 'מארזי Corsair עם תאורת RGB',
  },
  {
    image: 'images/hero/slide-6.avif',
    width: 1834,
    height: 788,
    alt: 'כונן SSD מסוג NVMe, WD_BLACK SN8100 של Western Digital',
  },
  {
    image: 'images/hero/slide-7.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב במארז לבן בנוף שלג, עם אריזות מעבדי Intel Core',
  },
  {
    image: 'images/hero/slide-8.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב במארז שקוף עם קירור נוזלי בין עלי סתיו ודלעות',
  },
]
