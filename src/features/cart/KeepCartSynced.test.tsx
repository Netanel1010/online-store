import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'
import { CART_STORAGE_KEY, useCartStore } from './cartStore'
import { CART_TAB_NOTICE } from './cartTabSync'

/**
 * What the visitor is told when the cart of this tab was changed by another tab. The words are fixed
 * (CART_TAB_NOTICE) and shown only on the cart and the checkout, and only for a change that was
 * actually taken from another tab.
 */
const api = setUpAuthApi()

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך', price: { current: 750 } })
const catalog = [psu, gpu]

const line = (productId: string, quantity = 1) => ({ productId, quantity })
const notices = () => screen.getByRole('region', { name: 'התראות' })

/** What another tab does: writes the cart to storage, and the browser tells this tab. */
function anotherTabSaves(
  items: { productId: string; quantity: number }[],
  { announce = true } = {},
) {
  const value = JSON.stringify({ state: { items }, version: 1 })
  localStorage.setItem(CART_STORAGE_KEY, value)
  if (announce) {
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: CART_STORAGE_KEY,
          newValue: value,
          storageArea: localStorage,
        }),
      )
    })
  }
}

beforeEach(() => api.setCatalog(catalog))

describe('on the cart page', () => {
  beforeEach(() => useCartStore.getState().addItem('PSU-1'))

  it('says, in so many words, that the cart was updated from another tab, and shows the new cart', async () => {
    renderApp('/cart', catalog)
    await screen.findByRole('heading', { level: 1, name: 'עגלת קניות' })

    anotherTabSaves([line('PSU-1'), line('GPU-1', 2)])

    expect(await within(notices()).findByText('העגלה עודכנה מלשונית אחרת.')).toBeInTheDocument()
    expect(CART_TAB_NOTICE).toBe('העגלה עודכנה מלשונית אחרת.')
    expect(await screen.findByText('כרטיס מסך')).toBeInTheDocument()
  })

  it('says nothing about a change that this tab made itself', async () => {
    renderApp('/cart', catalog)
    await screen.findByText('ספק כוח')

    await userEvent.click(screen.getByRole('button', { name: 'הסרת ספק כוח מהעגלה' }))
    act(() => useCartStore.getState().addItem('GPU-1'))
    act(() => useCartStore.getState().setQuantity('GPU-1', 3))

    expect(await screen.findByText('כרטיס מסך')).toBeInTheDocument()
    expect(within(notices()).queryByText(CART_TAB_NOTICE)).not.toBeInTheDocument()
  })

  it('says nothing when the other tab saved the cart this tab already has', async () => {
    renderApp('/cart', catalog)
    await screen.findByText('ספק כוח')

    anotherTabSaves([line('PSU-1')])

    expect(within(notices()).queryByText(CART_TAB_NOTICE)).not.toBeInTheDocument()
  })

  it('says nothing about stored data that is not a cart, and does not change the cart', async () => {
    renderApp('/cart', catalog)
    await screen.findByText('ספק כוח')

    localStorage.setItem(CART_STORAGE_KEY, '{not json')
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: CART_STORAGE_KEY, storageArea: localStorage }),
      )
    })

    expect(within(notices()).queryByText(CART_TAB_NOTICE)).not.toBeInTheDocument()
    expect(useCartStore.getState().items).toEqual([line('PSU-1')])
  })

  it('tells a run of changes once, and tells again after a while', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    renderApp('/cart', catalog)
    await screen.findByText('ספק כוח')

    anotherTabSaves([line('PSU-1', 2)])
    anotherTabSaves([line('PSU-1', 3)])
    anotherTabSaves([line('PSU-1', 4)])

    expect(await within(notices()).findAllByText(CART_TAB_NOTICE)).toHaveLength(1)

    now.mockReturnValue(1_000_000 + 4_000)
    anotherTabSaves([line('PSU-1', 5)])

    await waitFor(() => expect(within(notices()).getAllByText(CART_TAB_NOTICE)).toHaveLength(2))
  })

  it('says it also when the cart is read again because the tab was shown', async () => {
    renderApp('/cart', catalog)
    await screen.findByText('ספק כוח')
    anotherTabSaves([line('PSU-1'), line('GPU-1')], { announce: false }) // the event never arrived

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await within(notices()).findByText(CART_TAB_NOTICE)).toBeInTheDocument()
    expect(await screen.findByText('כרטיס מסך')).toBeInTheDocument()
  })
})

describe('on the checkout page', () => {
  beforeEach(async () => {
    await useAuthStore
      .getState()
      .register({ name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' })
    useCartStore.getState().addItem('PSU-1')
  })

  it('says it too', async () => {
    renderApp('/checkout', catalog)
    await screen.findByRole('textbox', { name: 'טלפון' })

    anotherTabSaves([line('PSU-1'), line('GPU-1')])

    expect(await within(notices()).findByText(CART_TAB_NOTICE)).toBeInTheDocument()
  })

  it('says it when the click on the order button is what shows the cart of the other tab', async () => {
    renderApp('/checkout', catalog)
    await userEvent.type(await screen.findByRole('textbox', { name: 'טלפון' }), '050-1234567')
    await userEvent.type(screen.getByRole('textbox', { name: 'עיר' }), 'תל אביב')
    await userEvent.type(screen.getByRole('textbox', { name: 'רחוב' }), 'דיזנגוף')
    await userEvent.type(screen.getByRole('textbox', { name: 'מספר בית' }), '12')
    await userEvent.click(screen.getByRole('checkbox', { name: /הזמנת הדגמה/ }))
    anotherTabSaves([line('PSU-1'), line('GPU-1')], { announce: false }) // the event never arrived

    await userEvent.click(screen.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }))

    expect(await within(notices()).findByText(CART_TAB_NOTICE)).toBeInTheDocument()
  })
})

describe('on any other page', () => {
  it('shows the new cart in the header and says nothing', async () => {
    renderApp('/products', catalog)
    await screen.findByRole('heading', { level: 1, name: 'כל המוצרים' })

    anotherTabSaves([line('PSU-1', 2), line('GPU-1')])

    expect(await screen.findByRole('link', { name: 'עגלת קניות, 3 פריטים' })).toBeInTheDocument()
    expect(within(notices()).queryByText(CART_TAB_NOTICE)).not.toBeInTheDocument()
  })

  it('says nothing on the page of an order either', async () => {
    renderApp('/orders', catalog)
    await screen.findByRole('heading', { level: 1, name: 'ההזמנות שלי' }).catch(() => undefined)

    anotherTabSaves([line('PSU-1')])

    expect(within(notices()).queryByText(CART_TAB_NOTICE)).not.toBeInTheDocument()
  })
})
