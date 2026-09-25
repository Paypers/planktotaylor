import {
  box,
  CARD_HEIGHT,
  CARD_WIDTH,
  cardFooter,
  COLOR,
  DISPLAY,
  heldMark,
  icon,
  lightColor,
  MARGIN,
  mix,
  MONO,
  newCard,
  rule,
  SANS,
  STAR,
  STORY_HEIGHT,
  text,
  toPng,
  wrap,
} from './shareCard'
import { REVIEW_NAME, type Mark, type Slide } from './yearInReview'

/** A post (4:5, like the plank card) or a story (9:16, for Instagram and TikTok). */
export type CardSize = 'post' | 'story'

export const cardHeight = (size: CardSize) => (size === 'story' ? STORY_HEIGHT : CARD_HEIGHT)

/** A number, a time or a year: drawn huge. Anything else (an album, a song) is words, drawn smaller. */
const isFigure = (value: string) => /^[\d.,:]+$/.test(value)

/** Draws one slide of Your Plank Year as a card. The top album's slide is in that album's colours. */
export async function renderYearCard(slide: Slide, year: number, size: CardSize): Promise<Blob> {
  const height = cardHeight(size)
  const { canvas, ctx } = await newCard(height)
  const left = MARGIN
  const right = CARD_WIDTH - MARGIN
  const width = right - left
  const paper = slide.album?.color ?? COLOR.paper
  const ink = slide.album?.ink ?? COLOR.ink
  const ink2 = slide.album ? mix(slide.album.ink, slide.album.color, 0.72) : COLOR.ink2
  const rules = slide.album ? mix(slide.album.ink, slide.album.color, 0.3) : COLOR.rule
  const star = slide.album ? ink : COLOR.signal

  ctx.fillStyle = paper
  ctx.fillRect(0, 0, CARD_WIDTH, height)

  // Masthead: the star and the name, and whose year it is.
  icon(ctx, STAR, left, 90, 44, star)
  text(ctx, 'Plank to Taylor', left + 62, 127, `600 40px ${SANS}`, ink)
  text(ctx, `${REVIEW_NAME} ${year}`, right, 126, `500 30px ${MONO}`, ink2, 'right')
  rule(ctx, left, right, 168, 3, ink)

  // Lay the slide out first to measure it, then draw it in the middle of the space.
  // The space between the masthead and the footer.
  const top = 168 + 60
  const bottom = height - MARGIN - 108 - 60
  const figure = isFigure(slide.big)
  // The summary's year sits smaller, to leave room for its rows.
  const figureSize = slide.rows ? 200 : slide.big.length > 5 ? 220 : 300
  const bigFont = figure ? `600 ${figureSize}px ${DISPLAY}` : `600 104px ${DISPLAY}`
  ctx.font = bigFont
  const bigLines = figure ? [slide.big] : wrap(ctx, slide.big, width, 4)
  const bigStep = figure ? Math.round(figureSize * 0.93) : 112
  ctx.font = `400 46px ${SANS}`
  const lines = slide.line ? wrap(ctx, slide.line, width, 3) : []
  const parts: { height: number; draw: (y: number) => void }[] = [
    { height: 70, draw: (y) => text(ctx, slide.eyebrow, left, y + 44, `500 44px ${SANS}`, ink2) },
    {
      height: bigLines.length * bigStep + (figure ? 0 : 16),
      draw: (y) =>
        bigLines.forEach((line, i) => text(ctx, line, left - (figure ? 8 : 0), y + (i + 1) * bigStep - (figure ? 20 : 24), bigFont, ink)),
    },
  ]
  if (slide.unit)
    parts.push({
      height: 80,
      draw: (y) => {
        const font = `500 52px ${SANS}`
        text(ctx, slide.unit!, left, y + 56, font, ink2)
        ctx.font = font
        if (slide.mark) drawMark(ctx, slide.mark, left + ctx.measureText(slide.unit!).width + 18, y + 20, 44)
      },
    })
  if (lines.length)
    parts.push({
      height: 24 + lines.length * 62,
      draw: (y) => lines.forEach((line, i) => text(ctx, line, left, y + 24 + (i + 1) * 62 - 16, `400 46px ${SANS}`, ink)),
    })
  if (slide.rank) {
    const { tier, division } = slide.rank
    parts.push({
      height: 130,
      draw: (y) => {
        const name = division ? `${tier.name} ${division}` : tier.name
        ctx.font = `600 44px ${SANS}`
        const plate = ctx.measureText(name).width + 64
        // Scribble's plaque is a clear plate: an outline.
        if (tier.fill) box(ctx, left, y + 40, plate, 76, 10, tier.fill)
        else {
          ctx.strokeStyle = ink
          ctx.lineWidth = 3
          ctx.strokeRect(left + 1.5, y + 41.5, plate - 3, 73)
        }
        text(ctx, name, left + 32, y + 92, `600 44px ${SANS}`, tier.ink ?? ink)
      },
    })
  }
  if (slide.rows) {
    // Rows tighten up to fit the card (a post is shorter than a story).
    const above = parts.reduce((sum, p) => sum + p.height, 0)
    const rowHeight = Math.min(86, Math.floor((bottom - top - above - 40) / slide.rows.length))
    parts.push({
      height: 40 + slide.rows.length * rowHeight,
      draw: (y) =>
        slide.rows!.forEach(([label, value, mark], i) => {
          const rowTop = y + 40 + i * rowHeight
          const font = Math.min(42, rowHeight - 30)
          const baseline = rowTop + rowHeight / 2 + font / 3
          rule(ctx, left, right, rowTop, 2, rules)
          text(ctx, label, left, baseline, `400 ${font}px ${SANS}`, ink2)
          ctx.font = `400 ${font}px ${SANS}`
          if (mark) drawMark(ctx, mark, left + ctx.measureText(label).width + 14, baseline - font * 0.82, font)
          text(ctx, value, right, baseline, `500 ${font}px ${MONO}`, ink, 'right')
        }),
    })
  }

  const block = parts.reduce((sum, p) => sum + p.height, 0)
  let y = top + Math.max(0, (bottom - top - block) / 2)
  for (const part of parts) {
    part.draw(y)
    y += part.height
  }

  cardFooter(ctx, height, ink, ink2, rules, star)
  return toPng(canvas)
}

/** A mark beside a slide's words, `size` across with its top left at x, y. A light is in the accent colour. */
function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, x: number, y: number, size: number) {
  if (mark === 'held') heldMark(ctx, x, y, size)
  else icon(ctx, STAR, x, y, size, lightColor(COLOR.signal))
}
