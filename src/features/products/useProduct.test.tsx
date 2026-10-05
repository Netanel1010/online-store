import { act, renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import { makeProduct } from '@/test/fixtures'
import { useProduct } from './useProduct'

describe('useProduct', () => {
  it('is loading, then ready with the product', async () => {
    const product = makeProduct({ id: 'A' })
    const fetchProduct = vi.spyOn(productService, 'fetchProduct').mockResolvedValue(product)

    const { result } = renderHook(() => useProduct('A'))

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', product }))
    expect(fetchProduct).toHaveBeenCalledWith('A', expect.any(AbortSignal))
  })

  it('is not-found when the API has no such product', async () => {
    vi.spyOn(productService, 'fetchProduct').mockResolvedValue(null)

    const { result } = renderHook(() => useProduct('NOPE'))

    await waitFor(() => expect(result.current.status).toBe('not-found'))
  })

  it('is not-found without asking the API when there is no id', () => {
    const fetchProduct = vi.spyOn(productService, 'fetchProduct')

    const { result } = renderHook(() => useProduct(undefined))

    expect(result.current.status).toBe('not-found')
    expect(fetchProduct).not.toHaveBeenCalled()
  })

  it('is an error when loading fails, and retry loads again', async () => {
    const product = makeProduct({ id: 'A' })
    const fetchProduct = vi
      .spyOn(productService, 'fetchProduct')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(product)

    const { result } = renderHook(() => useProduct('A'))
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', product }))
    expect(fetchProduct).toHaveBeenCalledTimes(2)
  })

  it('shows loading, not the previous product, when the id changes', async () => {
    const a = makeProduct({ id: 'A' })
    const b = makeProduct({ id: 'B' })
    vi.spyOn(productService, 'fetchProduct').mockImplementation((id) =>
      Promise.resolve(id === 'A' ? a : b),
    )

    const { result, rerender } = renderHook(({ id }) => useProduct(id), {
      initialProps: { id: 'A' },
    })
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', product: a }))

    rerender({ id: 'B' })

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', product: b }))
  })

  it('cancels the request when it is no longer needed, and ignores its failure', async () => {
    let signal: AbortSignal | undefined
    vi.spyOn(productService, 'fetchProduct').mockImplementation((_id, given) => {
      signal = given
      return new Promise((_resolve, reject) => {
        given?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    const { result, unmount } = renderHook(() => useProduct('A'))
    unmount()

    expect(signal?.aborted).toBe(true)
    // The rejected request must not have turned into an error state (there is nothing to render).
    expect(result.current.status).toBe('loading')
  })
})
