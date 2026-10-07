import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { paths } from '@/app/paths'
import { CloseIcon, SearchIcon } from '@/components/icons'
import { BRANDS } from '@/features/products/brands'
import { findCategory } from '@/features/products/categories'
import { useProductSuggestions } from '@/features/products/useProductSuggestions'
import { assetUrl } from '@/lib/assets'
import { formatPrice } from '@/lib/format'
import { IMAGE_SIZE } from '@/lib/imageSizes'

/**
 * Product search box. It submits to the search results page, and while that page is open the box
 * mirrors the text from the URL, so it always matches what the results are for (also after the
 * browser's back and forward buttons).
 *
 * While typing it also lists up to five matching products, which the API finds with the same
 * search as the results page.
 * The focus never leaves the box: the arrow keys move a highlight through the list
 * (`aria-activedescendant`), Enter opens the highlighted product, or searches when nothing is
 * highlighted, and Escape closes the list. The input stays a `searchbox`, so it keeps its role and
 * name; it only gains `aria-controls`, `aria-autocomplete` and `aria-activedescendant`.
 */
export function SearchForm({ className = 'flex' }: { className?: string }) {
  const inputId = useId()
  const listId = `${inputId}-suggestions`
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const urlText = pathname === paths.search ? (params.get('q') ?? '') : ''

  const [draft, setDraft] = useState(urlText)
  const [syncedUrlText, setSyncedUrlText] = useState(urlText)
  const [submittedText, setSubmittedText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // The URL text changed since the box last looked at it. If it is the search this box just
  // submitted, the URL has only caught up with the box: keep whatever has been typed since (on a
  // slow device the next search may already be half typed). Any other change (back, forward, a
  // search from another box) is shown as it is.
  if (urlText !== syncedUrlText) {
    setSyncedUrlText(urlText)
    if (urlText !== submittedText) setDraft(urlText)
  }

  // Asked of the API (the search of the results page itself), a moment after the typing pauses.
  const suggestions = useProductSuggestions(draft)
  const listOpen = open && suggestions.length > 0
  // The last row of the list leads to the full results.
  const optionCount = suggestions.length + 1
  const activeIndex = listOpen && active < optionCount ? active : -1
  const optionId = (index: number) => `${inputId}-option-${index}`

  const search = () => {
    const text = draft.trim()
    if (text === '') return
    setSubmittedText(text)
    setOpen(false)
    navigate(paths.searchFor(text))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    search()
  }

  const openProduct = (id: string) => {
    setOpen(false)
    setActive(-1)
    setDraft('')
    navigate(paths.product(id))
  }

  const choose = (index: number) => {
    const product = suggestions[index]
    if (product) openProduct(product.id)
    else search()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (suggestions.length === 0) return
      event.preventDefault()
      if (!listOpen) {
        setOpen(true)
        setActive(event.key === 'ArrowDown' ? 0 : optionCount - 1)
        return
      }
      // The rows and one more stop, "nothing highlighted" (the typed text), in a loop.
      const stops = optionCount + 1
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive(((activeIndex + 1 + step + stops) % stops) - 1)
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      choose(activeIndex)
    } else if (event.key === 'Escape' && listOpen) {
      // Closes the list only; a second Escape does what the browser does with a search field.
      event.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <form
      role="search"
      aria-label="חיפוש מוצרים"
      onSubmit={submit}
      // The list stays while the focus moves between the parts of the box and closes when it leaves.
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false)
          setActive(-1)
        }
      }}
      className={className}
    >
      <label htmlFor={inputId} className="sr-only">
        חיפוש מוצרים
      </label>
      <div className="relative min-w-0 flex-1">
        {/* One control: the box, the clear button and the search button share one border, and
            the focus outline is drawn around all of them. */}
        <div className="flex min-h-11 overflow-hidden rounded-lg border border-line bg-surface transition-colors focus-within:border-brand focus-within:bg-white has-[input:focus]:outline-2 has-[input:focus]:outline-offset-2 has-[input:focus]:outline-brand">
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              name="q"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setOpen(true)
                setActive(-1)
              }}
              onFocus={() => setOpen(draft !== '')}
              onKeyDown={onKeyDown}
              placeholder="חיפוש מוצר, מותג או מק״ט"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={100}
              aria-autocomplete="list"
              aria-controls={listOpen ? listId : undefined}
              aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
              className="min-h-11 w-full bg-transparent ps-3 pe-10 text-base placeholder:text-muted focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            {draft !== '' && (
              <button
                type="button"
                aria-label="מחיקת הטקסט"
                onClick={() => {
                  setDraft('')
                  setOpen(false)
                  inputRef.current?.focus()
                }}
                className="absolute inset-y-0 end-0 inline-flex w-10 items-center justify-center text-muted hover:text-ink focus-visible:outline-offset-[-3px]"
              >
                <CloseIcon className="size-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            aria-label="חיפוש"
            className="inline-flex w-11 shrink-0 items-center justify-center bg-brand text-white hover:bg-brand-strong focus-visible:outline-offset-[-3px] focus-visible:outline-white"
          >
            <SearchIcon />
          </button>
        </div>

        {listOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label="הצעות לחיפוש"
            // Keeps the focus in the box when an option is pressed.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lg"
          >
            {suggestions.map((product, index) => (
              <li
                key={product.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseMove={() => setActive(index)}
                onClick={() => openProduct(product.id)}
                className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                  index === activeIndex ? 'bg-brand-soft' : ''
                }`}
              >
                <img
                  src={assetUrl(product.images.card)}
                  alt=""
                  {...IMAGE_SIZE.productPicture}
                  loading="lazy"
                  decoding="async"
                  className="size-10 shrink-0 rounded-md border border-line bg-white object-contain p-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-semibold">{product.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {BRANDS[product.brand].name} · {findCategory(product.category)?.label}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold">
                  {formatPrice(product.price.current)}
                </span>
              </li>
            ))}
            <li
              id={optionId(suggestions.length)}
              role="option"
              aria-selected={suggestions.length === activeIndex}
              onMouseMove={() => setActive(suggestions.length)}
              onClick={search}
              className={`cursor-pointer border-t border-line px-3 py-2.5 text-sm font-semibold text-brand ${
                suggestions.length === activeIndex ? 'bg-brand-soft' : ''
              }`}
            >
              הצגת כל התוצאות עבור “{draft.trim()}”
            </li>
          </ul>
        )}

        {/* Tells screen reader users that suggestions appeared, and how to use them. */}
        <p role="status" className="sr-only">
          {listOpen
            ? `${suggestions.length} הצעות. השתמשו בחצי מעלה ומטה לבחירה ובאנטר לפתיחה.`
            : ''}
        </p>
      </div>
    </form>
  )
}
