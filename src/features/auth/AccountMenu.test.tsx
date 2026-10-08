import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { accountButton, accountPanel, openAccountMenu } from '@/test/accountMenu'
import { setUpAuthApi } from '@/test/authApi'
import { renderApp } from '@/test/renderApp'
import { useAuthStore } from './authStore'

// The real authentication API answers these tests (see src/test/authApi.ts).
setUpAuthApi()

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const url = () => screen.getByTestId('url').textContent

async function signedInOnHome() {
  await useAuthStore.getState().register(GOOD)
  renderApp('/')
  await screen.findByRole('heading', { level: 1 })
}

describe('the account menu of the header', () => {
  it('is a sign-in link, and no account button, for a signed-out visitor', async () => {
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: 'החשבון שלי' })).not.toBeInTheDocument()
  })

  it('is one "My account" button, closed at first, that controls a hidden panel', async () => {
    await signedInOnHome()

    const button = accountButton()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(accountPanel()).toHaveAttribute('id', button.getAttribute('aria-controls'))
    expect(accountPanel()).not.toBeVisible()
    // Nothing of the panel is reachable while it is closed.
    expect(screen.queryByRole('button', { name: 'התנתקות' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'ההזמנות שלי' })).not.toBeInTheDocument()
  })

  it('opens with a click and shows the name, the orders and both ways to sign out', async () => {
    await signedInOnHome()

    const panel = await openAccountMenu()

    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
    expect(accountPanel()).toBeVisible()
    expect(panel.getByText(GOOD.name)).toBeInTheDocument()
    expect(panel.getByRole('link', { name: 'ההזמנות שלי' })).toHaveAttribute('href', '/orders')
    expect(panel.getByRole('button', { name: 'התנתקות' })).toBeEnabled()
    expect(panel.getByRole('button', { name: 'התנתקות מכל המכשירים' })).toBeEnabled()
    // Opening does not move the focus away from the button.
    expect(accountButton()).toHaveFocus()
  })

  it('opens and closes with the keyboard: Enter and Space on the button', async () => {
    await signedInOnHome()
    accountButton().focus()

    await userEvent.keyboard('{Enter}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Enter}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.keyboard(' ')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('is reached with Tab in the order of the page: the items follow the button', async () => {
    await signedInOnHome()
    accountButton().focus()
    await userEvent.keyboard('{Enter}')

    const names: string[] = []
    for (let step = 0; step < 3; step += 1) {
      await userEvent.tab()
      names.push(document.activeElement?.textContent ?? '')
    }

    expect(names).toEqual(['ההזמנות שלי', 'התנתקות', 'התנתקות מכל המכשירים'])
  })

  it('closes with Escape from an item and gives the focus back to the button', async () => {
    await signedInOnHome()
    const panel = await openAccountMenu()
    await userEvent.tab()
    expect(panel.getByRole('link', { name: 'ההזמנות שלי' })).toHaveFocus()

    await userEvent.keyboard('{Escape}')

    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    expect(accountPanel()).not.toBeVisible()
    expect(accountButton()).toHaveFocus()
  })

  it('closes with Escape from the button itself, and Escape does nothing when it is closed', async () => {
    await signedInOnHome()
    await openAccountMenu()

    await userEvent.keyboard('{Escape}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    expect(accountButton()).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the focus leaves it with Tab, and when the visitor clicks elsewhere', async () => {
    await signedInOnHome()
    await openAccountMenu()
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab() // past the last item

    await waitFor(() => expect(accountButton()).toHaveAttribute('aria-expanded', 'false'))

    await openAccountMenu()
    await userEvent.click(document.body)
    await waitFor(() => expect(accountButton()).toHaveAttribute('aria-expanded', 'false'))
  })

  it('closes when an item is chosen: the orders open, and the panel is closed on the new page', async () => {
    await signedInOnHome()
    const panel = await openAccountMenu()

    await userEvent.click(panel.getByRole('link', { name: 'ההזמנות שלי' }))

    await screen.findByRole('heading', { level: 1, name: 'ההזמנות שלי' })
    expect(url()).toBe('/orders')
    expect(accountButton()).toHaveAttribute('aria-expanded', 'false')
    expect(accountPanel()).not.toBeVisible()
  })

  it('signs out from the panel, which then gives way to the sign-in link', async () => {
    await signedInOnHome()
    const panel = await openAccountMenu()

    await userEvent.click(panel.getByRole('button', { name: 'התנתקות' }))

    await waitFor(() => expect(useAuthStore.getState().status).toBe('anonymous'))
    expect(screen.queryByRole('button', { name: 'החשבון שלי' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'התחברות' })[0]).toBeInTheDocument()
  })

  it('keeps the mobile menu as a plain list: the same four things, no button to open', async () => {
    await signedInOnHome()

    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))
    const menu = within(screen.getByRole('dialog', { name: 'תפריט ראשי' }))

    expect(menu.getByText(GOOD.name)).toBeInTheDocument()
    expect(menu.getByRole('link', { name: 'ההזמנות שלי' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'התנתקות' })).toBeInTheDocument()
    expect(menu.getByRole('button', { name: 'התנתקות מכל המכשירים' })).toBeInTheDocument()
    expect(menu.queryByRole('button', { name: 'החשבון שלי' })).not.toBeInTheDocument()
  })
})
