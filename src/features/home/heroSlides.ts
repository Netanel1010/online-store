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
    // The first banner is the first thing a visitor sees, so it is the Corsair pair.
    image: 'images/hero/slide-5.avif',
    width: 1834,
    height: 788,
    alt: 'מארזי Corsair עם תאורת RGB',
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
  {
    image: 'images/hero/slide-9.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב גיימינג במארז לבן עם חזית גיאומטרית בגוון נחושת ותאורה סגולה, מסדרת Kinetic',
  },
  {
    image: 'images/hero/slide-10.avif',
    width: 1834,
    height: 788,
    alt: 'אריזת מעבד AMD Ryzen 9 מסדרת 9000 לצד פרח שקוף וזוהר',
  },
  {
    image: 'images/hero/slide-11.avif',
    width: 1834,
    height: 788,
    alt: 'מחשב במארז לבן בנוף ירוק עם פרחים ופרפר, לצד אריזות מעבדי Intel Core Ultra',
  },
]
