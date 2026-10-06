import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** What to show instead of the children after an error. `reset` shows the children again. */
  fallback: (props: { error: Error; reset: () => void }) => ReactNode
  /** When this changes (for example the page), a shown error is cleared and the children try again. */
  resetKey?: unknown
  /** For reporting. The error is also written to the console. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches an error thrown while rendering what is inside it, so one broken page shows a message
 * instead of a blank screen. It does not catch errors in event handlers or in promises that no one
 * awaits: those are not render errors, and the code that makes them handles them. React only
 * supports this as a class.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The page failed to render:', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.reset()
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    return error ? this.props.fallback({ error, reset: this.reset }) : this.props.children
  }
}
