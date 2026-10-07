import { useEffect, useRef, type RefObject } from 'react'
import { useNavigationType } from 'react-router'

/** A control the visitor types in. */
function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    (target instanceof HTMLInputElement &&
      ![
        'button',
        'checkbox',
        'radio',
        'submit',
        'reset',
        'image',
        'file',
        'range',
        'color',
      ].includes(target.type))
  )
}

/**
 * When a new page is on screen, scrolls to its top and puts the keyboard focus at the start of its
 * content, because the router does neither: a keyboard or screen-reader user would otherwise be left
 * in the middle of the previous page. Skipped on the first load.
 *
 * A page can land a moment after it was asked for (a page that loads on demand, a slow device). If
 * the visitor has meanwhile gone into a text field and typed, taking the focus away would cut off
 * what they are typing: the next search typed right after submitting one, for example, would lose
 * its Enter. So the focus stays in a field the visitor entered or typed in after they asked for the
 * page (a click on a link or a button, a submitted form, an Enter: choosing a search suggestion with
 * the keyboard is only that). The browser's back and forward buttons are asking too, but the router
 * renders for them inside the event itself, before any listener of ours could note it: it says so
 * itself (a "POP" navigation), and then the focus always goes to the content.
 */
export function useFocusAtPageStart(main: RefObject<HTMLElement | null>, pathname: string) {
  const isFirstRender = useRef(true)
  // A running count rather than times, so that two events in the same millisecond keep their order.
  const events = useRef({ tick: 0, asked: 0, typed: 0 })
  const navigationType = useNavigationType()
  const lastType = useRef(navigationType)
  // Before the effect below in every commit, which reads it: not a dependency of that one, as the
  // focus moves when the page changes, not when only the way it was reached does.
  useEffect(() => {
    lastType.current = navigationType
  })

  useEffect(() => {
    const state = events.current
    // Clicking into a field is not asking for a page.
    const ask = (event: Event) => {
      if (!isTextEntry(event.target)) state.asked = ++state.tick
    }
    const enter = (event: KeyboardEvent) => {
      // Not the Enter that ends the composition of a character.
      if (event.key === 'Enter' && !event.isComposing) state.asked = ++state.tick
    }
    const type = (event: Event) => {
      if (isTextEntry(event.target)) state.typed = ++state.tick
    }
    document.addEventListener('click', ask, true)
    document.addEventListener('submit', ask, true)
    document.addEventListener('keydown', enter, true)
    document.addEventListener('input', type, true)
    document.addEventListener('focusin', type, true)
    return () => {
      document.removeEventListener('click', ask, true)
      document.removeEventListener('submit', ask, true)
      document.removeEventListener('keydown', enter, true)
      document.removeEventListener('input', type, true)
      document.removeEventListener('focusin', type, true)
    }
  }, [])

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    const { asked, typed } = events.current
    const stillTyping =
      lastType.current !== 'POP' && typed > asked && isTextEntry(document.activeElement)
    if (!stillTyping) main.current?.focus({ preventScroll: true })
  }, [main, pathname])
}
