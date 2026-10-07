import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { BrandStrip } from '@/features/home/components/BrandStrip'
import { CategoryTiles } from '@/features/home/components/CategoryTiles'
import { HeroCarousel } from '@/features/home/components/HeroCarousel'
import { ProductSection } from '@/features/home/components/ProductSection'
import { HERO_SLIDES } from '@/features/home/heroSlides'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { ErrorState } from '@/components/shared/StateMessages'
import { ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { useHomeProducts } from '@/features/products/useHomeProducts'
import { PageMeta } from '@/components/shared/PageMeta'
import { homeMeta } from '@/lib/seo'

/** The sale and recommended sections: asked of the API, with the usual loading and error states. */
function HomeProductSections() {
  const home = useHomeProducts()

  if (home.status === 'loading') {
    return (
      <>
        <ProductGridSkeleton count={4} />
        <SlowLoadNotice />
      </>
    )
  }
  if (home.status === 'error') return <ErrorState onRetry={home.retry} />
  return (
    <>
      <ProductSection title="מבצעים" products={home.sale} />
      <ProductSection title="מומלצים" products={home.recommended} />
    </>
  )
}

export function HomePage() {
  return (
    <>
      <PageMeta meta={homeMeta()} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">חנות רכיבי מחשב</h1>
          <p className="mt-1 text-base text-muted md:text-lg">
            מעבדים, כרטיסי מסך, לוחות אם, מסכים ועוד.
          </p>
        </div>
        <Link to={paths.products} className={buttonStyles()}>
          לכל המוצרים
        </Link>
      </div>

      <HeroCarousel slides={HERO_SLIDES} />
      <CategoryTiles />

      <HomeProductSections />

      <BrandStrip />
    </>
  )
}
