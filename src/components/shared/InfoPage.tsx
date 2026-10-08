import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageMeta } from '@/components/shared/PageMeta'
import { INFO_PAGES, type InfoPageId } from '@/lib/infoPages'
import { infoMeta } from '@/lib/seo'

const linkClass =
  'rounded font-medium text-brand underline underline-offset-4 hover:text-brand-strong'

/** A link to another page of the store, inside running text. */
export function InfoLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={linkClass}>
      {children}
    </Link>
  )
}

/** A link to an information page, named as the footer names it. */
export function InfoPageLink({ id }: { id: InfoPageId }) {
  return <InfoLink to={paths.info(id)}>{INFO_PAGES[id].label}</InfoLink>
}

/** A link to another site: it opens in a new tab, and says so to a screen reader. */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
      <span className="sr-only"> (נפתח בלשונית חדשה)</span>
    </a>
  )
}

/** A titled part of an information page. */
export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted">{children}</div>
    </section>
  )
}

/** A bulleted list inside a section. */
export function InfoList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 ps-6 marker:text-brand">{children}</ul>
}

interface InfoPageProps {
  id: InfoPageId
  /** The opening paragraph, under the heading. */
  intro: ReactNode
  children: ReactNode
}

/**
 * The frame of an information page: its metadata, the breadcrumbs, the heading and a column of
 * readable width. The heading is the page's name, as the links to it call it.
 */
export function InfoPage({ id, intro, children }: InfoPageProps) {
  const { label } = INFO_PAGES[id]
  return (
    <>
      <PageMeta meta={infoMeta(id)} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label }]} />
      <article className="max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight">{label}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">{intro}</p>
        {children}
      </article>
    </>
  )
}
