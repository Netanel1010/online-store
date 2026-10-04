import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from './ToastProvider'
import { useToast, type ToastOptions } from './toastContext'

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.show(options)}>
      show
    </button>
  )
}

const region = () => screen.getByRole('region', { name: 'התראות' })
const showButton = () => screen.getByRole('button', { name: 'show' })

function setup(options: ToastOptions = { message: 'נשמר' }) {
  return render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  )
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the message in a labelled region', async () => {
    setup({ message: 'המוצר נוסף' })
    expect(within(region()).queryByText('המוצר נוסף')).not.toBeInTheDocument()

    await userEvent.click(showButton())

    expect(within(region()).getByText('המוצר נוסף')).toBeInTheDocument()
  })

  it('announces the message once through a single polite live region', async () => {
    setup({ message: 'המוצר נוסף' })

    await userEvent.click(showButton())

    const announcer = screen.getByRole('status')
    expect(announcer).toHaveAttribute('aria-live', 'polite')
    expect(announcer).toHaveTextContent('המוצר נוסף')
    // The visible toast is not a second live region, so nothing is read twice.
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('announces an identical message again', async () => {
    setup({ message: 'שוב' })

    await userEvent.click(showButton())
    const first = screen.getByRole('status').textContent
    await userEvent.click(showButton())
    const second = screen.getByRole('status').textContent

    expect(first).not.toBe(second) // the text changed, so assistive technology reads it again
    expect(second?.trim()).toBe('שוב')
    expect(within(region()).getAllByText('שוב')).toHaveLength(2)
  })

  it('closes on its own after five seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    await userEvent.click(showButton())
    expect(within(region()).getByText('נשמר')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(4900))
    expect(within(region()).getByText('נשמר')).toBeInTheDocument()

    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(within(region()).queryByText('נשמר')).not.toBeInTheDocument()
  })

  it('honours a custom duration', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ message: 'קצר', durationMs: 1000 })
    await userEvent.click(showButton())

    await act(() => vi.advanceTimersByTimeAsync(1100))

    expect(within(region()).queryByText('קצר')).not.toBeInTheDocument()
  })

  it('stays open while the pointer is over it and closes after the pointer leaves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup()
    await userEvent.click(showButton())
    const toast = within(region()).getByText('נשמר').parentElement!

    await userEvent.hover(toast)
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(within(region()).getByText('נשמר')).toBeInTheDocument()

    await userEvent.unhover(toast)
    await act(() => vi.advanceTimersByTimeAsync(5100))
    expect(within(region()).queryByText('נשמר')).not.toBeInTheDocument()
  })

  it('stays open while keyboard focus is inside it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setup({ message: 'נשמר', action: <a href="#cart">לעגלה</a> })
    await userEvent.click(showButton())

    within(region()).getByRole('link', { name: 'לעגלה' }).focus()
    await act(() => vi.advanceTimersByTimeAsync(20_000))

    expect(within(region()).getByText('נשמר')).toBeInTheDocument()
  })

  it('has a close button', async () => {
    setup()
    await userEvent.click(showButton())

    await userEvent.click(within(region()).getByRole('button', { name: 'סגירת התראה' }))

    expect(within(region()).queryByText('נשמר')).not.toBeInTheDocument()
  })

  it('renders an action that the keyboard can reach', async () => {
    setup({ message: 'נשמר', action: <a href="#cart">לעגלה</a> })
    await userEvent.click(showButton())

    const link = within(region()).getByRole('link', { name: 'לעגלה' })
    link.focus()

    expect(link).toHaveFocus()
  })

  it('keeps at most three toasts, dropping the oldest', async () => {
    let call = 0
    function Counter() {
      const toast = useToast()
      return (
        <button type="button" onClick={() => toast.show({ message: `הודעה ${++call}` })}>
          next
        </button>
      )
    }
    render(
      <ToastProvider>
        <Counter />
      </ToastProvider>,
    )

    for (let i = 0; i < 4; i += 1)
      await userEvent.click(screen.getByRole('button', { name: 'next' }))

    expect(within(region()).queryByText('הודעה 1')).not.toBeInTheDocument()
    expect(within(region()).getByText('הודעה 2')).toBeInTheDocument()
    expect(within(region()).getByText('הודעה 4')).toBeInTheDocument()
  })

  it('throws a helpful error when used without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used inside <ToastProvider>',
    )
  })
})
