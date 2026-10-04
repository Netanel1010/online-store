export interface HeroSlide {
  /** Path relative to `public/`. */
  image: string
  alt: string
}

export const HERO_SLIDES: readonly HeroSlide[] = [
  { image: 'images/hero/slide-1.avif', alt: 'לוחות אם Gigabyte AORUS מסדרת Z890' },
  { image: 'images/hero/slide-2.avif', alt: 'מחשב גיימינג עם מעבדי Intel Core Ultra במארז לבן' },
  { image: 'images/hero/slide-3.avif', alt: 'מחשב גיימינג עם מסך במארז לבן' },
  { image: 'images/hero/slide-4.avif', alt: 'יצירת תוכן עם כרטיסי מסך GeForce RTX' },
  { image: 'images/hero/slide-5.avif', alt: 'מארזי Corsair עם תאורת RGB' },
]
