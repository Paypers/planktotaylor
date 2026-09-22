import { useSyncExternalStore } from 'react'
import type { Song } from '../data/songs'
import { todayKey } from './dates'
import { applyPlank, emptyData, type AppData, type Completion, type LadderCursor, type Pause, type Prefs } from './progress'

// Progress lives in this browser until the visitor signs in; then it's merged with their account.
const STORAGE_KEY = 'plank-to-taylor:v1'

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    const base = emptyData()
    return {
      v: 1,
      completions: Array.isArray(parsed.completions) ? parsed.completions : base.completions,
      ladder: parsed.ladder ?? base.ladder,
      prefs: { ...base.prefs, ...parsed.prefs },
    }
  } catch {
    return emptyData()
  }
}

let data: AppData = load()
const listeners = new Set<() => void>()
const plankListeners = new Set<(added: Completion[], ladder: LadderCursor) => void>()

function commit(next: AppData) {
  data = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode or full storage: keep going in memory.
  }
  listeners.forEach((fn) => fn())
}

// Keep several open tabs in step.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      data = load()
      listeners.forEach((fn) => fn())
    }
  })
}

export function getData(): AppData {
  return data
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, getData)
}

/** Fires after a plank is recorded, so the account sync can push it. */
export function onPlankRecorded(fn: (added: Completion[], ladder: LadderCursor) => void): () => void {
  plankListeners.add(fn)
  return () => plankListeners.delete(fn)
}

export function recordPlank(song: Song, pauses: Pause[] = []): Completion[] {
  const { data: next, added } = applyPlank(data, song, todayKey(), new Date().toISOString(), pauses)
  if (added.length > 0) {
    commit(next)
    plankListeners.forEach((fn) => fn(added, next.ladder))
  }
  return added
}

export function setLadderLevel(level: number): LadderCursor {
  const ladder = { level, updatedAt: new Date().toISOString() }
  commit({ ...data, ladder })
  return ladder
}

export function setPrefs(prefs: Partial<Prefs>) {
  commit({ ...data, prefs: { ...data.prefs, ...prefs } })
}

export function replaceProgress(completions: Completion[], ladder: LadderCursor) {
  commit({ ...data, completions, ladder })
}
