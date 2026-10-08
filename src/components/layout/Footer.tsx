import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CATEGORIES } from '@/features/products/categories'
import { INFO_PAGE_IDS, INFO_PAGES } from '@/lib/infoPages'
import { GITHUB_REPOSITORY_URL } from '@/lib/links'
import { mainLinks } from './navigation'

const linkClass =
  'rounded transition-colors hover:text-white hover:underline focus-visible:outline-white'

export function Footer() {
  return (
    <footer className="mt-16 bg-ink text-slate-300">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-2xl font-extrabold tracking-wide text-white">
            <span dir="ltr">N.M.S</span>
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">
            חנות רכיבי מחשב: מעבדים, כרטיסי מסך, לוחות אם, מסכים ועוד.
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white">
            זהו אתר הדגמה: לא מתבצעת רכישה אמיתית, אין חיוב ואין משלוח.
          </p>
          <p className="mt-3 text-sm">
            <a
              href={GITHUB_REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              קוד האתר ב-<span dir="ltr">GitHub</span>
              <span className="sr-only"> (נפתח בלשונית חדשה)</span>
            </a>
          </p>
        </div>

        <nav aria-labelledby="footer-links-heading">
          <h2 id="footer-links-heading" className="font-semibold text-white">
            קישורים
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {mainLinks.map((link) => (
              <li key={link.to}>
                <Link to={link.to} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="footer-info-heading">
          <h2 id="footer-info-heading" className="font-semibold text-white">
            מידע
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {INFO_PAGE_IDS.map((id) => (
              <li key={id}>
                <Link to={paths.info(id)} className={linkClass}>
                  {INFO_PAGES[id].label}
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
                <Link to={paths.category(category.id)} className={linkClass}>
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/10 py-4 text-center text-sm">
        <p>
          &copy; {new Date().getFullYear()} <span dir="ltr">N.M.S</span>. כל הזכויות שמורות. אתר
          הדגמה, ללא רכישה אמיתית.
        </p>
      </div>
    </footer>
  )
}
