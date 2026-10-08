/* ---------------------------------------------------------------------------------------------
 * The information pages of the store (about, contact, accessibility, privacy, terms): where they
 * are, what they are called and how they are described to search engines.
 *
 * One definition feeds the router paths, the footer, the page metadata and the static HTML that
 * `scripts/static-routes.mjs` writes for every indexable page, so they cannot drift apart. This file
 * is imported by Node directly (type stripping), so it only uses erasable TypeScript.
 * ------------------------------------------------------------------------------------------- */

export const INFO_PAGES = {
  about: {
    /** Path below the site root, without slashes at the ends. */
    path: 'about',
    /** The name in links and in the page's heading. */
    label: 'אודות',
    description:
      'N.M.S היא חנות הדגמה לרכיבי מחשב, פרויקט תוכנה עם צד שרת אמיתי. מה אפשר לעשות באתר, איך הוא בנוי ומה אין בו.',
  },
  contact: {
    path: 'contact',
    label: 'צור קשר',
    description:
      'N.M.S היא אתר הדגמה ואינה עסק פעיל. לשאלות על הפרויקט אפשר לפנות דרך הפרופיל והמאגר ב-GitHub.',
  },
  accessibility: {
    path: 'accessibility',
    label: 'הצהרת נגישות',
    description: 'הצהרת הנגישות של אתר ההדגמה N.M.S: מה נעשה, איך נבדק, ומה עדיין לא נבדק.',
  },
  privacy: {
    path: 'privacy',
    label: 'מדיניות פרטיות',
    description:
      'איזה מידע אתר ההדגמה N.M.S שומר: פרטי חשבון, עגלה, הזמנות הדגמה, אחסון בדפדפן ויומני שרת.',
  },
  terms: {
    path: 'terms',
    label: 'תנאי שימוש',
    description:
      'תנאי השימוש והודעת ההדגמה של N.M.S, כולל משלוחים וביטולים, שאינם רלוונטיים באתר הדגמה.',
  },
} as const

export type InfoPageId = keyof typeof INFO_PAGES

/** In the order the footer lists them. */
export const INFO_PAGE_IDS = [
  'about',
  'contact',
  'accessibility',
  'privacy',
  'terms',
] as const satisfies readonly InfoPageId[]
