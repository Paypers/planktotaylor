import { describe, expect, it } from 'vitest'
import { barLabels } from './shareCard'

// Every character 10px wide, on a bar from 0 to 888 (the card's width less its margins).
const measure = (text: string) => text.length * 10
const labels = (spans: Parameters<typeof barLabels>[0]) => barLabels(spans, measure, 0, 888)

describe("the labels over the card's bar", () => {
  it('puts how long a plank with no breaks was held over the middle', () => {
    expect(labels([{ kind: 'hold', left: 0, right: 888, text: '3:45' }])).toEqual([{ kind: 'hold', text: '3:45', left: 424 }])
  })

  it('labels each stretch held and each break, keeping the stretches clear of the breaks', () => {
    expect(
      labels([
        { kind: 'hold', left: 0, right: 300, text: '1:00' },
        { kind: 'pause', left: 306, right: 324, text: '9s' },
        { kind: 'hold', left: 330, right: 888, text: '2:45' },
      ]),
    ).toEqual([
      { kind: 'pause', text: '9s', left: 305 },
      { kind: 'hold', text: '1:00', left: 126.5 },
      { kind: 'hold', text: '2:45', left: 592.5 },
    ])
  })

  it("leaves out a stretch's time when it doesn't fit beside its break", () => {
    expect(
      labels([
        { kind: 'hold', left: 0, right: 50, text: '0:10' },
        { kind: 'pause', left: 56, right: 74, text: '12s' },
        { kind: 'hold', left: 80, right: 888, text: '3:20' },
      ]).map((l) => l.text),
    ).toEqual(['12s', '3:20'])
  })

  it('leaves out a stretch too short to show a second of', () => {
    expect(
      labels([
        { kind: 'hold', left: 0, right: 6, text: '' },
        { kind: 'pause', left: 12, right: 30, text: '4s' },
        { kind: 'hold', left: 36, right: 888, text: '3:45' },
      ]).map((l) => l.text),
    ).toEqual(['4s', '3:45'])
  })

  it('keeps every label clear of the planker at the start of the bar', () => {
    expect(
      barLabels(
        [
          { kind: 'hold', left: 0, right: 200, text: '0:40' },
          { kind: 'pause', left: 206, right: 224, text: '9s' },
          { kind: 'hold', left: 230, right: 888, text: '2:45' },
        ],
        measure,
        0,
        888,
        160,
      ),
    ).toEqual([
      { kind: 'pause', text: '9s', left: 205 },
      // The first stretch, less the planker and the break's label: too narrow for its time.
      { kind: 'hold', text: '2:45', left: 542.5 },
    ])
    // A break under the planker still says how long it was, just past it.
    expect(barLabels([{ kind: 'pause', left: 20, right: 38, text: '12s' }], measure, 0, 888, 160)).toEqual([{ kind: 'pause', text: '12s', left: 160 }])
  })

  it('still skips a break label that would run into the one before', () => {
    expect(
      labels([
        { kind: 'hold', left: 0, right: 94, text: '0:20' },
        { kind: 'pause', left: 100, right: 106, text: '9s' },
        { kind: 'pause', left: 112, right: 118, text: '5s' },
        { kind: 'hold', left: 124, right: 888, text: '3:00' },
      ]).filter((l) => l.kind === 'pause'),
    ).toEqual([{ kind: 'pause', text: '9s', left: 93 }])
  })
})
