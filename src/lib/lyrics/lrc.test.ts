import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentLineIndex, lyricsFrom, parseLrc, pickRecord, type LrclibRecord } from './lrc'
import { lyricsSwitchedOn } from './lrclib'

// Made-up words: tests never need real lyrics.
const record = (fields: Partial<LrclibRecord>): LrclibRecord => ({
  trackName: 'Song',
  albumName: 'Album',
  duration: 200,
  instrumental: false,
  plainLyrics: null,
  syncedLyrics: null,
  ...fields,
})

describe('timed lyrics', () => {
  it('reads each line and its time, in time order, skipping tags', () => {
    const text = '[ar:Someone]\n[00:12.50]First line\n[01:02.05] Second line \n[00:05]\n'
    expect(parseLrc(text)).toEqual([
      { at: 5, text: '' },
      { at: 12.5, text: 'First line' },
      { at: 62.05, text: 'Second line' },
    ])
  })

  it('reads a line sung more than once at each of its times', () => {
    expect(parseLrc('[00:10.00][00:40.00]Again')).toEqual([
      { at: 10, text: 'Again' },
      { at: 40, text: 'Again' },
    ])
  })

  it('lights the line being sung: none before the first, the last after it', () => {
    const lines = parseLrc('[00:10.00]One\n[00:20.00]Two\n[00:30.00]Three')
    expect(currentLineIndex(lines, 0)).toBe(-1)
    expect(currentLineIndex(lines, 10)).toBe(0)
    expect(currentLineIndex(lines, 29.9)).toBe(1)
    expect(currentLineIndex(lines, 500)).toBe(2)
  })
})

describe('choosing lyrics from LRCLIB', () => {
  it('takes timed lyrics over plain ones, plain over none, and nothing for an instrumental', () => {
    expect(lyricsFrom(record({ syncedLyrics: '[00:01.00]Hi', plainLyrics: 'Hi' }))).toEqual({ kind: 'synced', lines: [{ at: 1, text: 'Hi' }] })
    expect(lyricsFrom(record({ plainLyrics: 'Hi\nThere' }))).toEqual({ kind: 'plain', lines: ['Hi', 'There'] })
    expect(lyricsFrom(record({ syncedLyrics: '[00:01.00]', plainLyrics: '  ' }))).toBeNull()
    expect(lyricsFrom(record({ instrumental: true, plainLyrics: 'Hi' }))).toBeNull()
  })

  it('keeps to recordings the song’s length, timed first, then the closest', () => {
    const plainExact = record({ duration: 200, plainLyrics: 'a' })
    const timedNear = record({ duration: 201.5, syncedLyrics: '[00:01.00]b' })
    const timedFar = record({ duration: 206, syncedLyrics: '[00:01.00]c' })
    expect(pickRecord([plainExact, timedFar, timedNear], 200)).toBe(timedNear)
    expect(pickRecord([plainExact, timedFar], 200)).toBe(plainExact)
    expect(pickRecord([timedFar], 200)).toBeNull()
  })
})

describe('the site-wide lyrics switch', () => {
  afterEach(() => vi.unstubAllGlobals())
  const serve = (response: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(response))

  it('is on only when lyrics.json says so', async () => {
    serve(async () => new Response('{ "enabled": true }'))
    expect(await lyricsSwitchedOn()).toBe(true)
    serve(async () => new Response('{ "enabled": false }'))
    expect(await lyricsSwitchedOn()).toBe(false)
  })

  it('is off when the file is missing, broken or out of reach', async () => {
    serve(async () => new Response('Not found', { status: 404 }))
    expect(await lyricsSwitchedOn()).toBe(false)
    serve(async () => new Response('{ enabled'))
    expect(await lyricsSwitchedOn()).toBe(false)
    serve(async () => Promise.reject(new TypeError('offline')))
    expect(await lyricsSwitchedOn()).toBe(false)
  })
})
