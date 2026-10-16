import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import {
  FAVORITES_KEY_PREFIX,
  ownerOfAccount,
  useFavoritesStore,
} from '@/features/favorites/favoritesStore'
import { signOutFromHeader } from '@/test/accountMenu'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

/**
 * The favorites belong to the person who is using the browser: the guest, or the account that is signed in.
 * A browser can be shared, so nobody is shown the favorites of anybody else through the application, and
 * the favorites of the guest are never put into an account. These go through the real application: the
 * header, the pages, the sign-in and sign-out, and the API that ends a session.
 */
const api = setUpAuthApi()

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח' })
const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך' })
const catalog = [psu, gpu]

const DANA = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }
const NATAN = { name: 'נתן', email: 'natan@example.com', password: 'Passw0rdOK' }

beforeEach(() => api.setCatalog(catalog))

const heart = (name: string) => screen.getByRole('button', { name: `מועדפים: ${name}` })
const favoritesLink = () => screen.getByRole('link', { name: /^מועדפים/ })
const isFavorite = (name: string) => heart(name).getAttribute('aria-pressed') === 'true'

async function openProduct(account?: typeof DANA) {
  if (account) await useAuthStore.getState().register(account)
  renderApp('/products/PSU-1', catalog)
  await screen.findByRole('button', { name: 'מועדפים: ספק כוח' })
}

const logInAs = async ({ email, password }: typeof DANA) => {
  await act(async () => {
    await useAuthStore.getState().login({ email, password })
  })
}
const registerAs = async (account: typeof DANA) => {
  await act(async () => {
    await useAuthStore.getState().register(account)
  })
}

describe('one browser, several people', () => {
  it("does not show an account the favorites of the account that signed out before it, or the guest's, and gives each its own back", async () => {
    await openProduct(DANA)
    await userEvent.click(heart('ספק כוח'))
    expect(isFavorite('ספק כוח')).toBe(true)
    expect(favoritesLink()).toHaveAccessibleName('מועדפים, 1 פריטים')

    // Dana signs out: the guest is here, with a list of their own, which is empty.
    await signOutFromHeader()
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(false))
    expect(favoritesLink()).toHaveAccessibleName('מועדפים')

    // Natan signs in on the same browser: Dana's favorites are not his.
    await registerAs(NATAN)
    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe(NATAN.name))
    expect(isFavorite('ספק כוח')).toBe(false)
    expect(favoritesLink()).toHaveAccessibleName('מועדפים')
    await userEvent.click(heart('ספק כוח'))
    expect(isFavorite('ספק כוח')).toBe(true)

    // And back: each finds their own, and only their own.
    await signOutFromHeader()
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(false))
    await logInAs(DANA)
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(true))
    expect(useFavoritesStore.getState().ids).toEqual(['PSU-1'])
    await signOutFromHeader()
    await logInAs(NATAN)
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(true))
  })

  it('never puts what a visitor favorited before signing in into the account, and shows it again after signing out', async () => {
    renderApp('/products/PSU-1', catalog)
    await screen.findByRole('button', { name: 'מועדפים: ספק כוח' })
    await userEvent.click(heart('ספק כוח'))
    expect(isFavorite('ספק כוח')).toBe(true)

    await registerAs(DANA)
    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe(DANA.name))

    expect(isFavorite('ספק כוח')).toBe(false)
    expect(favoritesLink()).toHaveAccessibleName('מועדפים')
    // Nothing of the guest list was written under the account.
    const account = localStorage.getItem(
      `${FAVORITES_KEY_PREFIX}${ownerOfAccount(useAuthStore.getState().user!.id)}`,
    )
    expect(account).toBeNull()

    await signOutFromHeader()
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(true))
  })

  it('keeps the favorites of an account whose session ended, for when it signs in again, and shows them to nobody else', async () => {
    await openProduct(DANA)
    await userEvent.click(heart('ספק כוח'))

    // The API no longer knows the session: the page finds out when it asks, and signs the visitor out.
    api.endAllSessions()
    await act(async () => {
      useAuthStore.getState().logout()
    })
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(false))
    expect(favoritesLink()).toHaveAccessibleName('מועדפים')

    await registerAs(NATAN)
    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe(NATAN.name))
    expect(isFavorite('ספק כוח')).toBe(false)

    await signOutFromHeader()
    await logInAs(DANA)
    await waitFor(() => expect(isFavorite('ספק כוח')).toBe(true))
  })

  it('follows another tab that changes the favorites of the person who is here, and not one that changes somebody else', async () => {
    await openProduct(DANA)
    const dana = `${FAVORITES_KEY_PREFIX}${ownerOfAccount(useAuthStore.getState().user!.id)}`
    const other = `${FAVORITES_KEY_PREFIX}${ownerOfAccount('some-other-account-id')}`
    const write = (key: string, ids: string[]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, ids, usedAt: 1 }))
      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
      })
    }

    write(other, ['GPU-1'])
    expect(favoritesLink()).toHaveAccessibleName('מועדפים')

    write(dana, ['PSU-1', 'GPU-1'])
    await waitFor(() => expect(favoritesLink()).toHaveAccessibleName('מועדפים, 2 פריטים'))
    expect(isFavorite('ספק כוח')).toBe(true)
  })

  it('treats a list that was spoilt in storage as empty, for the account it belongs to and nobody else', async () => {
    await useAuthStore.getState().register(DANA)
    const key = `${FAVORITES_KEY_PREFIX}${ownerOfAccount(useAuthStore.getState().user!.id)}`
    localStorage.setItem(key, '{not json')
    useAuthStore.getState().logout()

    await openProduct()
    expect(isFavorite('ספק כוח')).toBe(false)
    await logInAs(DANA)

    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe(DANA.name))
    expect(isFavorite('ספק כוח')).toBe(false)
    await userEvent.click(heart('ספק כוח'))
    expect(isFavorite('ספק כוח')).toBe(true)
    expect(JSON.parse(localStorage.getItem(key)!).ids).toEqual(['PSU-1'])
  })
})
