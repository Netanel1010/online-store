import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '@/features/auth/authStore'
import { setServerLine } from '@/features/cart/cartService'
import { CART_SYNC_NOTICES } from '@/features/cart/cartSync'
import { useCartStore } from '@/features/cart/cartStore'
import { setUpAuthApi } from '@/test/authApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

// The real authentication and cart API answers these tests (see setUpAuthApi): the page is the whole
// app, so what is checked is the cart a visitor sees and the one the account keeps.
const api = setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך', price: { current: 750 } })
const catalog = [psu, gpu]

beforeEach(() => api.setCatalog(catalog))

const savedCart = () => [...api.carts().values()][0]?.items ?? []

describe('the cart page of a signed-in visitor', () => {
  it('waits for the cart of the account on a browser that has none, instead of saying it is empty', async () => {
    await useAuthStore.getState().register(GOOD)
    await setServerLine(useAuthStore.getState().token!, 'GPU-1', 2)
    // The API is slow to answer (a host that is waking up): the cart is read when this is called.
    let answer: () => void = () => undefined
    const slow = new Promise<void>((resolve) => {
      answer = resolve
    })
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/api/cart') && init?.method === undefined) await slow
      return inner(input, init)
    })

    renderApp('/cart', catalog)
    // The page is there, the cart is not: this is where an empty cart would be announced.
    await act(async () => {})
    expect(screen.getByText('טוען עגלה…')).toBeInTheDocument()
    expect(screen.queryByText('העגלה ריקה')).not.toBeInTheDocument()

    answer()

    expect(await screen.findByRole('link', { name: 'כרטיס מסך' })).toBeInTheDocument()
    expect(screen.queryByText('העגלה ריקה')).not.toBeInTheDocument()
    expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 2 }])
  })

  it('removes a line from the account\u2019s cart when it is removed on the page', async () => {
    await useAuthStore.getState().register(GOOD)
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1')
    renderApp('/cart', catalog)
    await screen.findByRole('link', { name: 'ספק כוח' })
    await waitFor(() => expect(savedCart()).toHaveLength(2))

    await userEvent.click(screen.getByRole('button', { name: 'הסרת ספק כוח מהעגלה' }))

    await waitFor(() => expect(savedCart()).toEqual([{ productId: 'GPU-1', quantity: 1 }]))
  })

  it('shows the empty cart, and says that it could not be saved, when the API cannot be reached', async () => {
    await useAuthStore.getState().register(GOOD)
    const inner = globalThis.fetch
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/api/cart')
        ? Promise.reject(new TypeError('network down'))
        : inner(input, init),
    )

    renderApp('/cart', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    const notices = screen.getByRole('region', { name: 'התראות' })
    expect(await within(notices).findByText(CART_SYNC_NOTICES.offline)).toBeInTheDocument()
  })

  it('does not keep a visitor who is not signed in waiting', async () => {
    renderApp('/cart', catalog)

    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    expect(api.carts().size).toBe(0)
  })
})
