import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { BrandStrip } from '@/features/home/components/BrandStrip'
import { CategoryTiles } from '@/features/home/components/CategoryTiles'
import { HeroCarousel } from '@/features/home/components/HeroCarousel'
import { ProductSection } from '@/features/home/components/ProductSection'
import { HERO_SLIDES } from '@/features/home/heroSlides'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { recommendedProducts, saleProducts } from '@/features/products/selectors'

export function HomePage() {
  return (
    <>
      <title>N.M.S | חנות רכיבי מחשב</title>

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

      <CatalogBoundary loading={<ProductGridSkeleton count={4} />}>
        {(products) => (
          <>
            <ProductSection title="מבצעים" products={saleProducts(products)} />
            <ProductSection title="מומלצים" products={recommendedProducts(products)} />
          </>
        )}
      </CatalogBoundary>

      <BrandStrip />
    </>
  )
}
