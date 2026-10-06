import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { loginAccount } from '@/features/auth/authService'
import { useAuthStore } from '@/features/auth/authStore'
import { setUpAuthApi } from '@/test/authApi'
import { renderApp } from '@/test/renderApp'

// The real authentication API (routes, hashing, sessions, the cap) answers these tests.
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const auth = () => useAuthStore.getState()
const url = () => screen.getByTestId('url').textContent
const everywhere = () => screen.getAllByRole('button', { name: 'התנתקות מכל המכשירים' })[0]!

/** Another browser of the same account: a second session, as a second sign-in makes. */
async function otherBrowser() {
  const outcome = await loginAccount({ email: GOOD.email, password: GOOD.password })
  if (!outcome.ok) throw new Error('the second sign-in failed')
  return outcome.value.token
}

describe('signing out everywhere', () => {
  it('ends the sessions of every device, signs out here, and says so', async () => {
    await auth().register(GOOD)
    const laptop = await otherBrowser()
    expect(api.sessions().size).toBe(2)
    renderApp('/')

    await userEvent.click(everywhere())

    await waitFor(() => expect(auth().status).toBe('anonymous'))
    expect(auth().token).toBeNull()
    expect(screen.getByText('התנתקתם מכל המכשירים', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('התנתקתם מהחשבון', { selector: 'p' })).not.toBeInTheDocument()
    // On the server nothing is left, and the other browser's token no longer works.
    expect(api.sessions().size).toBe(0)
    const response = await fetch('http://localhost:3001/api/auth/me', {
      headers: { Authorization: `Bearer ${laptop}` },
    })
    expect(response.status).toBe(401)
    expect(api.accounts().size).toBe(1) // the account itself stays
  })

  it('is offered next to the ordinary sign-out, in the header and in the menu', async () => {
    await auth().register(GOOD)
    renderApp('/')

    expect(screen.getAllByRole('button', { name: 'התנתקות' })).not.toHaveLength(0)
    // The menu is a dialog that is closed, which the accessibility tree leaves out: ask for it anyway.
    expect(
      screen.getAllByRole('button', { name: 'התנתקות מכל המכשירים', hidden: true }),
    ).toHaveLength(2)
  })

  it('is not offered to someone who is signed out', () => {
    renderApp('/')

    expect(screen.queryByRole('button', { name: 'התנתקות מכל המכשירים' })).not.toBeInTheDocument()
  })

  it('leaves the visitor signed in, and says so, when the API cannot be asked', async () => {
    await auth().register(GOOD)
    await otherBrowser()
    renderApp('/')
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/logout-all')
        ? Promise.reject(new TypeError('network down'))
        : real(input, init),
    )

    await userEvent.click(everywhere())

    expect(
      await screen.findByText('לא הצלחנו להתנתק מכל המכשירים. בדקו את החיבור ונסו שוב.', {
        selector: 'p',
      }),
    ).toBeInTheDocument()
    expect(auth().status).toBe('authenticated')
    expect(auth().token).not.toBeNull()
    expect(api.sessions().size).toBe(2)
    // The visitor can try again.
    expect(everywhere()).toBeEnabled()
  })

  it('signs out here too when the API says the session was already over', async () => {
    await auth().register(GOOD)
    renderApp('/')
    api.endAllSessions() // ended elsewhere, a moment ago

    await userEvent.click(everywhere())

    await waitFor(() => expect(auth().status).toBe('anonymous'))
    expect(screen.getByText('התנתקתם מכל המכשירים', { selector: 'p' })).toBeInTheDocument()
  })

  it('works from a protected page: it leaves the page first, then signs out, without a login redirect', async () => {
    await auth().register(GOOD)
    renderApp('/checkout')
    await screen.findByRole('heading', { level: 1 })

    await userEvent.click(everywhere())

    await waitFor(() => expect(auth().status).toBe('anonymous'))
    expect(url()).toBe('/')
  })

  it('ignores a second click while it is working', async () => {
    await auth().register(GOOD)
    renderApp('/')
    const real = globalThis.fetch
    let calls = 0
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/logout-all')) calls += 1
      return real(input, init)
    })

    const button = everywhere()
    await userEvent.dblClick(button)

    await waitFor(() => expect(auth().status).toBe('anonymous'))
    expect(calls).toBe(1)
  })
})

describe('the store action', () => {
  it('says true when the sessions were ended, and does not sign out by itself', async () => {
    await auth().register(GOOD)

    expect(await auth().endAllSessions()).toBe(true)

    expect(auth().status).toBe('authenticated') // the caller signs out, once it knows
    expect(api.sessions().size).toBe(0)
  })

  it('says false without a token, and false when the API cannot be reached', async () => {
    expect(await auth().endAllSessions()).toBe(false)

    await auth().register(GOOD)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    expect(await auth().endAllSessions()).toBe(false)
  })
})
