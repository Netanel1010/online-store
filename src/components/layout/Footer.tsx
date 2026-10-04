import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CATEGORIES } from '@/features/products/categories'
import { mainLinks } from './navigation'

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-xl font-extrabold text-brand">
            <span dir="ltr">N.M.S</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted">
            חנות רכיבי מחשב: מעבדים, כרטיסי מסך, לוחות אם, מסכים ועוד.
          </p>
        </div>

        <nav aria-labelledby="footer-links-heading">
          <h2 id="footer-links-heading" className="font-semibold">
            קישורים
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mainLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-muted hover:text-brand hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-categories-heading">
          <h2 id="footer-categories-heading" className="font-semibold">
            קטגוריות
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {CATEGORIES.map((category) => (
              <li key={category.id}>
                <Link
                  to={paths.category(category.id)}
                  className="text-muted hover:text-brand hover:underline"
                >
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line py-4 text-center text-sm text-muted">
        <p>
          &copy; {new Date().getFullYear()} <span dir="ltr">N.M.S</span>. כל הזכויות שמורות.
        </p>
      </div>
    </footer>
  )
}
