import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestEvery } from './latest'

describe('sending only the latest, every so often', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends the first at once, then the newest once the gap is up', () => {
    const sent: string[] = []
    const every = latestEvery<string>(10_000, (value) => sent.push(value) > 0)
    every.set('lobby')
    expect(sent).toEqual(['lobby'])
    vi.advanceTimersByTime(3000)
    every.set('planking')
    every.set('out')
    expect(sent).toEqual(['lobby'])
    vi.advanceTimersByTime(6999)
    expect(sent).toEqual(['lobby'])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual(['lobby', 'out'])
    // Nothing more to send: nothing goes.
    vi.advanceTimersByTime(60_000)
    expect(sent).toEqual(['lobby', 'out'])
    every.set('planking')
    expect(sent).toEqual(['lobby', 'out', 'planking'])
  })

  it("keeps a value that couldn't go for the next try", () => {
    const sent: string[] = []
    let online = false
    const every = latestEvery<string>(10_000, (value) => online && sent.push(value) > 0)
    every.set('planking')
    expect(sent).toEqual([])
    online = true
    every.set('planking')
    expect(sent).toEqual(['planking'])
  })

  it('sends nothing once cancelled', () => {
    const sent: string[] = []
    const every = latestEvery<string>(10_000, (value) => sent.push(value) > 0)
    every.set('lobby')
    every.set('done')
    every.cancel()
    vi.advanceTimersByTime(20_000)
    expect(sent).toEqual(['lobby'])
  })
})
