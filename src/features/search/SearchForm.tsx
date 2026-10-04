import { useId, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { paths } from '@/app/paths'
import { SearchIcon } from '@/components/icons'

interface SearchFormInnerProps {
  initialValue: string
  className: string
}

function SearchFormInner({ initialValue, className }: SearchFormInnerProps) {
  const inputId = useId()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initialValue)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text !== '') navigate(paths.searchFor(text))
  }

  return (
    <form role="search" aria-label="חיפוש מוצרים" onSubmit={submit} className={className}>
      <label htmlFor={inputId} className="sr-only">
        חיפוש מוצרים
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="חיפוש מוצר, מותג או מק״ט"
        autoComplete="off"
        maxLength={100}
        className="min-h-11 min-w-0 flex-1 rounded-s-lg border border-e-0 border-line bg-white px-3 text-base placeholder:text-muted/70"
      />
      <button
        type="submit"
        aria-label="חיפוש"
        className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-e-lg bg-brand text-white hover:bg-brand-strong"
      >
        <SearchIcon />
      </button>
    </form>
  )
}

/**
 * Product search box. It submits to the search results page, and while that page is open it
 * shows the text from the URL, so the box always matches what the results are for.
 */
export function SearchForm({ className = 'flex' }: { className?: string }) {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const urlText = pathname === paths.search ? (params.get('q') ?? '') : ''

  // Keyed by the URL text: when it changes (new search, browser back) the draft resets to it.
  return <SearchFormInner key={urlText} initialValue={urlText} className={className} />
}
