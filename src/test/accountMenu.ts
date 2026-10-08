import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** The "My account" button of the header, which a signed-in visitor has. */
export const accountButton = () => screen.getByRole('button', { name: 'החשבון שלי' })

/** The panel that the button opens. It is in the page even when closed (hidden), so a test can look for it. */
export const accountPanel = () =>
  document.getElementById(accountButton().getAttribute('aria-controls')!)!

/** Opens the account panel the way a visitor does, and returns queries for what is inside. */
export async function openAccountMenu() {
  await userEvent.click(accountButton())
  return within(accountPanel())
}

/** Opens the account panel and presses "Sign out" in it. */
export async function signOutFromHeader() {
  const panel = await openAccountMenu()
  await userEvent.click(panel.getByRole('button', { name: 'התנתקות' }))
}
