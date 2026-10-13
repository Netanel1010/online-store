import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { placeOrder } from '@/features/orders/orderService'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

/**
 * The three screens of an order (the checkout, the confirmation, the list of orders) each say, on
 * their own, that the order is a demo and that nothing real happened: no payment, no product, and
 * an address that was only checked for its shape. Each message lives in its own component and reads
 * to its own screen, so this is what keeps them from drifting apart or from promising a real order.
 */

const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const catalog = [psu]

beforeEach(async () => {
  api.setCatalog(catalog)
  await useAuthStore.getState().register(GOOD)
})

/** What every screen of an order has to say, in whatever tense and words it says it. */
const NO_REAL_PAYMENT = /לא (מתבצע|בוצע) תשלום אמיתי/
const NO_PRODUCT = /לא יישלח (שום |אף )?מוצר/
const ADDRESS_ONLY_CHECKED_FOR_ITS_SHAPE = /הכתובת נבדק(ת|ה) רק לפי הפורמט/

/**
 * What a real shop says and a demo must not: that the order was received or approved, that something
 * was paid or charged, that something is on its way, with a courier, a date or a tracking, or that
 * the address was verified. ("ולא נקבע מועד אספקה" is the demo saying that there is no date.)
 */
const PROMISES_OF_A_REAL_ORDER = [
  /התקבלה/,
  /אושרה/,
  /נשלחה/,
  /משלוח אל/,
  /יגיע|יגיעו/,
  /שליח|שליחים/,
  /ימי עסקים/,
  /מעקב/,
  /משלוח חינם/,
  /זמן אספקה/,
  /(?<!נקבע )מועד אספקה/,
  /חויב|נגבה|שולם/,
  /אומתה|אימות כתובת|הכתובת נמצאה|הכתובת תקינה/,
]

function expectNoPromiseOfARealOrder(text: string | null) {
  for (const promise of PROMISES_OF_A_REAL_ORDER) {
    expect(text, String(promise)).not.toMatch(promise)
  }
}

const box = (name: string) => screen.getByRole('textbox', { name })

async function fillAndSubmitTheCheckout() {
  await userEvent.type(box('טלפון'), '050-1234567')
  await userEvent.type(box('עיר'), 'תל אביב')
  await userEvent.type(box('רחוב'), 'דיזנגוף')
  await userEvent.type(box('מספר בית'), '12')
  await userEvent.click(screen.getByRole('checkbox', { name: /הזמנת הדגמה/ }))
  await userEvent.click(screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }))
}

describe('the checkout', () => {
  it('says in its notice, its address line and its checkbox that the order is a demo', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    const notice = screen.getByRole('complementary', { name: 'הערה' })
    expect(notice).toHaveTextContent('זו הזמנת הדגמה בלבד')
    expect(notice).toHaveTextContent(NO_REAL_PAYMENT)
    expect(notice).toHaveTextContent(NO_PRODUCT)
    expect(notice).toHaveTextContent(ADDRESS_ONLY_CHECKED_FOR_ITS_SHAPE)

    const address = screen.getByRole('group', { name: 'כתובת למשלוח' })
    expect(address).toHaveAccessibleDescription(/כתובת הדגמה.*לצורכי הדגמה בלבד\. לא יתבצע משלוח\./)

    const acknowledgment = screen.getByRole('checkbox', { name: /הזמנת הדגמה בלבד/ })
    expect(acknowledgment).toHaveAccessibleName(NO_REAL_PAYMENT)
    expect(acknowledgment).toHaveAccessibleName(NO_PRODUCT)
  })

  it('promises nothing that a real order promises', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expectNoPromiseOfARealOrder(screen.getByRole('main').textContent)
  })
})

describe('the confirmation after ordering', () => {
  it('says that a demo order was saved, with no real payment, no product and an address checked for its shape', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/checkout', catalog)
    await screen.findByRole('textbox', { name: 'טלפון' })

    await fillAndSubmitTheCheckout()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' }),
    ).toBeInTheDocument()
    const notice = screen.getByRole('complementary', { name: 'הערה' })
    expect(notice).toHaveTextContent('זו הייתה הזמנת הדגמה בלבד')
    expect(notice).toHaveTextContent(NO_REAL_PAYMENT)
    expect(notice).toHaveTextContent(NO_PRODUCT)
    expect(notice).toHaveTextContent(ADDRESS_ONLY_CHECKED_FOR_ITS_SHAPE)
    expect(notice).toHaveTextContent('ולא נקבע מועד אספקה')
    expect(screen.getByRole('region', { name: 'פרטי משלוח (הדגמה)' })).toBeInTheDocument()
    expectNoPromiseOfARealOrder(screen.getByRole('main').textContent)
  })
})

describe('the list of orders', () => {
  it('says that they are demo orders, with no real payment and no product', async () => {
    const outcome = await placeOrder({
      token: useAuthStore.getState().token!,
      idempotencyKey: crypto.randomUUID(),
      items: [{ productId: 'PSU-1', quantity: 1 }],
      delivery: {
        fullName: 'נתנאל כהן',
        email: GOOD.email,
        phone: '0501234567',
        city: 'חיפה',
        street: 'הנשיא',
        houseNumber: '12',
        apartment: '',
        postalCode: '',
        notes: '',
      },
      expectedTotal: 1000,
    })
    if (!outcome.ok) throw new Error('the order was not placed')

    renderApp('/orders', catalog)
    const list = await screen.findByRole('list', { name: 'ההזמנות שלי' })

    const notice = screen.getByRole('complementary', { name: 'הערה' })
    expect(notice).toHaveTextContent('אלה הזמנות הדגמה')
    expect(notice).toHaveTextContent(NO_REAL_PAYMENT)
    expect(notice).toHaveTextContent(NO_PRODUCT)
    expect(within(list).getByText('נשמרה')).toBeInTheDocument()
    expect(within(list).getByText('כתובת הדגמה: חיפה')).toBeInTheDocument()
    expectNoPromiseOfARealOrder(screen.getByRole('main').textContent)
  })
})
