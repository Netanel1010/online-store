import { screen, within } from '@testing-library/react'
import { paths } from '@/app/paths'
import { INFO_PAGE_IDS, INFO_PAGES } from '@/lib/infoPages'
import { GITHUB_REPOSITORY_URL } from '@/lib/links'
import { renderWithProviders } from '@/test/renderWithProviders'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links to every information page, under one heading, in the order of the page list', () => {
    renderWithProviders(<Footer />)

    const nav = screen.getByRole('navigation', { name: 'מידע' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(
      INFO_PAGE_IDS.map((id) => INFO_PAGES[id].label),
    )
    links.forEach((link, index) =>
      expect(link).toHaveAttribute('href', paths.info(INFO_PAGE_IDS[index]!)),
    )
  })

  it('still has the main links and every category', () => {
    renderWithProviders(<Footer />)

    const main = within(screen.getByRole('navigation', { name: 'קישורים' }))
    expect(main.getByRole('link', { name: 'מוצרים' })).toHaveAttribute('href', paths.products)
    const categories = within(screen.getByRole('navigation', { name: 'קטגוריות בתחתית העמוד' }))
    expect(categories.getAllByRole('link')).toHaveLength(12)
  })

  it('says that this is a demo, and links to the code on GitHub in a new tab', () => {
    renderWithProviders(<Footer />)
    const footer = within(screen.getByRole('contentinfo'))

    expect(footer.getByText(/זהו אתר הדגמה: לא מתבצעת רכישה אמיתית/)).toBeInTheDocument()
    const github = footer.getByRole('link', { name: /קוד האתר ב-GitHub/ })
    expect(github).toHaveAttribute('href', GITHUB_REPOSITORY_URL)
    expect(github).toHaveAttribute('target', '_blank')
    expect(github).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(github).toHaveTextContent('נפתח בלשונית חדשה')
  })

  it('shows no email, phone or WhatsApp contact, because none exists', () => {
    renderWithProviders(<Footer />)
    const hrefs = within(screen.getByRole('contentinfo'))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')

    expect(hrefs.filter((href) => /^(mailto:|tel:|sms:)|wa\.me|whatsapp/i.test(href))).toEqual([])
  })
})
