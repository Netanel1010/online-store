import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from './test'

/**
 * Runs axe-core (WCAG 2.0, 2.1 and 2.2 level A and AA rules plus its best-practice rules) on the page as it currently is, in a real
 * browser, so rules that need rendering such as colour contrast are evaluated for real.
 *
 * Automated checks find a useful subset of problems (roughly a third to a half of WCAG issues).
 * Passing them does not mean the page is accessible or WCAG-compliant: keyboard flow, screen
 * reader behaviour, content quality and many criteria still need manual review.
 */
export async function expectNoAxeViolations(page: Page, { exclude = [] as string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
  ])
  for (const selector of exclude) builder = builder.exclude(selector)
  const { violations } = await builder.analyze()

  const report = violations.map((violation) => {
    const nodes = violation.nodes
      .slice(0, 4)
      .map(
        (node) =>
          `    ${node.target.join(' ')}\n      ${node.failureSummary?.split('\n').slice(1).join(' ')}`,
      )
      .join('\n')
    return `${violation.id} [${violation.impact}] ${violation.help} (${violation.nodes.length} element(s))\n${nodes}`
  })
  expect(report, `accessibility violations on ${page.url()}`).toEqual([])
}
