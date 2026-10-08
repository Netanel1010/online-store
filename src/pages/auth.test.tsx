import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import type { Product } from '@/features/products/schema'
import { setUpAuthApi } from '@/test/authApi'
import { signOutFromHeader } from '@/test/accountMenu'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

// The real authentication API (routes, validation, hashing, sessions) answers these tests.
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const url = () => screen.getByTestId('url').textContent
const auth = () => useAuthStore.getState()

const emailBox = () => screen.getByRole('textbox', { name: 'אימייל' })
const passwordBox = () => screen.getByLabelText(/^סיסמה/)
const confirmBox = () => screen.getByLabelText(/^אימות סיסמה/)
const nameBox = () => screen.getByRole('textbox', { name: 'שם' })
const submit = (name: string) => userEvent.click(screen.getByRole('button', { name }))

/** The sign-in and registration pages load on demand, so wait until the page has appeared. */
async function openPage(path: '/login' | '/register', catalog?: Product[]) {
  const view = renderApp(path, catalog)
  await screen.findByRole('heading', { level: 1 })
  return view
}

/** An existing account, signed out, as if the visitor registered earlier. */
async function seedAccount() {
  await auth().register(GOOD)
  auth().logout()
}

/** A page load: nothing in memory, the session token (if any) read back from storage. */
async function reload() {
  const persisted = localStorage.getItem('online-store:session')
  useAuthStore.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })
  if (persisted) localStorage.setItem('online-store:session', persisted)
  await useAuthStore.persist.rehydrate()
}

async function fillLogin(email: string, password: string) {
  await userEvent.clear(emailBox())
  await userEvent.type(emailBox(), email)
  await userEvent.clear(passwordBox())
  await userEvent.type(passwordBox(), password)
  await submit('התחברות')
}

describe('login form', () => {
  it('explains that this is a demo store, but that the account is real', async () => {
    await openPage('/login')

    const note = screen.getByRole('complementary', { name: 'הערה' })
    expect(note).toHaveTextContent('אתר הדגמה')
    expect(note).toHaveTextContent('נשמר בשרת האתר')
    expect(note).not.toHaveTextContent('אינה מאובטחת')
  })

  it('validates required fields and focuses the first invalid one', async () => {
    await openPage('/login')

    await submit('התחברות')

    expect(await screen.findByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(emailBox()).toHaveFocus()
    expect(emailBox()).toHaveAttribute('aria-invalid', 'true')
    expect(emailBox()).toHaveAccessibleDescription('יש להזין כתובת אימייל')
    expect(auth().status).toBe('anonymous')
  })

  it('rejects a malformed email', async () => {
    await openPage('/login')

    await userEvent.type(emailBox(), 'not-an-email')
    await userEvent.type(passwordBox(), 'whatever1')
    await submit('התחברות')

    expect(await screen.findByText('כתובת האימייל אינה תקינה')).toBeInTheDocument()
  })

  it('clears an error once the field is fixed', async () => {
    await openPage('/login')
    await submit('התחברות')
    expect(await screen.findByText('יש להזין כתובת אימייל')).toBeInTheDocument()

    await userEvent.type(emailBox(), 'a@b.co')

    await waitFor(() => expect(screen.queryByText('יש להזין כתובת אימייל')).not.toBeInTheDocument())
    expect(emailBox()).not.toHaveAttribute('aria-invalid')
  })

  it('shows one vague error for a wrong password and for an unknown email', async () => {
    await seedAccount()
    await openPage('/login')

    await fillLogin(GOOD.email, 'WrongPass1')
    const wrongPassword = (await screen.findByRole('alert')).textContent

    await fillLogin('nobody@example.com', 'WrongPass1')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(wrongPassword!))
    expect(wrongPassword).toBe('כתובת האימייל או הסיסמה שגויים')
    expect(auth().status).toBe('anonymous')
    expect(auth().token).toBeNull()
  })

  it('signs in with the right credentials and goes to the home page', async () => {
    await seedAccount()
    await openPage('/login')

    await fillLogin(GOOD.email, GOOD.password)

    await waitFor(() => expect(url()).toBe('/'))
    expect(auth().status).toBe('authenticated')
    expect(auth().user).toMatchObject({ name: GOOD.name, email: GOOD.email })
    expect(screen.getByText('התחברתם בהצלחה', { selector: 'p' })).toBeInTheDocument()
  })

  it('blocks the email after too many wrong passwords, and says to wait', async () => {
    await seedAccount()
    await openPage('/login')

    // Five wrong passwords, asked of the API together (a form is disabled while it sends).
    const wrong = { email: GOOD.email, password: 'WrongPass1' }
    await Promise.all(Array.from({ length: 5 }, () => auth().login(wrong)))
    await fillLogin(GOOD.email, GOOD.password)

    expect(await screen.findByText(/יותר מדי ניסיונות/)).toBeInTheDocument()
    expect(auth().token).toBeNull()
  })

  it('says the server could not be reached, and not that the password is wrong', async () => {
    await openPage('/login')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    await fillLogin(GOOD.email, GOOD.password)

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להתחבר לשרת')
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeEnabled()
  })

  it('links to registration', async () => {
    await openPage('/login')

    expect(screen.getByRole('link', { name: 'הרשמה' })).toHaveAttribute('href', '/register')
  })
})

