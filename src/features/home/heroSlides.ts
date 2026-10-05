export interface HeroSlide {
  /** Path relative to `public/`. */
  image: string
  alt: string
}

/** How long a banner stays before the carousel moves on by itself. */
export const HERO_AUTOPLAY_DELAY_MS = 4000

export const HERO_SLIDES: readonly HeroSlide[] = [
  { image: 'images/hero/slide-1.avif', alt: 'לוחות אם Gigabyte AORUS מסדרת Z890' },
  { image: 'images/hero/slide-2.avif', alt: 'מחשב גיימינג עם מעבדי Intel Core Ultra במארז לבן' },
  { image: 'images/hero/slide-3.avif', alt: 'מחשב גיימינג עם מסך במארז לבן' },
  { image: 'images/hero/slide-4.avif', alt: 'יצירת תוכן עם כרטיסי מסך GeForce RTX' },
  { image: 'images/hero/slide-5.avif', alt: 'מארזי Corsair עם תאורת RGB' },
  {
    image: 'images/hero/slide-6.avif',
    alt: 'כונן SSD מסוג NVMe, WD_BLACK SN8100 של Western Digital',
  },
  { image: 'images/hero/slide-7.avif', alt: 'מחשב במארז לבן בנוף שלג, עם אריזות מעבדי Intel Core' },
  { image: 'images/hero/slide-8.avif', alt: 'מחשב במארז שקוף עם קירור נוזלי בין עלי סתיו ודלעות' },
]
