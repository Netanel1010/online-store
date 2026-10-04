import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { setSort, toggleBrand, toggleSpecValue } from './query'
import { useListingState } from './useListingState'

function wrapper(initial: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  }
}

function useListingAndLocation() {
  return { ...useListingState({ search: false }), location: useLocation() }
}

describe('useListingState', () => {
  it('reads the state from the URL', () => {
    const { result } = renderHook(useListingAndLocation, {
      wrapper: wrapper('/category/cpu?brand=intel&sort=price-asc'),
    })

    expect(result.current.state.brands).toEqual(['intel'])
    expect(result.current.state.sort).toBe('price-asc')
  })

  it('writes a change to the URL', () => {
    const { result } = renderHook(useListingAndLocation, { wrapper: wrapper('/category/cpu') })

    act(() => result.current.update((state) => toggleBrand(state, 'amd')))

    expect(result.current.location.search).toBe('?brand=amd')
  })

  it('keeps every change when several arrive before the router has rendered the first one', () => {
    const { result } = renderHook(useListingAndLocation, { wrapper: wrapper('/category/cpu') })

    // Three updates in the same tick, as when a slow device is still busy rendering the first.
    act(() => {
      result.current.update((state) => toggleBrand(state, 'intel'))
      result.current.update((state) => toggleSpecValue(state, 'socket', 'LGA 1851'))
      result.current.update((state) => setSort(state, 'price-desc'))
    })

    const params = new URLSearchParams(result.current.location.search)
    expect(params.getAll('brand')).toEqual(['intel'])
    expect(params.getAll('s.socket')).toEqual(['LGA 1851'])
    expect(params.get('sort')).toBe('price-desc')
  })

  it('builds the next change from the rendered URL once the router has caught up', () => {
    const { result } = renderHook(useListingAndLocation, { wrapper: wrapper('/category/cpu') })
    act(() => result.current.update((state) => toggleBrand(state, 'intel')))

    act(() => result.current.update((state) => toggleBrand(state, 'amd')))

    expect(new URLSearchParams(result.current.location.search).getAll('brand')).toEqual([
      'amd',
      'intel',
    ])
  })

  it('toggling the same option twice leaves a clean URL', () => {
    const { result } = renderHook(useListingAndLocation, { wrapper: wrapper('/category/cpu') })

    act(() => result.current.update((state) => toggleBrand(state, 'intel')))
    act(() => result.current.update((state) => toggleBrand(state, 'intel')))

    expect(result.current.location.search).toBe('')
  })
})
