import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SONG_BY_ID } from '../data/songs'
import { shareText, type ShareInput } from './share'

const share = (fields: Partial<ShareInput> = {}): ShareInput => ({
  dailyNumber: 8,
  day: '2026-09-29',
  streak: 3,
  song: SONG_BY_ID.get('style')!,
  daily: true,
  pauses: [],
  ...fields,
})

describe('the shared text', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { origin: 'https://planktotaylor.pages.dev' } }))
  afterEach(() => vi.unstubAllGlobals())

  it('says a plank was done together, and how many of you', () => {
    const lines = shareText(share({ together: 4 })).split('\n')
    expect(lines[1]).toBe("Today's song · Style")
    expect(lines[2]).toBe('Planked together · 4 people')
  })

  it('says nothing of it planked alone', () => {
    expect(shareText(share())).not.toContain('together')
  })
})
