# SEO and page metadata

The site is a Vite + React single-page app on GitHub Pages, so search engines and link previews
need help: Pages answers any address that has no file with `404.html` and a 404 status, and most
crawlers and previews read the HTML without running the app.

## What the build writes

`npm run build` runs `scripts/static-routes.mjs` after Vite. It copies the app's HTML once per
page worth indexing and writes that page's tags into the copy:

| File                             | Page                            |
| -------------------------------- | ------------------------------- |
| `dist/index.html`                | home                            |
| `dist/products/index.html`       | all products                    |
| `dist/category/<id>/index.html`  | each category that has products |
| `dist/products/<sku>/index.html` | each product                    |
| `dist/404.html`                  | every other path: `noindex`     |
| `dist/sitemap.xml`               | the pages above                 |

Pages serves these as real files (status 200; an address without the closing slash is redirected
to the one with it), so they can be indexed. The app is the same on every copy and takes over as
usual. The files are generated from `public/data/products.json`; nothing is committed.

The tags come from `src/lib/seo.ts`. The same code feeds `PageMeta`, which keeps the title,
description, canonical address, social tags and structured data up to date while a visitor
navigates, updating the tags that are already in the HTML instead of adding second copies.

## Decisions

- **Not indexed:** search results, the cart, favorites, sign-in, registration, checkout and error
  pages get `noindex, follow` and no canonical address. Results of a search depend on what was
  typed and would be thin, duplicated content.
- **Structured data:** product pages carry schema.org `Product` (name, SKU, brand, images and the
  current price in ILS) and `BreadcrumbList`, generated only from the catalog. The data has no
  availability, rating or review, so none is claimed. Prices are the catalog's current price.
- **Social previews:** product pages use the product's card image. The other pages have no image,
  because the only banner images are AVIF, which several link previews do not display.
- **`robots.txt`:** not added. Crawlers read it only at the root of a host
  (`netanel1010.github.io/robots.txt`), which belongs to the GitHub account, so a file under
  `/online-store/` would be ignored. The sitemap is at `/online-store/sitemap.xml`; submit it in
  Search Console.
- **Site address:** `SITE_URL` in `src/lib/seo.ts`. Change it if the site moves to another address.
- The site is a portfolio demo, and the descriptions of the home and private pages say so.
