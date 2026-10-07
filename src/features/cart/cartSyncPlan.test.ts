import { mergeCarts, planChanges } from './cartSyncPlan'

const known = (entries: [string, number][]) => new Map(entries)

describe('planChanges', () => {
  it('sends nothing when the API already has what the cart here has', () => {
    expect(planChanges(known([['A', 2]]), [{ productId: 'A', quantity: 2 }])).toEqual([])
    expect(planChanges(known([]), [])).toEqual([])
  })

  it('sets a line that is new or has another quantity, and only that one', () => {
    const changes = planChanges(
      known([
        ['A', 2],
        ['B', 1],
      ]),
      [
        { productId: 'A', quantity: 2 },
        { productId: 'B', quantity: 5 },
        { productId: 'C', quantity: 1 },
      ],
    )

    expect(changes).toEqual([
      { kind: 'set', productId: 'B', quantity: 5 },
      { kind: 'set', productId: 'C', quantity: 1 },
    ])
  })

  it('removes a line the cart no longer has, before it sets the others', () => {
    const changes = planChanges(
      known([
        ['A', 2],
        ['B', 1],
      ]),
      [{ productId: 'C', quantity: 1 }],
    )

    expect(changes).toEqual([
      { kind: 'remove', productId: 'A' },
      { kind: 'remove', productId: 'B' },
      { kind: 'set', productId: 'C', quantity: 1 },
    ])
  })

  it('empties the cart in one request when nothing is wanted, and does nothing if it is empty', () => {
    expect(
      planChanges(
        known([
          ['A', 2],
          ['B', 1],
        ]),
        [],
      ),
    ).toEqual([{ kind: 'clear' }])
    expect(planChanges(known([]), [])).toEqual([])
  })

  it('leaves alone a line it has never heard of', () => {
    // Added on another device: this browser does not know it, so it does not remove it.
    expect(planChanges(known([['A', 1]]), [{ productId: 'A', quantity: 1 }])).toEqual([])
  })
})

describe('mergeCarts', () => {
  it('has every product from either cart', () => {
    const merged = mergeCarts([{ productId: 'A', quantity: 1 }], [{ productId: 'B', quantity: 2 }])

    expect(merged).toEqual([
      { productId: 'A', quantity: 1 },
      { productId: 'B', quantity: 2 },
    ])
  })

  it('takes the larger quantity of a product that is in both, never the sum', () => {
    const merged = mergeCarts(
      [
        { productId: 'A', quantity: 3 },
        { productId: 'B', quantity: 1 },
      ],
      [
        { productId: 'A', quantity: 2 },
        { productId: 'B', quantity: 4 },
      ],
    )

    expect(merged).toEqual([
      { productId: 'A', quantity: 3 },
      { productId: 'B', quantity: 4 },
    ])
  })

  it('joining a cart with itself changes nothing, so a repeated sign-in cannot double it', () => {
    const cart = [
      { productId: 'A', quantity: 3 },
      { productId: 'B', quantity: 1 },
    ]

    expect(mergeCarts(cart, cart)).toEqual(cart)
  })

  it('keeps the order of the account first, then the new lines in the order they were added', () => {
    const merged = mergeCarts(
      [
        { productId: 'X', quantity: 1 },
        { productId: 'Y', quantity: 1 },
      ],
      [
        { productId: 'N2', quantity: 1 },
        { productId: 'Y', quantity: 1 },
        { productId: 'N1', quantity: 1 },
      ],
    )

    expect(merged.map((line) => line.productId)).toEqual(['X', 'Y', 'N2', 'N1'])
  })
})
