import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { HeartIcon } from '@/components/icons'
import { useToast } from '@/features/notifications/toastContext'
import type { Product } from '@/features/products/schema'
import { selectIsFavorite, useFavoritesStore } from './favoritesStore'

interface FavoriteButtonProps {
  product: Pick<Product, 'id' | 'name'>
  /** Show the word "מועדפים" next to the heart. */
  showLabel?: boolean
}

/** Toggle button. The label stays constant; `aria-pressed` conveys the state. */
export function FavoriteButton({ product, showLabel = false }: FavoriteButtonProps) {
  const isFavorite = useFavoritesStore(selectIsFavorite(product.id))
  const toggle = useFavoritesStore((state) => state.toggle)
  const toast = useToast()

  return (
    <button
      type="button"
      aria-pressed={isFavorite}
      aria-label={`מועדפים: ${product.name}`}
      onClick={() => {
        toggle(product.id)
        toast.show(
          isFavorite
            ? { message: `${product.name} הוסר מהמועדפים` }
            : {
                message: `${product.name} נוסף למועדפים`,
                action: <Link to={paths.favorites}>למועדפים</Link>,
              },
        )
      }}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors ${
        isFavorite
          ? 'border-sale/40 bg-sale-soft text-sale'
          : 'border-line bg-white text-ink hover:bg-surface'
      }`}
    >
      <HeartIcon filled={isFavorite} />
      {showLabel && <span aria-hidden="true">מועדפים</span>}
    </button>
  )
}
