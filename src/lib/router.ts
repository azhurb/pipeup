import { useState, useEffect, useCallback } from 'react'

export type SettingsPane = 'general' | 'dictation' | 'ai' | 'privacy' | 'about'
export type Route = 'home' | 'settings' | 'history' | 'dictionary' | `settings/${SettingsPane}`

export function parseHash(hash = window.location.hash): Route {
  const path = hash.replace(/^#\/?/, '')
  if (path === 'settings' || path === 'history' || path === 'dictionary') return path
  if (/^settings\/(general|dictation|ai|privacy|about)$/.test(path)) return path as Route
  return 'home'
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parseHash)
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  const navigate = useCallback((r: Route) => {
    window.location.hash = r === 'home' ? '#/' : `#/${r}`
  }, [])
  return { route, navigate }
}
