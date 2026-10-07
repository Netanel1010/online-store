import { act, renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import { makeProduct } from '@/test/fixtures'
import { useCachedProduct } from './productCache'
import type { Product } from './schema'
import { useProductsByIds } from './useProductsByIds'

const product = (id: string) => makeProduct({ id })
const idsOf = (state: object) =>
  (state as { products: readonly Product[] }).products.map((item) => item.id)

/** The API knows exactly these products. */
function apiKnows(...ids: string[]) {
  return vi
    .spyOn(productService, 'fetchProductsByIds')
    .mockImplementation((asked) =>
      Promise.resolve(ids.filter((id) => asked.includes(id)).map(product)),
    )
}

describe('useProductsByIds', () => {
  it('is ready at once, and asks nothing, for no ids', () => {
    const lookup = apiKnows()

    const { result } = renderHook(() => useProductsByIds([]))

    expect(result.current).toMatchObject({ status: 'ready', products: [] })
    expect(lookup).not.toHaveBeenCalled()
  })

  it('loads, then returns the products in the order of the ids, leaving out one with no product', async () => {
    apiKnows('A', 'B')

    const { result } = renderHook(() => useProductsByIds(['B', 'GONE', 'A']))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(idsOf(result.current)).toEqual(['B', 'A'])
  })

  it('asks for an id once, even when it is listed twice or the list is a new array with the same ids', async () => {
    const lookup = apiKnows('A')

    const { result, rerender } = renderHook(({ ids }) => useProductsByIds(ids), {
      initialProps: { ids: ['A', 'A'] },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ ids: ['A'] })
    await act(async () => {})

    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0]?.[0]).toEqual(['A'])
  })

  it('asks for nothing when a line is taken out, and for the new id alone when one is added', async () => {
    const lookup = apiKnows('A', 'B', 'C')
    const { result, rerender } = renderHook(({ ids }) => useProductsByIds(ids), {
      initialProps: { ids: ['A', 'B'] },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ ids: ['A'] })
    await act(async () => {})
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(idsOf(result.current)).toEqual(['A'])

    rerender({ ids: ['A', 'C'] })
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(2))
    expect(lookup.mock.calls[1]?.[0]).toEqual(['C'])
    await waitFor(() => expect(idsOf(result.current)).toEqual(['A', 'C']))
  })

  it('keeps showing the products it has while a new one loads', async () => {
    let answerC: (products: Product[]) => void = () => undefined
    vi.spyOn(productService, 'fetchProductsByIds').mockImplementation((asked) =>
      asked.includes('C')
        ? new Promise((resolve) => {
            answerC = resolve
          })
        : Promise.resolve([product('A')]),
    )
    const { result, rerender } = renderHook(({ ids }) => useProductsByIds(ids), {
      initialProps: { ids: ['A'] },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ ids: ['A', 'C'] })

    expect(result.current.status).toBe('ready')
    expect(idsOf(result.current)).toEqual(['A'])
    await act(async () => answerC([product('C')]))
    expect(idsOf(result.current)).toEqual(['A', 'C'])
  })

  it('says error when the API fails, and asks again on retry', async () => {
    const lookup = vi
      .spyOn(productService, 'fetchProductsByIds')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([product('A')])

    const { result } = renderHook(() => useProductsByIds(['A']))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it('does not report a failure of a request it cancelled', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(productService, 'fetchProductsByIds').mockImplementation(
      (_ids, signal) =>
        new Promise((_resolve, reject) => {
          signals.push(signal!)
          signal!.addEventListener('abort', () => reject(signal!.reason))
        }),
    )

    const { result, unmount } = renderHook(() => useProductsByIds(['A']))
    unmount()
    await act(async () => {})

    expect(signals[0]?.aborted).toBe(true)
    expect(result.current.status).toBe('loading')
  })

  it('remembers the products it loaded, for the parts of the page that never ask', async () => {
    apiKnows('A')
    const loader = renderHook(() => useProductsByIds(['A']))
    const reader = renderHook(() => useCachedProduct('A'))
    expect(reader.result.current).toBeUndefined()

    await waitFor(() => expect(loader.result.current.status).toBe('ready'))

    expect(reader.result.current?.id).toBe('A')
  })
})
