// The capsule shows one line, so only the end of the interim text fits. The
// newest words are the ones worth seeing: they confirm the provider is hearing
// what is being said right now.
export const INTERIM_TAIL_CHARS = 34

export function interimTail(text: string, max = INTERIM_TAIL_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(flat.length - max)
  const space = cut.indexOf(' ')
  // Start on a word boundary when there is one, so the line never opens on
  // half a word.
  const tail = space >= 0 && space < cut.length - 1 ? cut.slice(space + 1) : cut
  return `…${tail}`
}
