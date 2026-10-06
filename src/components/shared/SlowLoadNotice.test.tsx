import { act, render, screen } from '@testing-library/react'
import { SLOW_LOAD_AFTER_MS, SlowLoadNotice } from './SlowLoadNotice'

const MESSAGE = /הטעינה לוקחת יותר מהרגיל/

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SlowLoadNotice', () => {
  it('says nothing while a page loads quickly', () => {
    render(<SlowLoadNotice />)

    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_AFTER_MS - 1)
    })

    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
  })

  it('explains the wait, politely, once loading takes longer than a few seconds', () => {
    render(<SlowLoadNotice />)

    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_AFTER_MS)
    })

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(MESSAGE)
    expect(notice).toHaveTextContent('נרדם')
    expect(notice).toHaveTextContent('אין צורך לרענן')
  })

  it('does not fire after the page has finished loading, and counts again for the next load', () => {
    const first = render(<SlowLoadNotice />)
    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_AFTER_MS - 1000)
    })
    first.unmount()
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()

    render(<SlowLoadNotice />)
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(SLOW_LOAD_AFTER_MS)
    })
    expect(screen.getByText(MESSAGE)).toBeInTheDocument()
  })
})
