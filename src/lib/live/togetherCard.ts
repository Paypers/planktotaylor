import { dailyNumber } from '../daily'
import { formatShortDate } from '../dates'
import { plankSummary } from '../share'
import {
  bar,
  CARD_HEIGHT,
  CARD_WIDTH,
  cardFooter,
  COLOR,
  DISPLAY,
  heldMark,
  icon,
  MARGIN,
  MONO,
  newCard,
  rule,
  SANS,
  songRow,
  songRowHeight,
  STAR,
  text,
  toPng,
} from '../shareCard'
import type { TogetherShare } from './link'
import { finisherNames } from './togetherShare'

const NAME_FONT = `500 36px ${SANS}`
const NAME_STEP = 56
const TICK = 30
// The tick before each name and the space after it, then the room between one name and the next.
const NAME_MARK = TICK + 12
const NAME_GAP = 40
// Names tried on the card at most: more than could ever fit, so the rest are only counted.
const CARD_NAMES = 40

const moreLabel = (more: number) => `and ${more} more`

/**
 * The names in lines across the card, each after its tick, in order. As many as fit in `maxLines`: if
 * not everyone fits, the last line ends with "and N more" (`more`), and N counts any blank names too.
 */
export function nameLines(
  names: readonly string[],
  count: number,
  measure: (text: string) => number,
  width: number,
  maxLines: number,
): { lines: string[][]; more: number } {
  const tried = names.slice(0, CARD_NAMES)
  // One name fewer at a time, until they and the "and N more" fit.
  for (let shown = tried.length; shown > 0; shown--) {
    const more = count - shown
    const lines = flow(tried.slice(0, shown), more > 0 ? measure(moreLabel(more)) : 0, measure, width)
    if (lines.length <= maxLines) return { lines, more }
  }
  return { lines: [], more: count }
}

// Names into lines, each line as full as it goes, leaving `after` for the "and N more" at the end.
function flow(names: readonly string[], after: number, measure: (text: string) => number, width: number): string[][] {
  const items = [
    ...names.map((name) => ({ name, width: NAME_MARK + measure(name) })),
    ...(after ? [{ name: '', width: after }] : []),
  ]
  const lines = items.reduce<{ names: string[]; width: number }[]>((placed, item) => {
    const last = placed.at(-1)
    const joined = last ? last.width + NAME_GAP + item.width : Infinity
    return last && joined <= width
      ? [...placed.slice(0, -1), { names: [...last.names, item.name], width: joined }]
      : [...placed, { names: [item.name], width: item.width }]
  }, [])
  // The "and N more" is drawn after the names rather than as one: it may have a line to itself.
  return lines.map((line) => line.names.filter(Boolean))
}

/** Draws the room's card (how many planked together, the song, the room's bar, the names) and returns it as a PNG. */
export async function renderTogetherCard(share: TogetherShare): Promise<Blob> {
  const { canvas, ctx } = await newCard(CARD_HEIGHT)

  const left = MARGIN
  const right = CARD_WIDTH - MARGIN
  const { song } = share
  const { names, count } = finisherNames(share.finishers)

  ctx.fillStyle = COLOR.paper
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // Masthead, as on the plank card.
  icon(ctx, STAR, left, 90, 44, COLOR.signal)
  text(ctx, 'Plank to Taylor', left + 62, 127, `600 40px ${SANS}`, COLOR.ink)
  text(ctx, `No. ${dailyNumber(share.day)} · ${formatShortDate(share.day)}`, right, 126, `500 30px ${MONO}`, COLOR.ink2, 'right')
  rule(ctx, left, right, 168, 3, COLOR.ink)

  // Lay out the song's row and the names first, to draw it all in the middle of the space. A few names leave a lot of it.
  const rowTop = 470
  const barTop = rowTop + songRowHeight(ctx, song, left, right) + 104
  const summaryY = barTop + 32 + 58
  const firstLine = summaryY + 88
  const lastLine = CARD_HEIGHT - MARGIN - 108 - 52
  ctx.font = NAME_FONT
  const measure = (value: string) => ctx.measureText(value).width
  const { lines, more } = nameLines(names, count, measure, right - left, Math.floor((lastLine - firstLine) / NAME_STEP) + 1)
  const spare = lastLine - (firstLine + (lines.length - 1) * NAME_STEP)
  ctx.save()
  ctx.translate(0, Math.round(spare / 2))

  // Big: how many held to the end, with the names' tick. One alone might have had company, so not "together".
  const numberFont = `600 220px ${DISPLAY}`
  ctx.font = numberFont
  const numberWidth = ctx.measureText(String(count)).width
  text(ctx, String(count), left - 8, 400, numberFont, COLOR.ink)
  heldMark(ctx, left + numberWidth + 18, 292, 50)
  text(ctx, count === 1 ? 'planked it' : 'planked together', left + numberWidth + 16, 393, `500 44px ${SANS}`, COLOR.ink2)

  songRow(ctx, song, left, right, rowTop)

  // The room's bar, with every break whoever paused, labelled as on the plank card.
  bar(ctx, share.pauses, song.seconds, left, right, barTop)
  text(ctx, plankSummary(share.pauses, song.seconds), left, summaryY, `500 30px ${MONO}`, COLOR.ink2)

  // The names, each after its tick.
  lines.forEach((line, i) => {
    const y = firstLine + i * NAME_STEP
    const end = line.reduce((x, name) => {
      heldMark(ctx, x, y - 27, TICK)
      text(ctx, name, x + NAME_MARK, y, NAME_FONT, COLOR.ink)
      return x + NAME_MARK + measure(name) + NAME_GAP
    }, left)
    if (more > 0 && i === lines.length - 1) text(ctx, moreLabel(more), end, y, NAME_FONT, COLOR.ink2)
  })
  ctx.restore()

  cardFooter(ctx, CARD_HEIGHT)
  return toPng(canvas)
}
