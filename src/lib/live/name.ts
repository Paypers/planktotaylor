// The name someone shows in a room. Signed out, the one they typed is remembered in this browser for next time.

const STORAGE_KEY = 'plank-to-taylor:live-name'

/** The longest a name is shown, in characters. */
export const NAME_LENGTH = 24

// Line breaks, tabs and text-direction overrides from someone else's device would break the lines around them.
const CONTROLS = /[\p{Cc}\u202a-\u202e\u2066-\u2069]+/gu

/** A name as typed on someone's device, made safe to show: on one line, trimmed, and cut to NAME_LENGTH. */
export function cleanName(name: string): string {
  const chars = Array.from(name.replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim())
  return chars.length > NAME_LENGTH ? `${chars.slice(0, NAME_LENGTH - 1).join('').trimEnd()}…` : chars.join('')
}

/** The name typed last time, or ''. */
export function rememberedName(): string {
  try {
    return cleanName(localStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return ''
  }
}

export function rememberName(name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, cleanName(name))
  } catch {
    // Private mode or full storage: they'll type it again next time.
  }
}
