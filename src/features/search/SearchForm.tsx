import { useId, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { paths } from '@/app/paths'
import { CloseIcon, SearchIcon } from '@/components/icons'

/**
 * Product search box. It submits to the search results page, and while that page is open the box
 * mirrors the text from the URL, so it always matches what the results are for (also after the
 * browser's back and forward buttons).
 */
export function SearchForm({ className = 'flex' }: { className?: string }) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const urlText = pathname === paths.search ? (params.get('q') ?? '') : ''

  const [draft, setDraft] = useState(urlText)
  const [syncedUrlText, setSyncedUrlText] = useState(urlText)
  const [submittedText, setSubmittedText] = useState<string | null>(null)

  // The URL text changed since the box last looked at it. If it is the search this box just
  // submitted, the URL has only caught up with the box: keep whatever has been typed since (on a
  // slow device the next search may already be half typed). Any other change (back, forward, a
  // search from another box) is shown as it is.
  if (urlText !== syncedUrlText) {
    setSyncedUrlText(urlText)
    if (urlText !== submittedText) setDraft(urlText)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (text === '') return
    setSubmittedText(text)
    navigate(paths.searchFor(text))
  }

  return (
    <form role="search" aria-label="חיפוש מוצרים" onSubmit={submit} className={className}>
      <label htmlFor={inputId} className="sr-only">
        חיפוש מוצרים
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="חיפוש מוצר, מותג או מק״ט"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          className="min-h-11 w-full rounded-s-lg border border-e-0 border-line bg-surface ps-3 pe-10 text-base transition-colors placeholder:text-muted focus:bg-white [&::-webkit-search-cancel-button]:appearance-none"
        />
        {draft !== '' && (
          <button
            type="button"
            aria-label="מחיקת הטקסט"
            onClick={() => {
              setDraft('')
              inputRef.current?.focus()
            }}
            className="absolute inset-y-0 end-0 inline-flex w-10 items-center justify-center rounded-md text-muted hover:text-ink"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </div>
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
