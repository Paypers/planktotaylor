import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ghostFor, type Attempt, type AttemptOutcome } from './attempts'

// The attempt log lives in localStorage; tests get a fresh in-memory one and a fresh copy of the module,
// which is what a new visit to the site looks like.
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

const visit = async () => {
  vi.resetModules()
  return import('./attempts')
}

describe('attempt history', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('records every attempt with how far it got and how it ended', async () => {
    const log = await visit()
    const first = log.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    log.endAttempt(first, 'gave-up', 83.4, 1)
    const second = log.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    log.endAttempt(second, 'finished', 212, 0)
    expect(log.getAttempts()).toMatchObject([
      { id: first, outcome: 'gave-up', reached: 83.4, pauses: 1 },
      { id: second, outcome: 'finished', reached: 212 },
    ])
  })

  it('records a plank the page never came back from as left, where it was last saved', async () => {
    let log = await visit()
    const id = log.beginAttempt({ songId: 'glitch', kind: 'ladder', level: 3 })
    vi.setSystemTime(new Date('2026-09-22T12:00:40Z'))
    log.saveAttemptProgress(id, 40, 1)
    // The tab dies (battery, crash, the phone closes it). The site is opened again later.
    vi.setSystemTime(new Date('2026-09-22T12:05:00Z'))
    log = await visit()
    expect(log.getAttempts()).toMatchObject([
      { id, outcome: 'left', reached: 40, pauses: 1, level: 3, endedAt: '2026-09-22T12:00:40.000Z' },
    ])
  })

  it("leaves an attempt that's still being saved alone: it may be going on in another tab", async () => {
    const log = await visit()
    log.beginAttempt({ songId: 'glitch', kind: 'ladder', level: 3 })
    vi.setSystemTime(new Date('2026-09-22T12:00:05Z'))
    expect((await visit()).getAttempts()).toEqual([])
  })

  it('marks attempts the account has, and adds ones from other devices', async () => {
    const log = await visit()
    const id = log.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    log.endAttempt(id, 'offline', 95, 0)
    const elsewhere = { ...log.getAttempts()[0], id: 'from-my-phone', startedAt: '2026-09-21T08:00:00.000Z' }
    log.mergeAttempts([elsewhere], [id])
    expect(log.getAttempts().map((a) => [a.id, a.synced])).toEqual([
      ['from-my-phone', true],
      [id, true],
    ])
  })
})

describe('your ghost', () => {
  const go = (songId: string, outcome: AttemptOutcome, reached: number): Attempt => ({
    id: `${songId}-${outcome}-${reached}`,
    songId,
    kind: 'ladder',
    startedAt: '2026-09-22T12:00:00.000Z',
    reached,
    pauses: 0,
    endedAt: '2026-09-22T12:05:00.000Z',
    outcome,
  })

  it('is the furthest go you ended yourself', () => {
    const log = [go('style', 'gave-up', 60), go('style', 'stopped', 75.5), go('style', 'left', 120), go('style', 'offline', 110)]
    expect(ghostFor('style', log, false)).toBe(75.5)
  })

  it("is gone once you've finished the song", () => {
    expect(ghostFor('style', [go('style', 'gave-up', 60), go('style', 'finished', 231)], false)).toBeNull()
    // Planked before attempts were recorded: a completion, but no finished attempt.
    expect(ghostFor('style', [go('style', 'gave-up', 60)], true)).toBeNull()
  })

  it('ignores other songs, and goes too short to show', () => {
    expect(ghostFor('style', [go('cancelled', 'gave-up', 100)], false)).toBeNull()
    expect(ghostFor('style', [go('style', 'gave-up', 3)], false)).toBeNull()
    expect(ghostFor('style', [], false)).toBeNull()
  })
})
