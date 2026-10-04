import { describe, expect, it } from 'vitest'
import { STRETCH_MS } from './room'
import { STRETCHES, stretchAt } from './stretch'

describe('the stretch together', () => {
  it('goes through each move in turn, an equal share of the minute each', () => {
    expect(STRETCHES).toHaveLength(4)
    expect(stretchAt(STRETCH_MS)).toMatchObject({ index: 0, secondsLeft: 15, stretch: STRETCHES[0] })
    expect(stretchAt(STRETCH_MS - 14_200)).toMatchObject({ index: 0, secondsLeft: 1 })
    expect(stretchAt(STRETCH_MS - 15_000)).toMatchObject({ index: 1, secondsLeft: 15 })
    expect(stretchAt(20_000)).toMatchObject({ index: 2, secondsLeft: 5 })
    expect(stretchAt(500)).toMatchObject({ index: 3, secondsLeft: 1, stretch: STRETCHES[3] })
  })

  it('stays on the last move once the stretch has run out, and on the first before it starts', () => {
    expect(stretchAt(0)).toMatchObject({ index: 3, secondsLeft: 0 })
    expect(stretchAt(-500)).toMatchObject({ index: 3, secondsLeft: 0 })
    expect(stretchAt(STRETCH_MS + 2000)).toMatchObject({ index: 0, secondsLeft: 15 })
  })
})
