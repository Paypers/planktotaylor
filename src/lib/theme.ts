import { useSyncExternalStore } from 'react'
import { BUILT_IN, completePalette, LIGHT, schemeFor, TOKENS, type Palette, type Scheme } from './palette'

// The theme lives in this browser, apart from progress. index.html reads the same key before
// the first paint (so the page never flashes the wrong colours): keep its format in step.
const STORAGE_KEY = 'plank-to-taylor:theme:v1'

export type BuiltInTheme = 'system' | 'light' | 'dark'

export interface CustomTheme {
  id: string
  name: string
  colors: Palette
  /** Derived from the background. Saved so index.html can set it without doing the maths. */
  scheme: Scheme
}

interface Saved {
  v: 1
  /** A built-in theme, or a custom theme's id. */
  selected: string
  themes: CustomTheme[]
}

export interface ThemeState extends Saved {
  /** Unsaved edits to the selected custom theme. Shown live, never stored. */
  draft: CustomTheme | null
}

export const BUILT_IN_THEMES: { id: BuiltInTheme; name: string }[] = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
]

const isBuiltIn = (id: string): id is BuiltInTheme => id === 'system' || id === 'light' || id === 'dark'

/** Reads saved themes, dropping anything malformed and filling in colours added since they were saved. */
export function parseSaved(raw: string | null): Saved {
  const empty: Saved = { v: 1, selected: 'system', themes: [] }
  if (!raw) return empty
  try {
    const parsed = JSON.parse(raw) as Partial<Saved>
    const themes: CustomTheme[] = []
    for (const t of Array.isArray(parsed.themes) ? parsed.themes : []) {
      if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || typeof t.colors !== 'object' || !t.colors) continue
      if (themes.some((other) => other.id === t.id)) continue
      const colors = completePalette(t.colors, BUILT_IN[schemeFor(completePalette(t.colors, LIGHT))])
      themes.push({ id: t.id, name: t.name.slice(0, 40) || 'Untitled', colors, scheme: schemeFor(colors) })
    }
    const selected = typeof parsed.selected === 'string' ? parsed.selected : 'system'
    return { v: 1, selected: isBuiltIn(selected) || themes.some((t) => t.id === selected) ? selected : 'system', themes }
  } catch {
    return empty
  }
}

function load(): Saved {
  try {
    return parseSaved(localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseSaved(null)
  }
}

let state: ThemeState = { ...load(), draft: null }
const listeners = new Set<() => void>()

function set(next: ThemeState, persist = true) {
  state = next
  if (persist) {
    try {
      const { v, selected, themes } = next
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v, selected, themes } satisfies Saved))
    } catch {
      // Private mode or full storage: the theme holds until the page closes.
    }
  }
  apply()
  listeners.forEach((fn) => fn())
}

const systemDark = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const systemScheme = (): Scheme => (systemDark?.matches ? 'dark' : 'light')

/** The custom theme showing right now: its unsaved edits if there are any. */
export function activeCustom(s: ThemeState = state): CustomTheme | null {
  if (s.draft && s.draft.id === s.selected) return s.draft
  return s.themes.find((t) => t.id === s.selected) ?? null
}

/** The colours showing right now. */
export function currentPalette(s: ThemeState = state): Palette {
  const custom = activeCustom(s)
  if (custom) return custom.colors
  return BUILT_IN[s.selected === 'dark' || (s.selected === 'system' && systemScheme() === 'dark') ? 'dark' : 'light']
}

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const custom = activeCustom()
  const scheme = custom ? custom.scheme : isBuiltIn(state.selected) && state.selected !== 'system' ? state.selected : systemScheme()
  root.dataset.theme = scheme
  for (const token of TOKENS) {
    if (custom) root.style.setProperty(`--${token}`, custom.colors[token])
    else root.style.removeProperty(`--${token}`)
  }
  // The browser's toolbar on phones matches the page.
  const paper = currentPalette().paper
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', paper))
}

if (typeof window !== 'undefined') {
  apply()
  systemDark?.addEventListener('change', () => {
    if (state.selected === 'system') set(state, false)
  })
  // Keep several open tabs in step. Unsaved edits stay, unless their theme went away.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const saved = load()
    const draft = state.draft && saved.themes.some((t) => t.id === state.draft!.id) ? state.draft : null
    set({ ...saved, draft: draft && saved.selected === draft.id ? draft : null }, false)
  })
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return
    event.preventDefault()
    event.returnValue = '' // Older Safari asks only when this is set.
  })
}

export function getTheme(): ThemeState {
  return state
}

export function useTheme(): ThemeState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getTheme,
  )
}

export function hasUnsavedChanges(s: ThemeState = state): boolean {
  if (!s.draft) return false
  const saved = s.themes.find((t) => t.id === s.draft!.id)
  return !saved || saved.name !== s.draft.name || TOKENS.some((token) => saved.colors[token] !== s.draft!.colors[token])
}

/** Switches theme. Unsaved edits are dropped: ask first (see hasUnsavedChanges). */
export function selectTheme(id: string) {
  if (!isBuiltIn(id) && !state.themes.some((t) => t.id === id)) return
  set({ ...state, selected: id, draft: null })
}

function uniqueName(base: string): string {
  const taken = new Set(state.themes.map((t) => t.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`
}

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function addTheme(name: string, colors: Palette): string {
  const theme: CustomTheme = { id: newId(), name: uniqueName(name), colors: { ...colors }, scheme: schemeFor(colors) }
  set({ ...state, themes: [...state.themes, theme], selected: theme.id, draft: null })
  return theme.id
}

/** A new theme, saved and selected, starting from the colours showing now. */
export function createTheme(): string {
  return addTheme('My theme', currentPalette())
}

/** A saved copy of a theme, with its unsaved edits if it's the one being edited. */
export function duplicateTheme(id: string): string | null {
  const source = state.draft?.id === id ? state.draft : state.themes.find((t) => t.id === id)
  return source ? addTheme(`${source.name} copy`, source.colors) : null
}

/** Edits the selected custom theme. Shows straight away; kept only once saved. */
export function editTheme(patch: { name?: string; colors?: Partial<Palette> }) {
  const base = activeCustom()
  if (!base) return
  const colors = { ...base.colors, ...patch.colors }
  const draft: CustomTheme = { ...base, name: patch.name ?? base.name, colors, scheme: schemeFor(colors) }
  set({ ...state, draft }, false)
}

export function saveTheme() {
  const draft = state.draft
  if (!draft) return
  const name = draft.name.trim() || 'Untitled'
  const themes = state.themes.map((t) => (t.id === draft.id ? { ...draft, name } : t))
  set({ ...state, themes, draft: null })
}

export function discardChanges() {
  if (state.draft) set({ ...state, draft: null }, false)
}

/** Deletes a custom theme. If it was showing, the site goes back to following the system. */
export function deleteTheme(id: string) {
  const themes = state.themes.filter((t) => t.id !== id)
  set({
    ...state,
    themes,
    selected: state.selected === id ? 'system' : state.selected,
    draft: state.draft?.id === id ? null : state.draft,
  })
}
