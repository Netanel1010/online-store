import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import * as placeOrder from '@/features/checkout/placeOrder'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({
  id: 'GPU-1',
  name: 'כרטיס מסך',
  price: { current: 750, original: 1000 },
})
const catalog = [psu, gpu]

const url = () => screen.getByTestId('url').textContent
const summary = () => screen.getByRole('complementary', { name: 'סיכום הזמנה' })
const total = () => within(summary()).getByText('סה"כ').nextElementSibling

const box = (name: string) => screen.getByRole('textbox', { name })
const submitButton = () => screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' })

const signIn = () => useAuthStore.getState().register(GOOD)

async function fillValidForm({ phone = '050-1234567' } = {}) {
  await userEvent.type(box('טלפון'), phone)
  await userEvent.type(box('עיר'), 'תל אביב')
  await userEvent.type(box('רחוב'), 'דיזנגוף')
  await userEvent.type(box('מספר בית'), '12')
  await userEvent.click(screen.getByRole('checkbox', { name: /הזמנת הדגמה/ }))
}

describe('checkout is protected', () => {
  it('sends a signed-out visitor to the login page and returns to checkout after signing in', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
    expect(screen.queryByRole('heading', { name: 'סיום הזמנה' })).not.toBeInTheDocument()

    await userEvent.type(
      await screen.findByRole('textbox', { name: 'אימייל' }),
      'someone@example.com',
    )
    await userEvent.type(screen.getByLabelText(/^סיסמה/), 'whatever1')
    // No such account yet: register one through the link, which keeps the destination.
    await userEvent.click(screen.getByRole('link', { name: 'הרשמה' }))
    await userEvent.type(await screen.findByRole('textbox', { name: 'שם' }), GOOD.name)
    await userEvent.type(screen.getByRole('textbox', { name: 'אימייל' }), GOOD.email)
    await userEvent.type(screen.getByLabelText(/^סיסמה/), GOOD.password)
    await userEvent.type(screen.getByLabelText(/^אימות סיסמה/), GOOD.password)
    await userEvent.click(screen.getByRole('button', { name: 'יצירת חשבון' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('sends a signed-out visitor away from the confirmation page too', async () => {
    renderApp('/checkout/success', catalog)

    await waitFor(() => expect(url()).toBe('/login'))
  })

  it('shows the cart page checkout button to everyone, with a hint when signed out', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    const link = await screen.findByRole('link', { name: 'מעבר לסיום ההזמנה' })
    expect(link).toHaveAttribute('href', '/checkout')
    expect(screen.getByText('כדי להמשיך תתבקשו להתחבר או להירשם.')).toBeInTheDocument()
  })

  it('leads a signed-in visitor from the cart straight to checkout', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    expect(screen.queryByText('כדי להמשיך תתבקשו להתחבר או להירשם.')).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('link', { name: 'מעבר לסיום ההזמנה' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeInTheDocument()
  })

  it('returns a signed-out visitor to the home page, not the login page, when signing out on checkout', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await userEvent.click(screen.getAllByRole('button', { name: 'התנתקות' })[0]!)

    await waitFor(() => expect(url()).toBe('/'))
  })
})

describe('checkout with an empty cart', () => {
  it('shows an empty state instead of the form', async () => {
    await signIn()
    renderApp('/checkout', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('button', { name: 'אישור הזמנה (הדגמה)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'טלפון' })).not.toBeInTheDocument()
  })

  it('treats a cart of products that no longer exist as empty', async () => {
    await signIn()
    useCartStore.getState().addItem('GONE')
    renderApp('/checkout', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
  })

  it('shows an error with retry when the catalog cannot be loaded', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
    expect(useCartStore.getState().items).toHaveLength(1) // nothing was lost
  })
})

describe('checkout order summary', () => {
  it('lists the cart lines and calculates the totals from the cart and the catalog', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    const lines = screen.getByRole('list', { name: 'המוצרים בהזמנה' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(within(lines).getByText('כמות: 2')).toBeInTheDocument()

    // 1 x 1,000 + 2 x 750 = 2,500; before discounts 1 x 1,000 + 2 x 1,000 = 3,000.
    expect(within(summary()).getByText('מספר פריטים').nextElementSibling).toHaveTextContent('3')
    expect(total()).toHaveTextContent(/2,500/)
    expect(within(summary()).getByText('מחיר לפני הנחות').nextElementSibling).toHaveTextContent(
      /3,000/,
    )
    expect(within(summary()).getByText('חיסכון').nextElementSibling).toHaveTextContent(/500/)
  })

  it('does not invent shipping, VAT or payment amounts', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(summary()).toHaveTextContent('לא מחושבים משלוח ומע"מ, ולא מתבצע תשלום')
    expect(within(summary()).queryByText(/משלוח:|מע"מ:/)).not.toBeInTheDocument()
    expect(total()).toHaveTextContent(/1,000/)
  })

  it('shows the same totals as the cart page', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1', 2)
    useCartStore.getState().addItem('GPU-1')
    const cart = renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })
    const cartTotal = total()?.textContent
    cart.unmount()

    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(total()?.textContent).toBe(cartTotal)
    expect(cartTotal).toMatch(/2,750/)
  })

  it('prefills the name and email of the signed-in visitor', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    expect(box('שם מלא')).toHaveValue(GOOD.name)
    expect(box('אימייל')).toHaveValue(GOOD.email)
  })

  it('says that this is a demo and that nothing is charged', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)

    expect(await screen.findByRole('complementary', { name: 'הערה' })).toHaveTextContent(
      'לא מתבצע חיוב',
    )
  })
})

describe('invalid checkout submission', () => {
  beforeEach(async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
  })

  it('reports every missing field, focuses the first and places no order', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await userEvent.click(submitButton())

    expect(await screen.findByText('יש להזין מספר טלפון')).toBeInTheDocument()
    expect(screen.getByText('יש להזין עיר')).toBeInTheDocument()
    expect(screen.getByText('יש להזין רחוב')).toBeInTheDocument()
    expect(screen.getByText('יש להזין מספר בית')).toBeInTheDocument()
    expect(screen.getByText('יש לאשר שזו הזמנת הדגמה')).toBeInTheDocument()
    expect(box('טלפון')).toHaveFocus() // name and email are prefilled, so phone is first
    expect(box('טלפון')).toHaveAttribute('aria-invalid', 'true')
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })

  it('rejects a bad phone number and a bad postal code', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm({ phone: '12345' })
    await userEvent.type(box('מיקוד (לא חובה)'), '123')
    await userEvent.click(submitButton())

    expect(await screen.findByText('מספר הטלפון אינו תקין')).toBeInTheDocument()
    expect(screen.getByText('המיקוד חייב להכיל 7 ספרות')).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('does not submit when the demo acknowledgement is not ticked', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await userEvent.type(box('טלפון'), '0501234567')
    await userEvent.type(box('עיר'), 'חיפה')
    await userEvent.type(box('רחוב'), 'הנמל')
    await userEvent.type(box('מספר בית'), '1')
    await userEvent.click(submitButton())

    expect(await screen.findByText('יש לאשר שזו הזמנת הדגמה')).toBeInTheDocument()
    expect(url()).toBe('/checkout')
  })

  it('shows a form-level error and keeps the cart when the order cannot be placed', async () => {
    vi.spyOn(placeOrder, 'placeDemoOrder').mockImplementation(() => {
      throw new Error('boom')
    })
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו להשלים את ההזמנה')
    expect(url()).toBe('/checkout')
    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })

  it('explains it when the cart turned out to be empty at submit time', async () => {
    vi.spyOn(placeOrder, 'placeDemoOrder').mockImplementation(() => {
      throw new placeOrder.EmptyOrderError()
    })
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'העגלה ריקה או שהמוצרים בה אינם זמינים עוד',
    )
  })
})

