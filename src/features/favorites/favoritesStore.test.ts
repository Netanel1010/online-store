import { selectIsFavorite, useFavoritesStore } from './favoritesStore'

const state = () => useFavoritesStore.getState()
const STORAGE_KEY = 'online-store:favorites'

describe('favorites store', () => {
  it('toggles a product on and off', () => {
    state().toggle('A')
    expect(selectIsFavorite('A')(state())).toBe(true)

    state().toggle('A')
    expect(selectIsFavorite('A')(state())).toBe(false)
  })

  it('keeps the order in which products were added', () => {
    state().toggle('B')
    state().toggle('A')

    expect(state().ids).toEqual(['B', 'A'])
  })

  it('removes a product and ignores unknown ids', () => {
    state().toggle('A')
    state().remove('nope')
    state().remove('A')

    expect(state().ids).toEqual([])
  })

  it('drops products that no longer exist', () => {
    state().toggle('A')
    state().toggle('GONE')
    state().retainOnly(new Set(['A']))

    expect(state().ids).toEqual(['A'])
  })

  it('clears all favorites', () => {
    state().toggle('A')
    state().clear()

    expect(state().ids).toEqual([])
  })
})

describe('favorites persistence', () => {
  it('persists product ids only', () => {
    state().toggle('GP-P650G')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored.state).toEqual({ ids: ['GP-P650G'] })
  })

  it('restores stored favorites and removes duplicates', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { ids: ['A', 'B', 'A'] }, version: 1 }),
    )

    await useFavoritesStore.persist.rehydrate()

    expect(state().ids).toEqual(['A', 'B'])
  })

  it.each([
    ['non-string ids', { ids: [1, 2] }],
    ['empty ids', { ids: [''] }],
    ['ids that are not an array', { ids: 'A' }],
    ['missing ids', {}],
  ])('ignores stored data with %s', async (_label, stored) => {
    useFavoritesStore.setState({ ids: ['KEEP'] })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: stored, version: 1 }))

    await useFavoritesStore.persist.rehydrate()

    expect(state().ids).toEqual(['KEEP'])
  })
})
