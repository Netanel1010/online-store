import { BUDGET, budgetProblems, initialAssets } from './bundleBudget.mjs'

const html = `<!doctype html><html><head>
<script type="module" crossorigin src="/online-store/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/online-store/assets/react-def.js">
<link rel="preconnect" href="https://api.example.invalid" crossorigin="anonymous" />
<link rel="icon" href="/online-store/favicon.svg" />
<link rel="stylesheet" crossorigin href="/online-store/assets/index-ghi.css">
</head><body><div id="root"></div></body></html>`

describe('initialAssets', () => {
  it('lists the entry script, the preloaded chunks and the stylesheets, relative to dist', () => {
    expect(initialAssets(html, '/online-store/')).toEqual([
      { path: 'assets/index-abc.js', kind: 'javascript' },
      { path: 'assets/react-def.js', kind: 'javascript' },
      { path: 'assets/index-ghi.css', kind: 'stylesheet' },
    ])
  })

  it('leaves out other links, other hosts and other base paths', () => {
    expect(initialAssets(html, '/other/')).toEqual([])
    expect(
      initialAssets('<script src="https://cdn.invalid/a.js"></script>', '/online-store/'),
    ).toEqual([])
  })

  it('accepts a base path without the closing slash', () => {
    expect(initialAssets(html, '/online-store')).toHaveLength(3)
  })
})

describe('budgetProblems', () => {
  const within = [
    { kind: 'javascript', bytes: 100 * 1024 },
    { kind: 'javascript', bytes: 30 * 1024 },
    { kind: 'stylesheet', bytes: 8 * 1024 },
  ]

  it('accepts the weight of the build it was set from, with room to spare', () => {
    expect(budgetProblems(within)).toEqual([])
  })

  it('adds the files of a kind up before comparing', () => {
    const over = [
      { kind: 'javascript', bytes: 100 * 1024 },
      { kind: 'javascript', bytes: 61 * 1024 },
      { kind: 'stylesheet', bytes: 8 * 1024 },
    ]
    expect(budgetProblems(over)).toEqual([
      'the javascript loaded up front is 161.0 KiB gzipped, over the budget of 160.0 KiB',
    ])
  })

  it('accepts exactly the budget', () => {
    expect(
      budgetProblems([
        { kind: 'javascript', bytes: BUDGET.javascript },
        { kind: 'stylesheet', bytes: BUDGET.stylesheet },
      ]),
    ).toEqual([])
  })

  it('reports a stylesheet over budget', () => {
    const files = [
      { kind: 'javascript', bytes: 1024 },
      { kind: 'stylesheet', bytes: 17 * 1024 },
    ]
    expect(budgetProblems(files)).toEqual([expect.stringContaining('stylesheet loaded up front')])
  })

  it('does not let an empty build pass', () => {
    expect(budgetProblems([])).toEqual([
      'the home page loads no javascript up front (is the build empty?)',
      'the home page loads no stylesheet up front (is the build empty?)',
    ])
  })
})
