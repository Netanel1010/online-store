import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '@/features/notifications/ToastProvider'
import { LoginPage } from '@/pages/LoginPage'
import { setUpAuthApi } from '@/test/authApi'
import { RouterProbe } from '@/test/RouterProbe'
import { useAuthStore } from './authStore'
import { RequireAuth } from './RequireAuth'
import { getRedirectTarget, isProtectedPath } from './routing'

// The real authentication API answers these tests (see setUpAuthApi).
const api = setUpAuthApi()
const GOOD = { name: 'נתנאל', email: 'a@b.co', password: 'Passw0rdOK' }

function renderGuarded(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/secret" element={<h1>עמוד מוגן</h1>} />
          </Route>
          <Route path="/" element={<h1>בית</h1>} />
        </Routes>
        <RouterProbe />
      </ToastProvider>
    </MemoryRouter>,
  )
}

const url = () => screen.getByTestId('url').textContent

/** A page load: nothing in memory, the session token (if any) read back from storage. */
async function reload() {
  const persisted = localStorage.getItem('online-store:session')
  useAuthStore.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })
  if (persisted) localStorage.setItem('online-store:session', persisted)
  await useAuthStore.persist.rehydrate()
}

describe('RequireAuth', () => {
  it('sends a signed-out visitor to the login page and does not render the protected page', async () => {
    renderGuarded('/secret?x=1')

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'עמוד מוגן' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'התחברות' })).toBeInTheDocument()
  })

  it('returns the visitor to the protected page, with its query, after signing in', async () => {
    await useAuthStore.getState().register(GOOD)
    useAuthStore.getState().logout()
    renderGuarded('/secret?x=1')

    await userEvent.type(await screen.findByRole('textbox', { name: 'אימייל' }), 'a@b.co')
    await userEvent.type(screen.getByLabelText(/^סיסמה/), 'Passw0rdOK')
    await userEvent.click(screen.getByRole('button', { name: 'התחברות' }))

    expect(await screen.findByRole('heading', { name: 'עמוד מוגן' })).toBeInTheDocument()
    expect(url()).toBe('/secret?x=1')
  })

  it('renders the protected page for a signed-in visitor', async () => {
    await useAuthStore.getState().register(GOOD)
    renderGuarded('/secret')

    expect(await screen.findByRole('heading', { name: 'עמוד מוגן' })).toBeInTheDocument()
    expect(url()).toBe('/secret')
  })

  it('locks the page again after sign-out', async () => {
    await useAuthStore.getState().register(GOOD)
    renderGuarded('/secret')
    await screen.findByRole('heading', { name: 'עמוד מוגן' })

    useAuthStore.getState().logout()

    await waitFor(() => expect(url()).toBe('/login'))
  })

  it('waits for the server to confirm a stored session, then renders the page', async () => {
    await useAuthStore.getState().register(GOOD)
    await reload()
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    )

    renderGuarded('/secret')

    // Neither the page nor the login page while the server has not answered.
    expect(screen.getByText('טוען…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'עמוד מוגן' })).not.toBeInTheDocument()
    expect(url()).toBe('/secret')

    answer(Response.json({ user: { id: 'u1', name: 'נתנאל', email: GOOD.email } }))
    expect(await screen.findByRole('heading', { name: 'עמוד מוגן' })).toBeInTheDocument()
  })

  it('sends the visitor to the login page when the server no longer accepts the stored session', async () => {
    await useAuthStore.getState().register(GOOD)
    api.endAllSessions()
    await reload()

    renderGuarded('/secret')

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'עמוד מוגן' })).not.toBeInTheDocument()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('does not sign the visitor out when the server cannot be reached: it says so, and retries', async () => {
    await useAuthStore.getState().register(GOOD)
    await reload()
    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    renderGuarded('/secret')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('לא הצלחנו לאמת את ההתחברות')
    expect(url()).toBe('/secret')
    expect(useAuthStore.getState().token).not.toBeNull()

    // The server is back: trying again confirms the same session.
    vi.stubGlobal('fetch', realFetch)
    await userEvent.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByRole('heading', { name: 'עמוד מוגן' })).toBeInTheDocument()
  })
})

describe('getRedirectTarget', () => {
  it('accepts an app-internal path and keeps its query', () => {
    expect(getRedirectTarget({ from: '/checkout' })).toBe('/checkout')
    expect(getRedirectTarget({ from: '/search?q=intel' })).toBe('/search?q=intel')
  })

  it.each([
    ['an absolute URL', { from: 'https://evil.example/' }],
    ['a protocol-relative URL', { from: '//evil.example' }],
    ['a backslash trick', { from: '/\\evil.example' }],
    ['a javascript URL', { from: 'javascript:alert(1)' }],
    ['a non-string', { from: 5 }],
    ['the login page itself', { from: '/login' }],
    ['the registration page', { from: '/register?x=1' }],
    ['missing state', undefined],
    ['null state', null],
    ['a string state', 'x'],
  ])('falls back to the home page for %s', (_label, state) => {
    expect(getRedirectTarget(state)).toBe('/')
  })
})

describe('isProtectedPath', () => {
  it('protects checkout and everything under it', () => {
    expect(isProtectedPath('/checkout')).toBe(true)
    expect(isProtectedPath('/checkout/success')).toBe(true)
    expect(isProtectedPath('/checkouts')).toBe(false)
    expect(isProtectedPath('/cart')).toBe(false)
  })
})
