import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeRoomCode, randomLetters, roomLink } from './code'

describe('room codes and links', () => {
  beforeEach(() => vi.stubGlobal('window', { location: { origin: 'https://planktotaylor.com' } }))
  afterEach(() => vi.unstubAllGlobals())

  it('makes codes of 10 letters and digits, a new one each time', () => {
    const codes = Array.from({ length: 500 }, makeRoomCode)
    for (const code of codes) expect(code).toMatch(/^[a-z0-9]{10}$/)
    expect(new Set(codes).size).toBe(codes.length)
    expect(randomLetters(12)).toMatch(/^[a-z0-9]{12}$/)
  })

  it('uses every letter and digit', () => {
    const seen = new Set(Array.from({ length: 200 }, makeRoomCode).join(''))
    expect(seen.size).toBe(36)
  })

  it('links to the room with its song', () => {
    expect(roomLink('ab12cd34ef', 'cruel-summer')).toBe('https://planktotaylor.com/#together/ab12cd34ef/cruel-summer')
  })
})
