import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const url = () => screen.getByTestId('url').textContent
const auth = () => useAuthStore.getState()

const emailBox = () => screen.getByRole('textbox', { name: 'אימייל' })
const passwordBox = () => screen.getByLabelText(/^סיסמה/)
const confirmBox = () => screen.getByLabelText(/^אימות סיסמה/)
const nameBox = () => screen.getByRole('textbox', { name: 'שם' })
const submit = (name: string) => userEvent.click(screen.getByRole('button', { name }))

/** An existing account, signed out, as if the visitor registered earlier. */
async function seedAccount() {
  await auth().register(GOOD)
  auth().logout()
}

describe('login form', () => {
  it('explains that this is a demo without real security', () => {
    renderApp('/login')

    expect(screen.getByRole('complementary', { name: 'הערה' })).toHaveTextContent('אתר הדגמה')
    expect(screen.getByRole('complementary', { name: 'הערה' })).toHaveTextContent('אינה מאובטחת')
  })

  it('validates required fields and focuses the first invalid one', async () => {
    renderApp('/login')

    await submit('התחברות')

    expect(await screen.findByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(emailBox()).toHaveFocus()
    expect(emailBox()).toHaveAttribute('aria-invalid', 'true')
    expect(emailBox()).toHaveAccessibleDescription('יש להזין כתובת אימייל')
    expect(auth().currentUserId).toBeNull()
  })

  it('rejects a malformed email', async () => {
    renderApp('/login')

    await userEvent.type(emailBox(), 'not-an-email')
    await userEvent.type(passwordBox(), 'whatever1')
    await submit('התחברות')

    expect(await screen.findByText('כתובת האימייל אינה תקינה')).toBeInTheDocument()
  })

  it('clears an error once the field is fixed', async () => {
    renderApp('/login')
    await submit('התחברות')
    expect(await screen.findByText('יש להזין כתובת אימייל')).toBeInTheDocument()

    await userEvent.type(emailBox(), 'a@b.co')

    await waitFor(() => expect(screen.queryByText('יש להזין כתובת אימייל')).not.toBeInTheDocument())
    expect(emailBox()).not.toHaveAttribute('aria-invalid')
  })

  it('shows one vague error for a wrong password and for an unknown email', async () => {
    await seedAccount()
    renderApp('/login')

    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), 'WrongPass1')
    await submit('התחברות')
    const wrongPassword = (await screen.findByRole('alert')).textContent

    await userEvent.clear(emailBox())
    await userEvent.type(emailBox(), 'nobody@example.com')
    await submit('התחברות')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(wrongPassword!))
    expect(wrongPassword).toBe('כתובת האימייל או הסיסמה שגויים')
    expect(auth().currentUserId).toBeNull()
  })

  it('signs in with the right credentials and goes to the home page', async () => {
    await seedAccount()
    renderApp('/login')

    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await submit('התחברות')

    await waitFor(() => expect(url()).toBe('/'))
    expect(auth().currentUserId).toBe(auth().users[0]?.id)
    expect(screen.getByText('התחברתם בהצלחה', { selector: 'p' })).toBeInTheDocument()
  })

  it('links to registration', () => {
    renderApp('/login')

    expect(screen.getByRole('link', { name: 'הרשמה' })).toHaveAttribute('href', '/register')
  })
})

