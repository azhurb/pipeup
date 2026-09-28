import { describe, it, expect } from 'vitest'
import { interimTail } from '../interimTail'

describe('interimTail', () => {
  it('keeps short text as it is', () => {
    expect(interimTail('Hi team')).toBe('Hi team')
  })

  it('shows the newest words of long text, starting on a word boundary', () => {
    const text = 'Hi team, I pushed the release notes to the shared folder.'
    const tail = interimTail(text, 20)
    expect(tail).toBe('…the shared folder.')
    expect(text.endsWith(tail.slice(1))).toBe(true)
  })

  it('never leaves a space after the ellipsis when the cut lands on one', () => {
    // 'abc def' cut to 4 characters is ' def': the boundary is the first character.
    expect(interimTail('abc def', 4)).toBe('…def')
  })

  it('flattens line breaks from formatted lists onto one line', () => {
    expect(interimTail('Tuesday:\n- Review\n- Send')).toBe('Tuesday: - Review - Send')
  })

  it('returns an empty string for blank text', () => {
    expect(interimTail('  ')).toBe('')
  })
})
