import { act, renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import type { ListingRequest, ProductListing } from '@/services/productService'
import { makeProduct } from '@/test/fixtures'
import { emptyListingState } from './listing/query'
import { useProductListing } from './useProductListing'

const request = (overrides: Partial<ListingRequest> = {}): ListingRequest => ({
  ...emptyListingState,
  ...overrides,
})
const listing = (...ids: string[]): ProductListing => ({
  products: ids.map((id) => makeProduct({ id })),
  total: ids.length,
  facets: { brands: [], specs: [] },
})

describe('useProductListing', () => {
  it('is loading, then ready with the listing', async () => {
    const fetchListing = vi
      .spyOn(productService, 'fetchProductListing')
      .mockResolvedValue(listing('A'))

    const { result } = renderHook(() => useProductListing(request({ category: 'cpu' })))

    expect(result.current.status).toBe('loading')
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        refreshing: false,
        listing: listing('A'),
      }),
    )
    expect(fetchListing).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'cpu' }),
      expect.any(AbortSignal),
    )
  })

  it('does not ask again when it renders again with the same request', async () => {
    const fetchListing = vi
      .spyOn(productService, 'fetchProductListing')
      .mockResolvedValue(listing('A'))

    const { result, rerender } = renderHook(() => useProductListing(request({ q: 'intel' })))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender()
    rerender()

    expect(fetchListing).toHaveBeenCalledTimes(1)
  })

  it('is an error when loading fails, and retry loads again', async () => {
    const fetchListing = vi
      .spyOn(productService, 'fetchProductListing')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(listing('A'))

    const { result } = renderHook(() => useProductListing(request()))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(fetchListing).toHaveBeenCalledTimes(2)
  })

  it('keeps showing the previous listing, marked as refreshing, while a changed request loads', async () => {
    let finish: (value: ProductListing) => void = () => {}
    vi.spyOn(productService, 'fetchProductListing').mockImplementation((given) =>
      given.sort === 'default'
        ? Promise.resolve(listing('A'))
        : new Promise((resolve) => {
            finish = resolve
          }),
    )

    const { result, rerender } = renderHook(({ sort }) => useProductListing(request({ sort })), {
      initialProps: { sort: 'default' as ListingRequest['sort'] },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ sort: 'price-asc' })

    expect(result.current).toMatchObject({
      status: 'ready',
      refreshing: true,
      listing: listing('A'),
    })

    act(() => finish(listing('B')))
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'ready',
        refreshing: false,
        listing: listing('B'),
      }),
    )
  })

  it('shows an error, not the previous listing, when the changed request fails', async () => {
    vi.spyOn(productService, 'fetchProductListing').mockImplementation((given) =>
      given.sort === 'default' ? Promise.resolve(listing('A')) : Promise.reject(new Error('down')),
    )

    const { result, rerender } = renderHook(({ sort }) => useProductListing(request({ sort })), {
      initialProps: { sort: 'default' as ListingRequest['sort'] },
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ sort: 'price-asc' })

    await waitFor(() => expect(result.current.status).toBe('error'))
  })

  it('ignores an answer that arrives after the request changed', async () => {
    const resolvers = new Map<string, (value: ProductListing) => void>()
    vi.spyOn(productService, 'fetchProductListing').mockImplementation(
      (given) =>
        new Promise((resolve) => {
          resolvers.set(given.q, resolve)
        }),
    )

    const { result, rerender } = renderHook(({ q }) => useProductListing(request({ q })), {
      initialProps: { q: 'one' },
    })
    rerender({ q: 'two' })
    act(() => resolvers.get('two')?.(listing('TWO')))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready' }))
    act(() => resolvers.get('one')?.(listing('ONE')))

    expect(result.current).toMatchObject({ status: 'ready', listing: listing('TWO') })
  })

  it('cancels the request that is no longer needed', async () => {
    const signals: AbortSignal[] = []
    vi.spyOn(productService, 'fetchProductListing').mockImplementation((_given, signal) => {
      if (signal) signals.push(signal)
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    const { result, rerender, unmount } = renderHook(({ q }) => useProductListing(request({ q })), {
      initialProps: { q: 'one' },
    })
    rerender({ q: 'two' })

    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    unmount()
    expect(signals[1]?.aborted).toBe(true)
    // The cancelled request must not have turned into an error state.
    expect(result.current.status).toBe('loading')
  })
})