describe('registration form', () => {
  it('validates every field', async () => {
    await openPage('/register')

    await submit('יצירת חשבון')

    expect(await screen.findByText('יש להזין שם')).toBeInTheDocument()
    expect(screen.getByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(screen.getByText('יש לאשר את הסיסמה')).toBeInTheDocument()
    expect(nameBox()).toHaveFocus()
    expect(api.accounts().size).toBe(0)
  })

  it('rejects a weak password and a mismatched confirmation, without asking the server', async () => {
    await openPage('/register')

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), 'abcdefgh')
    await userEvent.type(confirmBox(), 'different')
    await submit('יצירת חשבון')

    expect(await screen.findByText('הסיסמה חייבת להכיל לפחות ספרה אחת')).toBeInTheDocument()
    expect(screen.getByText('הסיסמאות אינן תואמות')).toBeInTheDocument()
    expect(api.accounts().size).toBe(0)
  })

  it('tells the visitor about the password rules up front', async () => {
    await openPage('/register')

    expect(passwordBox()).toHaveAccessibleDescription('לפחות 8 תווים, כולל אות וספרה.')
  })

  it('creates the account on the server, signs in and goes to the home page', async () => {
    await openPage('/register')

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')

    await waitFor(() => expect(url()).toBe('/'))
    expect(api.accounts().size).toBe(1)
    expect([...api.accounts().values()][0]).toMatchObject({ name: GOOD.name, email: GOOD.email })
    expect(auth().status).toBe('authenticated')
    expect(auth().user?.email).toBe(GOOD.email)
    expect(screen.getByText('החשבון נוצר ואתם מחוברים', { selector: 'p' })).toBeInTheDocument()
  })

  it('keeps the password only on the server, as a hash, and never in the browser', async () => {
    await openPage('/register')

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')
    await waitFor(() => expect(url()).toBe('/'))

    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(GOOD.password)
    expect([...api.accounts().values()][0]?.passwordHash).toMatch(/^scrypt\$/)
  })

  it('reports an email that is already registered on the email field', async () => {
    await seedAccount()
    await openPage('/register')

    await userEvent.type(nameBox(), 'מישהו אחר')
    await userEvent.type(emailBox(), GOOD.email.toUpperCase())
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')

    expect(await screen.findByText('כתובת האימייל כבר רשומה')).toBeInTheDocument()
    expect(emailBox()).toHaveFocus()
    expect(api.accounts().size).toBe(1)
    expect(auth().status).toBe('anonymous')
  })

  it('says the server could not be reached, and keeps what was typed', async () => {
    await openPage('/register')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להתחבר לשרת')
    expect(emailBox()).toHaveValue(GOOD.email)
    expect(auth().status).toBe('anonymous')
  })
})

