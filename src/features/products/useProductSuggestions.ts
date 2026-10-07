import { useEffect, useState } from 'react'
import { fetchSuggestions } from '@/services/productService'
import { MIN_SUGGESTION_LENGTH, searchWords } from './listing/search'
import { rememberProducts } from './productCache'
import type { Product } from './schema'

/** How long the visitor must pause typing before the API is asked, so one request is not sent per key. */
export const suggestionPolicy = { debounceMs: 150 }

/**
 * The products to suggest under the search box: the first ones the API finds for the text, which
 * is the search of the results page itself. The text must have enough letters to be worth asking
 * about, the request waits for a pause in the typing, and the earlier request is cancelled when the
 * text changes. The suggestions are only ever those of the text that is in the box now: while a
 * newer answer is on its way there are none, never the list of an older text. A failure is no
 * suggestions; the box still searches.
 */
export function useProductSuggestions(text: string): readonly Product[] {
  const [answer, setAnswer] = useState<{ text: string; products: readonly Product[] } | null>(null)
  const query = text.trim()
  const worthAsking = searchWords(query).join('').length >= MIN_SUGGESTION_LENGTH

  useEffect(() => {
    if (!worthAsking) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchSuggestions(query, controller.signal).then(
        (products) => {
          rememberProducts(products)
          setAnswer({ text: query, products })
        },
        () => {
          if (!controller.signal.aborted) setAnswer({ text: query, products: [] })
        },
      )
    }, suggestionPolicy.debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, worthAsking])

  return worthAsking && answer?.text === query ? answer.products : NONE
}

const NONE: readonly Product[] = []