describe('registration form', () => {
  it('validates every field', async () => {
    renderApp('/register')

    await submit('יצירת חשבון')

    expect(await screen.findByText('יש להזין שם')).toBeInTheDocument()
    expect(screen.getByText('יש להזין כתובת אימייל')).toBeInTheDocument()
    expect(screen.getByText('יש להזין סיסמה')).toBeInTheDocument()
    expect(screen.getByText('יש לאשר את הסיסמה')).toBeInTheDocument()
    expect(nameBox()).toHaveFocus()
    expect(auth().users).toEqual([])
  })

  it('rejects a weak password and a mismatched confirmation', async () => {
    renderApp('/register')

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), 'abcdefgh')
    await userEvent.type(confirmBox(), 'different')
    await submit('יצירת חשבון')

    expect(await screen.findByText('הסיסמה חייבת להכיל לפחות ספרה אחת')).toBeInTheDocument()
    expect(screen.getByText('הסיסמאות אינן תואמות')).toBeInTheDocument()
    expect(auth().users).toEqual([])
  })

  it('tells the visitor about the password rules up front', () => {
    renderApp('/register')

    expect(passwordBox()).toHaveAccessibleDescription('לפחות 8 תווים, כולל אות וספרה.')
  })

  it('creates the account, signs in and goes to the home page', async () => {
    renderApp('/register')

    await userEvent.type(nameBox(), GOOD.name)
    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')

    await waitFor(() => expect(url()).toBe('/'))
    expect(auth().users).toHaveLength(1)
    expect(auth().currentUserId).toBe(auth().users[0]?.id)
    expect(screen.getByText('החשבון נוצר ואתם מחוברים', { selector: 'p' })).toBeInTheDocument()
  })

  it('reports an email that is already registered on the email field', async () => {
    await seedAccount()
    renderApp('/register')

    await userEvent.type(nameBox(), 'מישהו אחר')
    await userEvent.type(emailBox(), GOOD.email.toUpperCase())
    await userEvent.type(passwordBox(), GOOD.password)
    await userEvent.type(confirmBox(), GOOD.password)
    await submit('יצירת חשבון')

    expect(await screen.findByText('כתובת האימייל כבר רשומה')).toBeInTheDocument()
    expect(emailBox()).toHaveFocus()
    expect(auth().users).toHaveLength(1)
    expect(auth().currentUserId).toBeNull()
  })
})

describe('signed-in state and logout', () => {
  it('shows a sign-in link when signed out and the name with a sign-out button when signed in', async () => {
    renderApp('/')
    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'התנתקות' })).not.toBeInTheDocument()
  })

  it('shows the signed-in visitor and signs them out', async () => {
    await auth().register(GOOD)
    renderApp('/')

    expect(screen.getAllByText(GOOD.name)[0]).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'התחברות' })).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'התנתקות' })[0]!)

    expect(auth().currentUserId).toBeNull()
    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toBeInTheDocument()
    expect(screen.getByText('התנתקתם מהחשבון', { selector: 'p' })).toBeInTheDocument()
    expect(auth().users).toHaveLength(1) // the account itself stays
  })

  it('keeps the session after a reload (it is persisted)', async () => {
    await auth().register(GOOD)
    const persisted = localStorage.getItem('online-store:auth')
    expect(JSON.parse(persisted!).state.currentUserId).toBe(auth().currentUserId)

    // A reload: forget memory, then read back what was stored.
    useAuthStore.setState({ users: [], currentUserId: null })
    localStorage.setItem('online-store:auth', persisted!)
    await useAuthStore.persist.rehydrate()
    renderApp('/')

    expect(screen.getAllByText(GOOD.name)[0]).toBeInTheDocument()
  })

  it('redirects a signed-in visitor away from the login and registration pages', async () => {
    await auth().register(GOOD)

    const { unmount } = renderApp('/login')
    await waitFor(() => expect(url()).toBe('/'))
    unmount()

    renderApp('/register')
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

describe('cart and favorites are unaffected by signing in and out', () => {
  const product = makeProduct({ id: 'P-1', name: 'מוצר' })

  it('keeps the cart and favorites across login and logout', async () => {
    useCartStore.getState().addItem('P-1', 2)
    useFavoritesStore.getState().toggle('P-1')
    await seedAccount()
    renderApp('/login', [product])

    await userEvent.type(emailBox(), GOOD.email)
    await userEvent.type(passwordBox(), GOOD.password)
    await submit('התחברות')
    await waitFor(() => expect(url()).toBe('/'))
    expect(useCartStore.getState().items).toEqual([{ productId: 'P-1', quantity: 2 }])

    await userEvent.click(screen.getAllByRole('button', { name: 'התנתקות' })[0]!)

    expect(useCartStore.getState().items).toEqual([{ productId: 'P-1', quantity: 2 }])
    expect(useFavoritesStore.getState().ids).toEqual(['P-1'])
  })
})
