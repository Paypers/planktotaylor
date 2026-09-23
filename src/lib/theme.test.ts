import { beforeEach, describe, expect, it, vi } from 'vitest'
import css from '../styles.css?raw'
import { contrast, CONTRAST_CHECKS, DARK, LIGHT, normalizeHex, schemeFor, TOKENS, type Palette } from './palette'
import { parseRoute } from './route'

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

// A fresh copy of the module over the same storage: a new visit to the site.
const visit = async () => {
  vi.resetModules()
  return import('./theme')
}

/** The colour variables in one block of styles.css. */
function cssBlock(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]))
}

describe('palettes', () => {
  it('match the Light and Dark colours in styles.css', () => {
    const light = cssBlock(':root')
    const dark = cssBlock(":root[data-theme='dark']")
    for (const token of TOKENS) {
      expect(light[token], `--${token} (light)`).toBe(LIGHT[token])
      expect(dark[token], `--${token} (dark)`).toBe(DARK[token])
    }
  })

  it('pass their own readability checks', () => {
    for (const palette of [LIGHT, DARK]) {
      for (const { fg, bg, min } of CONTRAST_CHECKS) expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min)
    }
  })

  it('know light from dark by the background', () => {
    expect(schemeFor(LIGHT)).toBe('light')
    expect(schemeFor(DARK)).toBe('dark')
    expect(schemeFor({ ...LIGHT, paper: '#0b1a33' })).toBe('dark')
  })

  it('measures contrast the WCAG way', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrast('#777777', '#777777')).toBe(1)
  })

  it('reads hex codes however they are typed', () => {
    expect(normalizeHex('#ABC123')).toBe('#abc123')
    expect(normalizeHex(' abc123 ')).toBe('#abc123')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
    expect(normalizeHex('#abc', { short: false })).toBeNull()
    expect(normalizeHex('#abcd12x')).toBeNull()
    expect(normalizeHex('red')).toBeNull()
  })
})

describe('themes', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('follow the system until one is chosen', async () => {
    const theme = await visit()
    expect(theme.getTheme().selected).toBe('system')
    theme.selectTheme('dark')
    expect((await visit()).getTheme().selected).toBe('dark')
  })

  it('start a new theme from the colours showing, then save edits only when asked', async () => {
    const theme = await visit()
    theme.selectTheme('dark')
    const id = theme.createTheme()
    expect(theme.getTheme().selected).toBe(id)
    expect(theme.currentPalette()).toEqual(DARK)

    theme.editTheme({ name: 'Midnight', colors: { signal: '#3366ff' } })
    expect(theme.hasUnsavedChanges()).toBe(true)
    expect(theme.currentPalette().signal).toBe('#3366ff')
    // Not saved yet: a new visit has the theme as it was made.
    expect((await visit()).getTheme().themes[0]).toMatchObject({ name: 'My theme', colors: DARK })

    theme.saveTheme()
    expect(theme.hasUnsavedChanges()).toBe(false)
    const saved = (await visit()).getTheme()
    expect(saved.selected).toBe(id)
    expect(saved.themes[0]).toMatchObject({ id, name: 'Midnight', scheme: 'dark', colors: { ...DARK, signal: '#3366ff' } })
  })

  it('drop edits on discard', async () => {
    const theme = await visit()
    theme.createTheme()
    theme.editTheme({ colors: { paper: '#000000' } })
    expect(theme.activeCustom()?.scheme).toBe('dark')
    theme.discardChanges()
    expect(theme.hasUnsavedChanges()).toBe(false)
    expect(theme.currentPalette()).toEqual(LIGHT)
  })

  it('counts editing back to how it was as nothing to save', async () => {
    const theme = await visit()
    theme.createTheme()
    theme.editTheme({ colors: { held: '#00ff00' } })
    theme.editTheme({ colors: { held: LIGHT.held } })
    expect(theme.hasUnsavedChanges()).toBe(false)
  })

  it('give copies and new themes their own names', async () => {
    const theme = await visit()
    const first = theme.createTheme()
    theme.createTheme()
    theme.duplicateTheme(first)
    expect(theme.getTheme().themes.map((t) => t.name)).toEqual(['My theme', 'My theme 2', 'My theme copy'])
  })

  it('go back to System when the one showing is deleted', async () => {
    const theme = await visit()
    const id = theme.createTheme()
    theme.deleteTheme(id)
    expect(theme.getTheme()).toMatchObject({ selected: 'system', themes: [] })
  })

  it('survive broken or older saves', async () => {
    const { parseSaved } = await visit()
    expect(parseSaved('not json')).toEqual({ v: 1, selected: 'system', themes: [] })
    const partial: Partial<Palette> = { paper: '#101010', ink: 'nonsense' }
    const saved = parseSaved(
      JSON.stringify({
        selected: 'gone',
        themes: [{ id: 'a', name: 'Old', colors: partial }, { id: 'b' }, null],
      }),
    )
    // Unknown selection falls back; missing and broken colours come from the matching built-in.
    expect(saved.selected).toBe('system')
    expect(saved.themes).toHaveLength(1)
    expect(saved.themes[0].colors).toEqual({ ...DARK, paper: '#101010' })
    expect(saved.themes[0].scheme).toBe('dark')
  })
})

describe('routes', () => {
  it('reads settings pages from the address', () => {
    expect(parseRoute('')).toEqual({ page: 'home' })
    expect(parseRoute('#settings')).toEqual({ page: 'settings', section: null })
    expect(parseRoute('#settings/appearance')).toEqual({ page: 'settings', section: 'appearance' })
    expect(parseRoute('#settings/Appearance/')).toEqual({ page: 'settings', section: 'appearance' })
  })

  it('reads the ranks page from the address', () => {
    expect(parseRoute('#ranks')).toEqual({ page: 'ranks' })
    expect(parseRoute('#Ranks/')).toEqual({ page: 'ranks' })
    expect(parseRoute('#ranks/sonnet')).toEqual({ page: 'home' })
  })

  it('leaves sign-in links alone', () => {
    expect(parseRoute('#access_token=abc&type=magiclink')).toEqual({ page: 'home' })
  })
})
