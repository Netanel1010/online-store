import { describe, expect, it } from 'vitest'
import { createConcurrencyGate } from './concurrencyGate.ts'
import { HttpError } from './httpError.ts'

/** A task that runs until the test lets it finish. */
function controlled<T = void>() {
  let finish!: (value: T) => void
  let fail!: (error: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  let started = false
  return {
    run: () => {
      started = true
      return promise
    },
    finish,
    fail,
    started: () => started,
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createConcurrencyGate', () => {
  it('runs a task at once and returns what it returns', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 2, maxQueued: 1 })

    await expect(gate.run(async () => 'done')).resolves.toBe('done')
  })

  it('runs no more tasks at once than it is allowed, and the next one when a place frees up', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 2, maxQueued: 5 })
    const [a, b, c] = [controlled(), controlled(), controlled()]

    const results = [gate.run(a.run), gate.run(b.run), gate.run(c.run)]
    await tick()
    expect([a.started(), b.started(), c.started()]).toEqual([true, true, false])

    a.finish()
    await tick()
    expect(c.started()).toBe(true)

    b.finish()
    c.finish()
    await Promise.all(results)
  })

  it('turns a task away with a 503 and a Retry-After once the line is full', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 1, retryAfterSeconds: 3 })
    const running = controlled()
    const waiting = controlled()
    const first = gate.run(running.run)
    const second = gate.run(waiting.run)
    await tick()

    const refused = await gate.run(async () => 'never').catch((error: unknown) => error)

    expect(refused).toBeInstanceOf(HttpError)
    expect(refused).toMatchObject({
      status: 503,
      code: 'server_busy',
      headers: { 'Retry-After': '3' },
    })
    expect(waiting.started()).toBe(false)
    running.finish()
    waiting.finish()
    await Promise.all([first, second])
  })

  it('gives a place back when a task fails, so one failure does not close the gate', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 0 })
    const failing = controlled()
    const first = gate.run(failing.run).catch((error: unknown) => error)
    await tick()
    failing.fail(new Error('boom'))
    expect(await first).toEqual(new Error('boom'))

    await expect(gate.run(async () => 'works again')).resolves.toBe('works again')
  })

  it('does not count a turn away as using a place', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 0 })
    const running = controlled()
    const first = gate.run(running.run)
    await tick()
    await expect(gate.run(async () => 1)).rejects.toBeInstanceOf(HttpError)
    await expect(gate.run(async () => 1)).rejects.toBeInstanceOf(HttpError)

    running.finish()
    await first

    await expect(gate.run(async () => 'free')).resolves.toBe('free')
  })

  it('serves the line in the order it formed', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 5 })
    const order: number[] = []
    const first = controlled()
    const results = [
      gate.run(first.run),
      gate.run(async () => void order.push(2)),
      gate.run(async () => void order.push(3)),
    ]
    await tick()

    first.finish()
    await Promise.all(results)

    expect(order).toEqual([2, 3])
  })
})
