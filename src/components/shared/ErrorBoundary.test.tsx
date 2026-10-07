import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

/** Throws while rendering, as long as `broken.value` is set. */
const broken = { value: true }
function Fragile() {
  if (broken.value) throw new Error('boom')
  return <p>all fine</p>
}

beforeEach(() => {
  broken.value = true
  // React and the boundary both report a caught error to the console: that is expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ErrorBoundary', () => {
  it('shows what is inside it while nothing fails', () => {
    broken.value = false

    render(
      <ErrorBoundary fallback={() => <p>fallback</p>}>
        <Fragile />
      </ErrorBoundary>,
    )

    expect(screen.getByText('all fine')).toBeInTheDocument()
    expect(screen.queryByText('fallback')).not.toBeInTheDocument()
  })

  it('shows the fallback, with the error, instead of a blank page when a child fails to render', () => {
    render(
      <ErrorBoundary fallback={({ error }) => <p>failed: {error.message}</p>}>
        <Fragile />
      </ErrorBoundary>,
    )

    expect(screen.getByText('failed: boom')).toBeInTheDocument()
  })

  it('writes the error to the console and tells onError', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary fallback={() => <p>fallback</p>} onError={onError}>
        <Fragile />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toEqual(new Error('boom'))
    expect(console.error).toHaveBeenCalledWith(
      'The page failed to render:',
      expect.any(Error),
      expect.any(String),
    )
  })

  it('treats a thrown value that is not an Error as one', () => {
    function Throws(): never {
      throw 'just text'
    }

    render(
      <ErrorBoundary
        fallback={({ error }) => <p>{`got ${error.constructor.name}: ${error.message}`}</p>}
      >
        <Throws />
      </ErrorBoundary>,
    )

    expect(screen.getByText('got Error: just text')).toBeInTheDocument()
  })

  it('shows the children again when the fallback resets it and they work', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button
            type="button"
            onClick={() => {
              broken.value = false
              reset()
            }}
          >
            try again
          </button>
        )}
      >
        <Fragile />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'try again' }))

    expect(screen.getByText('all fine')).toBeInTheDocument()
  })

  it('shows the fallback again when the children still fail after a reset', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button type="button" onClick={reset}>
            try again
          </button>
        )}
      >
        <Fragile />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'try again' }))

    expect(screen.getByRole('button', { name: 'try again' })).toBeInTheDocument()
  })

  it('clears the error when the reset key changes, so another page gets a fresh start', async () => {
    const user = userEvent.setup()
    function Host() {
      const [page, setPage] = useState('broken')
      return (
        <>
          <button type="button" onClick={() => setPage('fine')}>
            go
          </button>
          <ErrorBoundary resetKey={page} fallback={() => <p>fallback</p>}>
            {page === 'broken' ? <Fragile /> : <p>another page</p>}
          </ErrorBoundary>
        </>
      )
    }
    render(<Host />)
    expect(screen.getByText('fallback')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'go' }))

    expect(screen.getByText('another page')).toBeInTheDocument()
    expect(screen.queryByText('fallback')).not.toBeInTheDocument()
  })

  it('keeps the error while the reset key stays the same', async () => {
    const user = userEvent.setup()
    function Host() {
      const [count, setCount] = useState(0)
      return (
        <>
          <button type="button" onClick={() => setCount(count + 1)}>
            rerender
          </button>
          <ErrorBoundary resetKey="same" fallback={() => <p>fallback {count}</p>}>
            <Fragile />
          </ErrorBoundary>
        </>
      )
    }
    render(<Host />)

    await user.click(screen.getByRole('button', { name: 'rerender' }))

    expect(screen.getByText('fallback 1')).toBeInTheDocument()
  })
})