describe('valid checkout submission', () => {
  it('places the demo order, shows the confirmation and empties the cart only', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    useFavoritesStore.getState().toggle('GPU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(
      await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' }),
    ).toBeInTheDocument()
    expect(url()).toBe('/checkout/success')
    expect(screen.getByText(/DEMO-\d{6}/)).toBeInTheDocument()
    expect(screen.getByText(GOOD.email)).toBeInTheDocument()

    // What was ordered, and amounts worked out from the catalog: 1,000 + 2 x 750.
    const lines = screen.getByRole('list', { name: 'המוצרים שהוזמנו' })
    expect(within(lines).getAllByRole('listitem')).toHaveLength(2)
    expect(total()).toHaveTextContent(/2,500/)

    // The cart is emptied; the favorites and the session are untouched.
    expect(useCartStore.getState().items).toEqual([])
    expect(useFavoritesStore.getState().ids).toEqual(['GPU-1'])
    expect(useAuthStore.getState().currentUserId).not.toBeNull()
  })

  it('says again that nothing was charged or stored', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('complementary', { name: 'הערה' })).toHaveTextContent(
      'לא בוצע חיוב',
    )
  })

  it('does not store the order or the entered details anywhere', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())
    await screen.findByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })

    const everything = JSON.stringify({ ...localStorage })
    expect(everything).not.toContain('דיזנגוף')
    expect(everything).not.toContain('050-1234567')
    expect(everything).not.toContain('DEMO-')
  })

  it('offers the next steps from the confirmation', async () => {
    await signIn()
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('heading', { level: 1, name: 'סיום הזמנה' })

    await fillValidForm()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('link', { name: 'המשך קנייה' })).toHaveAttribute(
      'href',
      '/products',
    )
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('shows an empty state instead of a confirmation when there was no order', async () => {
    await signIn()
    renderApp('/checkout/success', catalog)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'אין הזמנה להצגה' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toBeInTheDocument()
  })
})
