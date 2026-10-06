import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppCrash, RouteCrash } from './CrashScreens'

const CHUNK = new TypeError('Failed to fetch dynamically imported module: /assets/LoginPage-x.js')
const OTHER = new Error('Cannot read properties of undefined')

describe('RouteCrash', () => {
  const setup = (error: Error) => {
    const reset = vi.fn()
    const reload = vi.fn()
    render(
      <MemoryRouter>
        <RouteCrash error={error} reset={reset} reload={reload} />
      </MemoryRouter>,
    )
    return { reset, reload }
  }

  it('is announced as an alert, says what happened and offers to try again and to go home', async () => {
    const { reset, reload } = setup(OTHER)

    expect(screen.getByRole('alert')).toHaveTextContent('משהו השתבש בעמוד הזה')
    expect(screen.getByRole('alert')).toHaveTextContent('העגלה והמועדפים לא נפגעו')
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')

    await userEvent.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(reset).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('offers to load the site again, not to try again, for a page that could not be loaded', async () => {
    const { reset, reload } = setup(CHUNK)

    expect(screen.getByRole('alert')).toHaveTextContent('גרסה חדשה של האתר זמינה')
    expect(screen.queryByRole('button', { name: 'נסו שוב' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'רענון העמוד' }))

    expect(reload).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('does not show the technical message of the error to the visitor', () => {
    setup(OTHER)

    expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
  })
})

describe('AppCrash', () => {
  it('works without a router: a plain link home, and a reload', async () => {
    const reload = vi.fn()
    render(<AppCrash error={OTHER} reload={reload} />)

    expect(screen.getByRole('alert')).toHaveTextContent('משהו השתבש בעמוד הזה')
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('main')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'רענון העמוד' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('explains a page that could not be loaded', () => {
    render(<AppCrash error={CHUNK} reload={() => {}} />)

    expect(screen.getByRole('alert')).toHaveTextContent('גרסה חדשה של האתר זמינה')
  })
})
