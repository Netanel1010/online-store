# Accessibility

What is checked automatically, what was checked by hand, what was **not** checked, and how to repeat
the manual pass. Passing any of this does not make the site WCAG-conformant: that needs an audit with
assistive technology and real users.

## Automated

| Check                                                                                                                                                                                                                        | Where                                                                | When                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| axe-core (WCAG 2.0 to 2.2 A and AA, best practice) on the main pages and states                                                                                                                                              | `e2e/accessibility.spec.ts`, `e2e/support/a11y.ts`                   | every pull request (`e2e`)             |
| Page language and direction, labels, error associations, keyboard order, focus management, the mobile menu as a modal dialog                                                                                                 | `e2e/accessibility.spec.ts`, `e2e/navigation.spec.ts`                | every pull request (`e2e`)             |
| The "My account" menu of the header: Enter opens it, Tab walks the items, Escape closes it and returns the focus, tabbing out or clicking elsewhere closes it, it opens inside the screen from 320 px, axe on the open panel | `e2e/account-menu.spec.ts`, `src/features/auth/AccountMenu.test.tsx` | every pull request (`e2e`, unit tests) |
| Lighthouse accessibility score of the home page, the listing and a product page (must stay at 0.95 or more)                                                                                                                  | `lighthouserc.json`, `.github/workflows/lighthouse.yml`              | every pull request and push to `main`  |

At the time of M12 Lighthouse scored accessibility, best practices and SEO at 100 on all three pages.

**The statement that visitors read** is the page `/accessibility` (`src/pages/AccessibilityPage.tsx`). It says what is written here, in Hebrew, and claims no conformance. When this document changes, change that page too.

## Manual keyboard pass (M12)

Done once, on the production build served like GitHub Pages, in Chromium, with real key presses.

| Area                                                                                              | What was checked                                                                                                                                                                                                                     | Result |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| First tab stops of the home page                                                                  | skip link first (visible on focus), then logo, navigation, search; every stop has a visible focus ring                                                                                                                               | ok     |
| Structure of the home page, the listing, a product, the cart, favorites, sign-in and registration | every link, button, field and select has an accessible name; no positive `tabindex`; one `h1`; `header`, `nav`, `main` and `footer` landmarks; `lang="he"` and `dir="rtl"`; no clickable element that is not a link or a button      | ok     |
| Search suggestions                                                                                | typing lists up to five products; the arrow keys move a highlight with focus staying in the box (`aria-activedescendant`); Escape closes the list and keeps the text; Enter opens the product; focus lands on `main` of the new page | ok     |
| Mobile menu (375 px)                                                                              | Enter opens it as a modal dialog with focus inside; Tab and Shift+Tab stay inside; Escape or its close button closes it, returns focus to the button and sets `aria-expanded` back to `false` (repeated in Playwright's Chromium)    | ok     |

**No defect was found**, so no code was changed. Things worth knowing that are by design:

- The search box is a `searchbox` with `aria-autocomplete`, `aria-controls` and `aria-activedescendant`
  rather than an ARIA 1.2 `combobox`. A `role="status"` line announces the number of suggestions and
  how to use them.
- The checkboxes of the filters are 16 px; their rows are what is clickable, and axe's target-size
  rule passes.
- `main` takes focus after a navigation and shows no ring, on purpose.

## Not checked

- **No screen reader** (NVDA, JAWS, VoiceOver, TalkBack), in Hebrew or any other language. This is the
  biggest gap: the announcements above are written to work, but nobody has listened to them.
- No browser zoom to 200% or 400%, no text-spacing override, no forced-colors or high-contrast mode.
- No touch-screen or voice-control pass.
- The signed-in pages (checkout, orders, account menu) were not part of the manual walkthrough; they
  are covered by the automated checks only.
- No keyboard pass in Firefox or Safari.

## Repeat the manual pass

Before a release that changes the header, the forms or the dialogs, or once a quarter:

1. Build and serve the site as the browser tests do (`npm run build`, then
   `node e2e/support/api-server.mjs` and `node e2e/support/pages-server.mjs`, with `VITE_API_URL` set
   to the stub API's address when building).
2. With the mouse unplugged (or not touched), go through: skip link; search with the arrow keys; a
   listing with a filter and the sort; a product page and "add to cart"; the cart; registration with an
   error, then success; checkout with an error; the mobile menu at 375 px.
3. For each page check: the order of focus follows the visual order, the ring is always visible, the
   focus is never lost or trapped (apart from in a modal dialog), and every message that appears is
   announced (it sits in a live region) or has focus.
4. Do the same with a screen reader. Record the reader, the browser and what was heard.
5. Write what you found in the table above, with the date.
