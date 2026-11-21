import type { Page } from '@playwright/test'

/** Where the parts of the first row of the desktop header really are, measured from the layout. */
export interface HeaderMeasure {
  viewport: number
  /** The search form: left edge, right edge and width, in CSS pixels. */
  form: { left: number; right: number; width: number }
  /** The clear space between the form and the nearest control after it (null when there is none). */
  gapToIcons: number | null
  /** The clear space between the main navigation and the form. */
  gapToNav: number
  /** The largest distance of a control's vertical center from the middle of the 64px row. */
  offAxis: number
  /** Pairs of controls whose boxes overlap. */
  overlaps: string[]
  /** Controls that are not inside the screen. */
  outside: string[]
  scrollsSideways: boolean
}

/**
 * Measures the first row of the header from `getBoundingClientRect`, not from class names, so it
 * stays true whatever way the layout is written. Run it on a desktop width (768 or more), where the
 * search form is in the header and not in the menu.
 */
export function measureHeader(page: Page): Promise<HeaderMeasure> {
  return page.evaluate(() => {
    const header = document.querySelector('header')!
    const headerTop = header.getBoundingClientRect().top
    const visible = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    const form = [...header.querySelectorAll('form[role="search"]')].find(visible)!
    const nav = [...header.querySelectorAll('nav[aria-label="ניווט ראשי"]')].find(visible)!
    const row = (element: Element) => element.getBoundingClientRect().top < headerTop + 64

    const parts = [form, nav, ...header.querySelectorAll('a, button')].filter(
      (element, index, all) =>
        all.indexOf(element) === index &&
        visible(element) &&
        row(element) &&
        // A link of the navigation or a button of the form is part of that box, not a box of its own.
        (element === form ||
          element === nav ||
          (!form.contains(element) && !nav.contains(element))),
    )
    const boxes = parts.map((element) => {
      const box = element.getBoundingClientRect()
      const name =
        element.getAttribute('aria-label') ??
        (element.textContent ?? '').trim().slice(0, 20) ??
        element.tagName
      return {
        element,
        name: name || element.tagName.toLowerCase(),
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        centerY: box.top + box.height / 2,
      }
    })

    const formBox = form.getBoundingClientRect()
    const navBox = nav.getBoundingClientRect()
    const after = boxes.filter((box) => box.element !== form && box.right <= formBox.left + 0.5)
    const overlaps: string[] = []
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const first = boxes[a]!
        const second = boxes[b]!
        if (
          first.left < second.right - 0.5 &&
          second.left < first.right - 0.5 &&
          first.top < second.bottom - 0.5 &&
          second.top < first.bottom - 0.5
        ) {
          overlaps.push(`${first.name} / ${second.name}`)
        }
      }
    }

    return {
      viewport: window.innerWidth,
      form: { left: formBox.left, right: formBox.right, width: formBox.width },
      gapToIcons:
        after.length > 0 ? formBox.left - Math.max(...after.map((box) => box.right)) : null,
      gapToNav: navBox.left - formBox.right,
      offAxis: Math.max(...boxes.map((box) => Math.abs(box.centerY - (headerTop + 32)))),
      overlaps,
      outside: boxes
        .filter((box) => box.left < -0.5 || box.right > window.innerWidth + 0.5)
        .map((box) => box.name),
      scrollsSideways: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
}
