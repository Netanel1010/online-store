import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CATEGORIES } from '@/features/products/categories'
import { mainLinks } from './navigation'

export function Footer() {
  return (
    <footer className="mt-16 bg-ink text-slate-300">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-2xl font-extrabold tracking-wide text-white">
            <span dir="ltr">N.M.S</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">
            חנות רכיבי מחשב: מעבדים, כרטיסי מסך, לוחות אם, מסכים ועוד.
          </p>
        </div>

        <nav aria-labelledby="footer-links-heading">
          <h2 id="footer-links-heading" className="font-semibold text-white">
            קישורים
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mainLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="rounded transition-colors hover:text-white hover:underline focus-visible:outline-white"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="קטגוריות בתחתית העמוד">
          <h2 className="font-semibold text-white">קטגוריות</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {CATEGORIES.map((category) => (
              <li key={category.id}>
                <Link
                  to={paths.category(category.id)}
                  className="rounded transition-colors hover:text-white hover:underline focus-visible:outline-white"
                >
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-sm">
        <p>
          &copy; {new Date().getFullYear()} <span dir="ltr">N.M.S</span>. כל הזכויות שמורות.
        </p>
      </div>
    </footer>
  )
}
