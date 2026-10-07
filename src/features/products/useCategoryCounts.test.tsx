import { renderHook, waitFor } from '@testing-library/react'
import * as productService from '@/services/productService'
import { useCategoryCounts } from './useCategoryCounts'

const counts = new Map([
  ['cpu', 4],
  ['gpu', 6],
] as const)

describe('useCategoryCounts', () => {
  it('is null until the counts arrive, then the counts', async () => {
    vi.spyOn(productService, 'fetchCategoryCounts').mockResolvedValue(counts)

    const { result } = renderHook(() => useCategoryCounts())

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toEqual(counts))
  })

  it('asks once for the visit: another page shows the links at once, without asking again', async () => {
    const ask = vi.spyOn(productService, 'fetchCategoryCounts').mockResolvedValue(counts)
    const first = renderHook(() => useCategoryCounts())
    await waitFor(() => expect(first.result.current).toEqual(counts))
    first.unmount()

    const second = renderHook(() => useCategoryCounts())

    expect(second.result.current).toEqual(counts)
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('asks once for several pages that want them at the same moment', async () => {
    const ask = vi.spyOn(productService, 'fetchCategoryCounts').mockResolvedValue(counts)

    const a = renderHook(() => useCategoryCounts())
    const b = renderHook(() => useCategoryCounts())

    await waitFor(() => expect(a.result.current).toEqual(counts))
    await waitFor(() => expect(b.result.current).toEqual(counts))
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('stays null when the API fails, and the next page that wants them asks again', async () => {
    const ask = vi
      .spyOn(productService, 'fetchCategoryCounts')
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(counts)
    const failed = renderHook(() => useCategoryCounts())
    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(failed.result.current).toBeNull()
    failed.unmount()

    const later = renderHook(() => useCategoryCounts())

    await waitFor(() => expect(later.result.current).toEqual(counts))
    expect(ask).toHaveBeenCalledTimes(2)
  })
})