describe('signed-in state and logout', () => {
  it('shows a sign-in link when signed out and the name with a sign-out button when signed in', async () => {
    renderApp('/')
    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'התנתקות' })).not.toBeInTheDocument()
  })

  it('shows the signed-in visitor and signs them out, ending the session on the server', async () => {
    await auth().register(GOOD)
    expect(api.sessions().size).toBe(1)
    renderApp('/')

    expect(screen.getAllByText(GOOD.name)[0]).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'התחברות' })).not.toBeInTheDocument()

    await signOutFromHeader()

    expect(auth().status).toBe('anonymous')
    expect(auth().token).toBeNull()
    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toBeInTheDocument()
    expect(screen.getByText('התנתקתם מהחשבון', { selector: 'p' })).toBeInTheDocument()
    await waitFor(() => expect(api.sessions().size).toBe(0))
    expect(api.accounts().size).toBe(1) // the account itself stays
    expect(localStorage.getItem('online-store:session')).not.toMatch(/[A-Za-z0-9_-]{43}/)
  })

  it('keeps the session after a reload: the stored token is confirmed by the server', async () => {
    await auth().register(GOOD)
    const stored = JSON.parse(localStorage.getItem('online-store:session')!)
    expect(stored.state.token).toBe(auth().token)

    await reload()
    expect(auth().status).toBe('restoring')
    renderApp('/')

    expect(await screen.findAllByText(GOOD.name)).not.toHaveLength(0)
    expect(auth().status).toBe('authenticated')
    expect(screen.queryByRole('link', { name: 'התחברות' })).not.toBeInTheDocument()
  })

  it('shows neither the sign-in link nor a name while the stored session is being confirmed', async () => {
    await auth().register(GOOD)
    await reload()
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    )

    renderApp('/')

    expect(screen.queryByRole('link', { name: 'התחברות' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'התנתקות' })).not.toBeInTheDocument()

    answer(Response.json({ user: { id: 'u1', name: 'נתנאל', email: GOOD.email } }))
    expect(await screen.findAllByText(GOOD.name)).not.toHaveLength(0)
  })

  it('signs the visitor out when the server no longer accepts the stored session', async () => {
    await auth().register(GOOD)
    api.endAllSessions()
    await reload()
    renderApp('/')

    expect((await screen.findAllByRole('link', { name: 'התחברות' }))[0]).toBeInTheDocument()
    expect(auth().status).toBe('anonymous')
    expect(auth().token).toBeNull()
    expect(localStorage.getItem('online-store:session')).not.toMatch(/[A-Za-z0-9_-]{43}/)
  })

  it('does not sign the visitor out when the server cannot be reached', async () => {
    await auth().register(GOOD)
    const token = auth().token
    await reload()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    renderApp('/')

    await waitFor(() => expect(auth().status).toBe('unavailable'))
    expect(auth().token).toBe(token)
    expect(JSON.parse(localStorage.getItem('online-store:session')!).state.token).toBe(token)
  })

  it('redirects a signed-in visitor away from the login and registration pages', async () => {
    await auth().register(GOOD)

    const { unmount } = await openPage('/login')
    await waitFor(() => expect(url()).toBe('/'))
    unmount()

    await openPage('/register')
    await waitFor(() => expect(url()).toBe('/'))
  })

  it('offers sign-in and registration in the mobile menu, and sign-out once signed in', async () => {
    const { unmount } = renderApp('/')
    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))
    const menu = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(within(menu).getByRole('link', { name: 'הרשמה' })).toHaveAttribute('href', '/register')
    unmount()

    await auth().register(GOOD)
    renderApp('/')
    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))
    const signedInMenu = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(within(signedInMenu).getByRole('button', { name: 'התנתקות' })).toBeInTheDocument()
    expect(within(signedInMenu).getByText(GOOD.name)).toBeInTheDocument()
  })
})

describe('the cart and the favorites when signing in and out', () => {
  const product = makeProduct({ id: 'P-1', name: 'מוצר' })

  it('keeps the cart and favorites across login, and empties only the cart on logout', async () => {
    api.setCatalog([product]) // the API keeps only the products it has
    useCartStore.getState().addItem('P-1', 2)
    useFavoritesStore.getState().toggle('P-1')
    await seedAccount()
    await openPage('/login', [product])

    await fillLogin(GOOD.email, GOOD.password)
    await waitFor(() => expect(url()).toBe('/'))
    expect(useCartStore.getState().items).toEqual([{ productId: 'P-1', quantity: 2 }])

    await signOutFromHeader()

    // The cart is the account's and stays with it; the favorites are this browser's.
    expect(useCartStore.getState().items).toEqual([])
    expect(useFavoritesStore.getState().ids).toEqual(['P-1'])
  })
})
