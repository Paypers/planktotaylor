import { beforeEach, describe, expect, it, vi } from 'vitest'
import css from '../styles.css?raw'
import { contrast, CONTRAST_CHECKS, DARK, hexToHsv, hsvToHex, LIGHT, normalizeHex, schemeFor, TOKENS, type Palette } from './palette'
import { hashFor, parseRoute } from './route'

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

describe("the colour picker's colours", () => {
  it('reads a colour as hue, how much colour and how bright', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 })
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 })
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 })
    expect(hexToHsv('#808080').s).toBe(0)
  })

  it('writes them back as the same hex, for every colour in both palettes', () => {
    for (const hex of [...Object.values(LIGHT), ...Object.values(DARK), '#ff00ff', '#00ffff', '#123456', '#fedcba']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })

  it('keeps to the edges of the box', () => {
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#ffffff')
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe('#000000')
    expect(hsvToHex({ h: 359.9, s: 1, v: 1 })).toBe('#ff0000')
  })
})

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

  it("keep each device's choice to itself, and only a change to the themes counts as one for the account", async () => {
    const theme = await visit()
    const saved: unknown[] = []
    theme.onThemeSaved((themes) => saved.push(themes))
    theme.selectTheme('dark')
    expect(saved).toEqual([])
    expect(theme.accountThemes()).toEqual({ v: 1, themes: [] })
    const id = theme.createTheme()
    expect(saved).toHaveLength(1)
    expect(saved[0]).not.toHaveProperty('selected')
    expect(theme.accountThemes()).toMatchObject({ themes: [{ id }], updatedAt: expect.any(String) })
  })

  it("take the account's themes but keep showing this device's choice, unless it was deleted", async () => {
    const theme = await visit()
    const mine = theme.createTheme()
    const theirs = { id: 'theirs', name: 'Theirs', colors: DARK }
    theme.selectTheme('dark')
    theme.applyAccountThemes({ v: 1, selected: 'theirs', themes: [theirs], updatedAt: '2026-09-24T00:00:00.000Z' })
    expect(theme.getTheme()).toMatchObject({ selected: 'dark', themes: [{ id: 'theirs' }], updatedAt: '2026-09-24T00:00:00.000Z' })

    theme.applyAccountThemes({ v: 1, themes: [theirs, { ...theirs, id: mine, name: 'Mine' }] })
    theme.selectTheme(mine)
    theme.applyAccountThemes({ v: 1, themes: [theirs] })
    expect(theme.getTheme().selected).toBe('system')
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

  it('reads Your Plank Year from the address', () => {
    expect(parseRoute('#year')).toEqual({ page: 'year' })
    expect(parseRoute('#Year/')).toEqual({ page: 'year' })
    expect(parseRoute('#year/2026')).toEqual({ page: 'home' })
  })

  it('reads the help page from the address', () => {
    expect(parseRoute('#help')).toEqual({ page: 'help' })
    expect(parseRoute('#Help/')).toEqual({ page: 'help' })
  })

  it('reads Collect the eras and its album pages from the address', () => {
    expect(parseRoute('#eras')).toEqual({ page: 'eras', album: null })
    expect(parseRoute('#eras/red')).toEqual({ page: 'eras', album: 'red' })
    expect(parseRoute('#Eras/1989/')).toEqual({ page: 'eras', album: '1989' })
    // A release is on the page of the album it joined.
    expect(parseRoute('#eras/encore')).toEqual({ page: 'eras', album: 'showgirl' })
    expect(parseRoute('#eras/nope')).toEqual({ page: 'eras', album: null })
    expect(hashFor({ page: 'eras', album: 'red' })).toBe('#eras/red')
    expect(hashFor({ page: 'eras', album: null })).toBe('#eras')
  })

  it('reads groups and invite links from the address', () => {
    expect(parseRoute('#groups')).toEqual({ page: 'groups' })
    expect(parseRoute('#join/0123456789ABCDEF0123')).toEqual({ page: 'join', code: '0123456789abcdef0123' })
    expect(hashFor({ page: 'join', code: '0123456789abcdef0123' })).toBe('#join/0123456789abcdef0123')
    expect(parseRoute('#join/')).toEqual({ page: 'home' })
    expect(parseRoute('#join/a/b')).toEqual({ page: 'home' })
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
    expect(parseRoute(`#group/${id.toUpperCase()}`)).toEqual({ page: 'group', id })
    expect(hashFor({ page: 'group', id })).toBe(`#group/${id}`)
    expect(parseRoute('#group/nope')).toEqual({ page: 'groups' })
    expect(parseRoute('#group')).toEqual({ page: 'groups' })
  })

  it('takes #discord to Settings → Discord', () => {
    expect(parseRoute('#discord')).toEqual({ page: 'settings', section: 'discord' })
    expect(parseRoute('#Discord/')).toEqual({ page: 'settings', section: 'discord' })
    expect(parseRoute('#discord/x')).toEqual({ page: 'home' })
  })

  it('leaves sign-in links alone', () => {
    expect(parseRoute('#access_token=abc&type=magiclink')).toEqual({ page: 'home' })
  })
})
