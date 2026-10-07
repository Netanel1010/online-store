import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { isChunkLoadError } from '@/lib/chunkError'

interface CrashProps {
  error: Error
  reset: () => void
  /** Loads the site again. Replaced in tests, where the page cannot be reloaded. */
  reload?: () => void
}

const reloadPage = () => window.location.reload()

/** Why the page cannot be shown, in words that say what to do. */
function explain(error: Error) {
  return isChunkLoadError(error)
    ? {
        stale: true,
        title: 'גרסה חדשה של האתר זמינה',
        text: 'לא הצלחנו לטעון חלק מהאתר, כנראה כי הוא התעדכן בזמן שהיה פתוח. רעננו את העמוד כדי להמשיך.',
      }
    : {
        stale: false,
        title: 'משהו השתבש בעמוד הזה',
        text: 'אירעה שגיאה לא צפויה. אפשר לנסות שוב, או לחזור לדף הבית. העגלה והמועדפים לא נפגעו.',
      }
}

/**
 * Shown in place of one page, inside the layout (the header and the footer stay): the visitor can
 * go somewhere else. A page that could not be loaded needs the site to be loaded again, because a
 * failed import is remembered; any other error can simply be tried again.
 */
export function RouteCrash({ error, reset, reload = reloadPage }: CrashProps) {
  const { stale, title, text } = explain(error)
  return (
    <div
      role="alert"
      className="rounded-xl border border-sale/30 bg-sale-soft px-6 py-12 text-center"
    >
      <h1 className="text-lg font-semibold text-sale">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {stale ? (
          <Button onClick={reload}>רענון העמוד</Button>
        ) : (
          <Button onClick={reset}>נסו שוב</Button>
        )}
        <Link to={paths.home} className={buttonStyles({ variant: 'secondary' })}>
          לדף הבית
        </Link>
      </div>
    </div>
  )
}

/**
 * The last resort: the layout itself failed, so there is no header to keep and no router to link
 * with. It only needs the stylesheet, and loading the site again is the one thing it offers.
 */
export function AppCrash({ error, reload = reloadPage }: Omit<CrashProps, 'reset'>) {
  const { title, text } = explain(error)
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-2xl font-extrabold tracking-wide text-brand">
        <span dir="ltr">N.M.S</span>
      </p>
      <div role="alert">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">{text}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reload}>רענון העמוד</Button>
        {/* A plain link: there is no router here to navigate with. */}
        <a href={import.meta.env.BASE_URL} className={buttonStyles({ variant: 'secondary' })}>
          לדף הבית
        </a>
      </div>
    </main>
  )
}
