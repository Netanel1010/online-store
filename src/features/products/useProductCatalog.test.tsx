import { act, renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import { makeProduct } from '@/test/fixtures'
import { resetProductCatalog, useProductCatalog } from './useProductCatalog'

afterEach(() => {
  vi.restoreAllMocks()
  resetProductCatalog()
})

describe('useProductCatalog', () => {
  it('starts loading and then exposes the products', async () => {
    const product = makeProduct()
    vi.spyOn(productService, 'fetchProducts').mockResolvedValue([product])

    const { result } = renderHook(() => useProductCatalog())
    expect(result.current.status).toBe('loading')

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ status: 'ready', products: [product] })
  })

  it('exposes an error and recovers on retry', async () => {
    const product = makeProduct()
    const spy = vi
      .spyOn(productService, 'fetchProducts')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([product])

    const { result } = renderHook(() => useProductCatalog())
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('shares loaded data between consumers without refetching', async () => {
    const spy = vi.spyOn(productService, 'fetchProducts').mockResolvedValue([makeProduct()])

    const first = renderHook(() => useProductCatalog())
    await waitFor(() => expect(first.result.current.status).toBe('ready'))

    const second = renderHook(() => useProductCatalog())
    expect(second.result.current.status).toBe('ready')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
