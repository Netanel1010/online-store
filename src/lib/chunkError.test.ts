import { isChunkLoadError } from './chunkError'

describe('isChunkLoadError', () => {
  it.each([
    [
      'Chrome',
      'Failed to fetch dynamically imported module: https://x.github.io/online-store/assets/LoginPage-abc.js',
    ],
    [
      'Firefox',
      'error loading dynamically imported module: https://x.github.io/assets/LoginPage-abc.js',
    ],
    ['Safari', 'Importing a module script failed.'],
    ['webpack-style', 'Loading chunk 12 failed.'],
    ['a stylesheet', 'Unable to preload CSS for /assets/LoginPage-abc.css'],
  ])('recognises the %s wording of a page that could not be loaded', (_browser, message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true)
    expect(isChunkLoadError(new Error(message))).toBe(true)
  })

  it('recognises it in a value that is not an Error', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true)
  })

  it.each([
    new Error('Cannot read properties of undefined (reading "name")'),
    new TypeError('Failed to fetch'),
    new RangeError('Maximum call stack size exceeded'),
    'something went wrong',
    undefined,
    null,
  ])('does not take another failure for it: %s', (error) => {
    expect(isChunkLoadError(error)).toBe(false)
  })
})
