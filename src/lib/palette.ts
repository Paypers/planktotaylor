// The colours a theme can set. Each token is a CSS variable in styles.css (`paper` is `--paper`),
// and the built-in Light and Dark palettes below must match the ones there (a test checks).

export const TOKENS = [
  'paper',
  'well',
  'rule',
  'heading',
  'ink',
  'ink-2',
  'faint',
  'button',
  'button-ink',
  'signal',
  'held',
  'paused',
  'paused-ink',
] as const

export type Token = (typeof TOKENS)[number]
export type Palette = Record<Token, string>
export type Scheme = 'light' | 'dark'

export const LIGHT: Palette = {
  paper: '#f4f0e8',
  well: '#ebe5da',
  rule: '#d8cfc1',
  heading: '#1c1813',
  ink: '#1c1813',
  'ink-2': '#5f564b',
  faint: '#b3a99a',
  button: '#1c1813',
  'button-ink': '#f4f0e8',
  signal: '#c23b22',
  held: '#3a8f5c',
  paused: '#e8862a',
  'paused-ink': '#a3500d',
}

export const DARK: Palette = {
  paper: '#15120e',
  well: '#221d18',
  rule: '#3a322a',
  heading: '#f1eadf',
  ink: '#f1eadf',
  'ink-2': '#a99f92',
  faint: '#5e564c',
  button: '#f1eadf',
  'button-ink': '#15120e',
  signal: '#e4603f',
  held: '#62b784',
  paused: '#f0a060',
  'paused-ink': '#f0a060',
}

export const BUILT_IN: Record<Scheme, Palette> = { light: LIGHT, dark: DARK }

export interface ColorOption {
  token: Token
  label: string
  hint: string
}

/** The theme editor's colours, grouped by the part of the site they paint. */
export const COLOR_GROUPS: { title: string; colors: ColorOption[] }[] = [
  {
    title: 'Page',
    colors: [
      { token: 'paper', label: 'Background', hint: 'Behind everything, the plank screen too' },
      { token: 'well', label: 'Highlight', hint: 'Hovered rows, your next level, text boxes' },
      { token: 'rule', label: 'Lines', hint: 'Dividers, borders and empty progress bars' },
    ],
  },
  {
    title: 'Text',
    colors: [
      { token: 'heading', label: 'Headings', hint: 'The headline, song titles, the timer and streak' },
      { token: 'ink', label: 'Text', hint: 'Body text and the heavy rules between sections' },
      { token: 'ink-2', label: 'Secondary text', hint: 'Album names, dates and notes' },
      { token: 'faint', label: 'Faint', hint: "Calendar days you can't open, levels moved past" },
    ],
  },
  {
    title: 'Buttons and accent',
    colors: [
      { token: 'button', label: 'Main buttons', hint: 'Start plank, Save and other main actions' },
      { token: 'button-ink', label: 'Main button text', hint: 'The words on main buttons' },
      { token: 'signal', label: 'Accent', hint: 'The star, a lit streak flame, your next level' },
    ],
  },
  {
    title: 'Planks',
    colors: [
      { token: 'held', label: 'Held', hint: 'The plank bar, no-break ticks and the rank bar' },
      { token: 'paused', label: 'Breaks', hint: 'Breaks on the plank bar and in the setlist' },
      { token: 'paused-ink', label: 'Break text', hint: 'Break times and counts written out' },
    ],
  },
]

export const COLOR_LABELS = Object.fromEntries(
  COLOR_GROUPS.flatMap((group) => group.colors.map((c) => [c.token, c.label])),
) as Record<Token, string>

/** Pairs worth warning about when they get hard to read: WCAG AA, 3:1 for large text and marks. */
export const CONTRAST_CHECKS: { fg: Token; bg: Token; min: number }[] = [
  { fg: 'ink', bg: 'paper', min: 4.5 },
  { fg: 'heading', bg: 'paper', min: 3 },
  { fg: 'ink-2', bg: 'paper', min: 4.5 },
  { fg: 'button-ink', bg: 'button', min: 4.5 },
  { fg: 'signal', bg: 'paper', min: 3 },
  { fg: 'paused-ink', bg: 'paper', min: 4.5 },
]

const HEX6 = /^#?([0-9a-f]{6})$/i
const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i

/** `#abc`, `abc123` or `#ABC123` as `#aabbcc` / `#abc123`; null if it isn't a colour. */
export function normalizeHex(input: string, { short = true } = {}): string | null {
  const text = input.trim()
  const long = HEX6.exec(text)
  if (long) return `#${long[1].toLowerCase()}`
  const brief = short ? HEX3.exec(text) : null
  if (brief) return `#${brief.slice(1).map((c) => c + c).join('')}`.toLowerCase()
  return null
}

function channel(value: number): number {
  const s = value / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** A dark background makes a dark theme: form controls, scrollbars and the video backdrop follow it. */
export function schemeFor(colors: Palette): Scheme {
  // 0.18 is where black and white text contrast equally.
  return luminance(colors.paper) < 0.18 ? 'dark' : 'light'
}

/** Every token as a valid colour, falling back to the built-in palette for anything missing or broken. */
export function completePalette(colors: Partial<Record<string, unknown>>, fallback: Palette): Palette {
  const out = { ...fallback }
  for (const token of TOKENS) {
    const value = colors[token]
    const hex = typeof value === 'string' ? normalizeHex(value) : null
    if (hex) out[token] = hex
  }
  return out
}
