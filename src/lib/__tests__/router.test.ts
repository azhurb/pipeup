import { describe, it, expect } from 'vitest'
import { parseHash } from '../router'

describe('navigation routes', () => {
  it.each([
    'settings/general',
    'settings/dictation',
    'settings/ai',
    'settings/privacy',
    'settings/about',
    'dictionary',
    'history',
    'settings',
  ] as const)('preserves %s deep links', (route) => {
    expect(parseHash(`#/${route}`)).toBe(route)
  })
  it('falls back safely for unknown pages', () => {
    expect(parseHash('#/settings/unknown')).toBe('home')
  })
})
