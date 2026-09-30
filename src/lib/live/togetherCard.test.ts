import { describe, expect, it } from 'vitest'
import { nameLines } from './togetherCard'

// Every character 10px wide, across the card's 888px. A name takes 42px for its tick, and 40px sits between names.
const measure = (text: string) => text.length * 10
const TEN = Array.from({ length: 12 }, (_, i) => `Name ${String(i).padStart(5, '0')}`)

describe("the names on the room's card", () => {
  it('puts a few names on one line', () => {
    expect(nameLines(['Ana', 'Ben', 'Cleo'], 3, measure, 888, 4)).toEqual({ lines: [['Ana', 'Ben', 'Cleo']], more: 0 })
  })

  it('fills each line before starting the next', () => {
    expect(nameLines(TEN, 12, measure, 888, 3)).toEqual({ lines: [TEN.slice(0, 5), TEN.slice(5, 10), TEN.slice(10)], more: 0 })
  })

  it('ends the last line with how many more when not everyone fits', () => {
    expect(nameLines(TEN, 12, measure, 888, 2)).toEqual({ lines: [TEN.slice(0, 5), TEN.slice(5, 9)], more: 3 })
  })

  it('counts a blank name among the more', () => {
    expect(nameLines(['Ana'], 2, measure, 888, 1)).toEqual({ lines: [['Ana']], more: 1 })
  })

  it('counts the rest of a very big room, rather than trying every name', () => {
    const names = Array.from({ length: 100 }, () => 'Jo')
    expect(nameLines(names, 100, measure, 888, 10).more).toBe(60)
  })
})
