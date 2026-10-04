import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { QuantityStepper } from './QuantityStepper'

function Harness({ initial = 3, max = 10 }: { initial?: number; max?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <QuantityStepper value={value} onChange={setValue} label="ספק כוח" max={max} />
      <output data-testid="value">{value}</output>
    </>
  )
}

const field = () => screen.getByRole('textbox', { name: 'כמות ספק כוח' })
const committed = () => screen.getByTestId('value')

describe('QuantityStepper', () => {
  it('increments and decrements with the buttons', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות: ספק כוח' }))
    expect(committed()).toHaveTextContent('4')

    await userEvent.click(screen.getByRole('button', { name: 'הפחתת כמות: ספק כוח' }))
    await userEvent.click(screen.getByRole('button', { name: 'הפחתת כמות: ספק כוח' }))
    expect(committed()).toHaveTextContent('2')
  })

  it('disables minus at 1 and plus at the maximum', () => {
    const { unmount } = render(<Harness initial={1} />)
    expect(screen.getByRole('button', { name: /הפחתת כמות/ })).toBeDisabled()
    unmount()

    render(<Harness initial={10} max={10} />)
    expect(screen.getByRole('button', { name: /הגדלת כמות/ })).toBeDisabled()
  })

  it('commits typed whole numbers', async () => {
    render(<Harness />)

    await userEvent.clear(field())
    await userEvent.type(field(), '7')

    expect(committed()).toHaveTextContent('7')
  })

  it('does not commit empty or zero input and snaps back on blur', async () => {
    render(<Harness />)

    await userEvent.clear(field())
    expect(committed()).toHaveTextContent('3')

    await userEvent.type(field(), '0')
    expect(committed()).toHaveTextContent('3')

    await userEvent.tab()
    expect(field()).toHaveValue('3')
  })

  it('rejects non-numeric characters', async () => {
    render(<Harness />)

    await userEvent.clear(field())
    await userEvent.type(field(), 'ab5-')

    expect(field()).toHaveValue('5')
    expect(committed()).toHaveTextContent('5')
  })

  it('clamps typed values above the maximum', async () => {
    render(<Harness max={10} />)

    await userEvent.clear(field())
    await userEvent.type(field(), '150')

    expect(committed()).toHaveTextContent('10')
    expect(field()).toHaveValue('10')
  })

  it('groups the controls under one accessible name', () => {
    render(<Harness />)

    expect(screen.getByRole('group', { name: 'כמות: ספק כוח' })).toBeInTheDocument()
  })
})
