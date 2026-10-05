import { useEffect } from 'react'
import { assetPageUrl, pageUrl, type PageMetaData } from '@/lib/seo'

type TagKind = 'name' | 'property'

/** Sets a <meta> tag (or removes it for `null`) and returns a function that puts the old state back. */
function setMeta(kind: TagKind, key: string, content: string | null) {
  const selector = `meta[${kind}="${key}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const previous = existing?.getAttribute('content') ?? null

  const write = (value: string | null) => {
    let element = document.head.querySelector<HTMLMetaElement>(selector)
    if (value === null) {
      element?.remove()
      return
    }
    if (!element) {
      element = document.createElement('meta')
      element.setAttribute(kind, key)
      document.head.append(element)
    }
    element.setAttribute('content', value)
  }

  write(content)
  return () => write(previous)
}

function setCanonical(href: string | null) {
  const selector = 'link[rel="canonical"]'
  const previous =
    document.head.querySelector<HTMLLinkElement>(selector)?.getAttribute('href') ?? null

  const write = (value: string | null) => {
    let element = document.head.querySelector<HTMLLinkElement>(selector)
    if (value === null) {
      element?.remove()
      return
    }
    if (!element) {
      element = document.createElement('link')
      element.setAttribute('rel', 'canonical')
      document.head.append(element)
    }
    element.setAttribute('href', value)
  }

  write(href)
  return () => write(previous)
}

const JSON_LD = 'script[type="application/ld+json"]'

/** Replaces the page's structured data. Returns a function that removes what it added. */
function setJsonLd(items: readonly object[]) {
  document.head.querySelectorAll(JSON_LD).forEach((element) => element.remove())
  const added = items.map((item) => {
    const element = document.createElement('script')
    element.type = 'application/ld+json'
    element.textContent = JSON.stringify(item)
    document.head.append(element)
    return element
  })
  return () => added.forEach((element) => element.remove())
}

/**
 * The title and the head tags of a page. The HTML of the page already contains them (written at
 * build time), so they are updated in place instead of being added a second time, which would
 * leave two titles or two descriptions in the head. Everything except the title is restored when
 * the page goes away, so a page can never inherit the tags or the structured data of the one
 * before it.
 */
export function PageMeta({ meta }: { meta: PageMetaData }) {
  const { title, description, path, image } = meta
  // A string, so the tags are only rewritten when the structured data actually changes.
  const jsonLd = JSON.stringify(meta.jsonLd ?? [])

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    const indexable = path !== undefined
    const url = indexable ? pageUrl(path) : null
    const restore = [
      setMeta('name', 'description', description),
      setMeta('name', 'robots', indexable ? null : 'noindex, follow'),
      setCanonical(url),
      setMeta('property', 'og:url', url),
      setMeta('property', 'og:title', title),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:image', image ? assetPageUrl(image) : null),
      setJsonLd(JSON.parse(jsonLd) as object[]),
    ]
    return () => restore.reverse().forEach((undo) => undo())
  }, [title, description, path, image, jsonLd])

  return null
}
