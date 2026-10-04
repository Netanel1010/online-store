import { useLocation, useNavigate } from 'react-router'

/** Exposes the current URL and browser back/forward to tests, outside of the app's own UI. */
export function RouterProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <div hidden>
      <output data-testid="url">{`${location.pathname}${location.search}`}</output>
      <button type="button" onClick={() => navigate(-1)}>
        test-back
      </button>
      <button type="button" onClick={() => navigate(1)}>
        test-forward
      </button>
    </div>
  )
}
