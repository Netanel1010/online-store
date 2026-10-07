import { act, renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import { makeProduct } from '@/test/fixtures'
import type { Product } from './schema'
import { suggestionPolicy, useProductSuggestions } from './useProductSuggestions'

const product = (id: string) => makeProduct({ id })
const ids = (products: readonly Product[]) => products.map((item) => item.id)

afterEach(() => {
  suggestionPolicy.debounceMs = 0
  vi.useRealTimers()
})

describe('useProductSuggestions', () => {
  it('asks the API for the text and returns what it answers', async () => {
    const ask = vi
      .spyOn(productService, 'fetchSuggestions')
      .mockResolvedValue([product('A'), product('B')])

    const { result } = renderHook(() => useProductSuggestions('rtx'))

    await waitFor(() => expect(ids(result.current)).toEqual(['A', 'B']))
    expect(ask.mock.calls[0]?.[0]).toBe('rtx')
  })

  it('asks nothing for a text too short to be worth it, or only punctuation', async () => {
    const ask = vi.spyOn(productService, 'fetchSuggestions').mockResolvedValue([product('A')])

    for (const text of ['', ' ', 'a', ' - ', '4']) {
      const { result } = renderHook(() => useProductSuggestions(text))
      await act(async () => {})
      expect(result.current, text).toEqual([])
    }
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks with the text trimmed', async () => {
    const ask = vi.spyOn(productService, 'fetchSuggestions').mockResolvedValue([])

    renderHook(() => useProductSuggestions('  intel  '))

    await waitFor(() => expect(ask).toHaveBeenCalled())
    expect(ask.mock.calls[0]?.[0]).toBe('intel')
  })

  it('waits for a pause in the typing, and asks once for a burst of keys', async () => {
    vi.useFakeTimers()
    suggestionPolicy.debounceMs = 150
    const ask = vi.spyOn(productService, 'fetchSuggestions').mockResolvedValue([product('A')])
    const { rerender } = renderHook(({ text }) => useProductSuggestions(text), {
      initialProps: { text: 'in' },
    })

    for (const text of ['int', 'inte', 'intel']) {
      act(() => {
        vi.advanceTimersByTime(100)
      })
      rerender({ text })
    }
    expect(ask).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(150)
    })

    expect(ask).toHaveBeenCalledTimes(1)
    expect(ask.mock.calls[0]?.[0]).toBe('intel')
  })

  it('never shows the suggestions of an older text: none while the newer answer is on its way', async () => {
    const answers = new Map<string, (products: Product[]) => void>()
    vi.spyOn(productService, 'fetchSuggestions').mockImplementation(
      (text) =>
        new Promise((resolve) => {
          answers.set(text, resolve)
        }),
    )
    const { result, rerender } = renderHook(({ text }) => useProductSuggestions(text), {
      initialProps: { text: 'cor' },
    })
    await waitFor(() => expect(answers.has('cor')).toBe(true))
    await act(async () => answers.get('cor')!([product('COR-1')]))
    expect(ids(result.current)).toEqual(['COR-1'])

    rerender({ text: 'cors' })

    expect(result.current).toEqual([])
    await waitFor(() => expect(answers.has('cors')).toBe(true))
    await act(async () => answers.get('cors')!([product('COR-2')]))
    expect(ids(result.current)).toEqual(['COR-2'])
  })

  it('cancels the request of the text that was replaced, and ignores its late answer', async () => {
    const signals: AbortSignal[] = []
    const answers = new Map<string, (products: Product[]) => void>()
    vi.spyOn(productService, 'fetchSuggestions').mockImplementation(
      (text, signal) =>
        new Promise((resolve) => {
          signals.push(signal!)
          answers.set(text, resolve)
        }),
    )
    const { result, rerender } = renderHook(({ text }) => useProductSuggestions(text), {
      initialProps: { text: 'cor' },
    })
    await waitFor(() => expect(answers.has('cor')).toBe(true))

    rerender({ text: 'cors' })
    await waitFor(() => expect(answers.has('cors')).toBe(true))
    expect(signals[0]?.aborted).toBe(true)
    await act(async () => answers.get('cor')!([product('OLD')])) // arrives late
    await act(async () => answers.get('cors')!([product('NEW')]))

    expect(ids(result.current)).toEqual(['NEW'])
  })

  it('gives no suggestions, and no error, when the API fails', async () => {
    vi.spyOn(productService, 'fetchSuggestions').mockRejectedValue(new Error('down'))

    const { result } = renderHook(() => useProductSuggestions('intel'))
    await act(async () => {})

    expect(result.current).toEqual([])
  })

  it('stops asking when the box goes away', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(productService, 'fetchSuggestions').mockImplementation((_text, signal) => {
      signals.push(signal!)
      return new Promise(() => undefined)
    })

    const { unmount } = renderHook(() => useProductSuggestions('intel'))
    await waitFor(() => expect(signals).toHaveLength(1))
    unmount()

    expect(signals[0]?.aborted).toBe(true)
  })
})
