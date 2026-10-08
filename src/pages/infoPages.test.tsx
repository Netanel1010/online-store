import { screen, within } from '@testing-library/react'
import { paths } from '@/app/paths'
import { INFO_PAGE_IDS, INFO_PAGES } from '@/lib/infoPages'
import { GITHUB_PROFILE_URL, GITHUB_REPOSITORY_URL } from '@/lib/links'
import { renderApp } from '@/test/renderApp'

describe('the information pages', () => {
  it.each(INFO_PAGE_IDS)('%s has its own address, heading and breadcrumbs', async (id) => {
    renderApp(paths.info(id))

    const heading = await screen.findByRole('heading', { level: 1, name: INFO_PAGES[id].label })
    expect(heading).toBeInTheDocument()
    const crumbs = screen.getByRole('navigation', { name: 'פירורי לחם' })
    expect(within(crumbs).getByRole('link', { name: 'בית' })).toHaveAttribute('href', '/')
    expect(within(crumbs).getByText(INFO_PAGES[id].label)).toHaveAttribute('aria-current', 'page')
  })

  it('keeps every page reachable through the paths helper at the path the build writes', () => {
    for (const id of INFO_PAGE_IDS) expect(paths.info(id)).toBe(`/${INFO_PAGES[id].path}`)
    expect(new Set(INFO_PAGE_IDS.map((id) => INFO_PAGES[id].path)).size).toBe(INFO_PAGE_IDS.length)
  })

  it('gives every page a heading of its own and sections with headings', async () => {
    for (const id of INFO_PAGE_IDS) {
      const { unmount } = renderApp(paths.info(id))
      await screen.findByRole('heading', { level: 1, name: INFO_PAGES[id].label })
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(2)
      unmount()
    }
  })
})

describe('the hosting of the site, as the pages describe it', () => {
  it('says on the about page that the site is hosted on GitHub Pages (the primary site) and on Netlify', async () => {
    renderApp(paths.info('about'))
    const main = await screen.findByRole('main')

    expect(main).toHaveTextContent('GitHub Pages (האתר הראשי)')
    expect(main).toHaveTextContent('Netlify')
    expect(main).toHaveTextContent('ב-Render')
  })

  it('says on the privacy page that both hosts may keep access logs, and that sessions are per address', async () => {
    renderApp(paths.info('privacy'))
    const main = await screen.findByRole('main')

    expect(main).toHaveTextContent(/GitHub Pages, האתר הראשי, ו-Netlify/)
    expect(main).toHaveTextContent('עשויים להיות רישומי גישה משלה')
    expect(main).toHaveTextContent('לכל כתובת אתר בנפרד')
    expect(main).toHaveTextContent('ב-Render')
  })
})

describe('the contact page', () => {
  it('shows only the GitHub profile and repository, which open in a new tab', async () => {
    renderApp(paths.info('contact'))
    const main = await screen.findByRole('main')

    const profile = within(main).getByRole('link', { name: /הפרופיל ב-GitHub/ })
    const repository = within(main).getByRole('link', { name: /מאגר הקוד של האתר ב-GitHub/ })
    expect(profile).toHaveAttribute('href', GITHUB_PROFILE_URL)
    expect(repository).toHaveAttribute('href', GITHUB_REPOSITORY_URL)
    for (const link of [profile, repository]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
      expect(link).toHaveTextContent('נפתח בלשונית חדשה')
    }
  })

  it('publishes no email, phone, WhatsApp, address or form, and says there is no business', async () => {
    renderApp(paths.info('contact'))
    const main = await screen.findByRole('main')

    const hrefs = within(main)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
    expect(hrefs.filter((href) => /^(mailto:|tel:|sms:)|wa\.me|whatsapp/i.test(href))).toEqual([])
    expect(
      hrefs.filter((href) => /^https?:/.test(href) && !href.startsWith('https://github.com/')),
    ).toEqual([])
    expect(main.querySelector('form, input, textarea')).toBeNull()
    expect(main).toHaveTextContent('אינה עסק פעיל')
    expect(main.textContent).not.toMatch(/@|\d{2,3}-?\d{7}/)
  })
})

describe('the terms page', () => {
  it('says that shipping and returns do not apply, without inventing a policy', async () => {
    renderApp(paths.info('terms'))
    await screen.findByRole('heading', { level: 1, name: 'תנאי שימוש' })

    for (const title of ['משלוחים', 'החזרות וביטולים']) {
      const section = screen.getByRole('heading', { level: 2, name: title }).closest('section')!
      expect(section).toHaveTextContent('לא רלוונטי')
    }
    expect(screen.getByRole('heading', { level: 2, name: 'הודעת הדגמה' })).toBeInTheDocument()
  })
})

describe('the privacy page', () => {
  it('describes what is stored, in the browser and on the server, and that there are no cookies', async () => {
    renderApp(paths.info('privacy'))
    await screen.findByRole('heading', { level: 1, name: 'מדיניות פרטיות' })

    for (const title of ['מה נשמר בשרת', 'מה נשמר בדפדפן שלכם', 'יומני שרת', 'מה האתר לא עושה']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    expect(screen.getByText('האתר אינו משתמש בעוגיות.')).toBeInTheDocument()
  })
})

describe('the accessibility statement', () => {
  it('claims no conformance and says what has not been checked', async () => {
    renderApp(paths.info('accessibility'))
    await screen.findByRole('heading', { level: 1, name: 'הצהרת נגישות' })

    expect(screen.getByText(/לא נבדק עם קורא מסך/)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'אין הצהרה על התאמה לתקן' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/עומד בתקן WCAG AA|מותאם במלואו|נגיש במלואו/)
  })
})
