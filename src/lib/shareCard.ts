import { ALBUMS, LADDER, formatDuration } from '../data/songs'
import { formatShortDate } from './dates'
import { pauseLabel, plankHeadline, plankSegments, plankSummary, type ShareInput } from './share'

/** 4:5 portrait: fills a phone screen in chats and stories without being cropped. */
export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350
/** 9:16, the full screen of an Instagram or TikTok story. */
export const STORY_HEIGHT = 1920

// Always the light palette, whatever theme the page is in: the card is a printed thing, like the liner notes.
export const COLOR = {
  paper: '#f4f0e8',
  ink: '#1c1813',
  ink2: '#5f564b',
  rule: '#d8cfc1',
  signal: '#c23b22',
  held: '#3a8f5c',
  paused: '#e8862a',
  pausedInk: '#a3500d',
}

export const DISPLAY = 'Fraunces, Georgia, serif'
export const SANS = '"Instrument Sans", "Helvetica Neue", Arial, sans-serif'
export const MONO = '"IBM Plex Mono", Menlo, monospace'

export const STAR = 'M12 1.5 14.2 9.8 22.5 12 14.2 14.2 12 22.5 9.8 14.2 1.5 12 9.8 9.8Z'
const FLAME =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'

export const MARGIN = 96

/** Draws the finished-plank card (streak, song, the green and orange bar, the link) and returns it as a PNG. */
export async function renderShareCard(share: ShareInput): Promise<Blob> {
  const { canvas, ctx } = await newCard(CARD_HEIGHT)

  const left = MARGIN
  const right = CARD_WIDTH - MARGIN
  const { song } = share
  const album = ALBUMS[song.album]

  ctx.fillStyle = COLOR.paper
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

  // Masthead: the star and the name, the daily number and date on the right, over an ink rule.
  icon(ctx, STAR, left, 90, 44, COLOR.signal)
  text(ctx, 'Plank to Taylor', left + 62, 127, `600 40px ${SANS}`, COLOR.ink)
  text(ctx, `No. ${share.dailyNumber} · ${formatShortDate(share.day)}`, right, 126, `500 30px ${MONO}`, COLOR.ink2, 'right')
  rule(ctx, left, right, 168, 3, COLOR.ink)

  // Big, as on the finished screen: the streak with its flame, or for a ladder level with no
  // streak going yet, how far up the ladder you are.
  const showLadder = share.streak === 0 && share.level !== undefined
  const big = String(showLadder ? share.level : share.streak)
  const numberFont = `600 300px ${DISPLAY}`
  ctx.font = numberFont
  const numberWidth = ctx.measureText(big).width
  text(ctx, big, left - 10, 494, numberFont, COLOR.ink)
  const unitFont = `500 44px ${SANS}`
  if (showLadder) {
    text(ctx, `of ${LADDER.length}`, left + numberWidth + 16, 432, unitFont, COLOR.ink2)
    text(ctx, 'on the ladder', left + numberWidth + 16, 486, unitFont, COLOR.ink2)
  } else {
    icon(ctx, FLAME, left + numberWidth + 12, 372, 60, COLOR.signal, true)
    text(ctx, 'day streak', left + numberWidth + 16, 486, unitFont, COLOR.ink2)
  }

  text(ctx, plankHeadline(share.daily, share.level), left, 628, `600 76px ${DISPLAY}`, COLOR.ink)
  // Aurora lights caught, beside the headline. Never the ones missed.
  if (share.lights) text(ctx, `✨ ${share.lights}`, right, 624, `600 44px ${SANS}`, COLOR.ink2, 'right')

  // The song, as a tracklist row: sleeve, title over album, length on the right.
  const rowTop = 690
  const sleeve = 132
  box(ctx, left, rowTop, sleeve, sleeve, 4, album.color)
  text(ctx, album.short, left + 14, rowTop + sleeve - 16, `600 22px ${SANS}`, album.ink)

  const lengthFont = `500 36px ${MONO}`
  ctx.font = lengthFont
  const length = formatDuration(song.seconds)
  const textLeft = left + sleeve + 32
  const textWidth = right - ctx.measureText(length).width - 32 - textLeft
  const titleFont = `600 54px ${DISPLAY}`
  ctx.font = titleFont
  const titleLines = wrap(ctx, song.title, textWidth, 3)
  titleLines.forEach((line, i) => text(ctx, line, textLeft, rowTop + 46 + i * 60, titleFont, COLOR.ink))
  text(ctx, length, right, rowTop + 46, lengthFont, COLOR.ink, 'right')
  const albumFont = `400 32px ${SANS}`
  ctx.font = albumFont
  const albumY = rowTop + 46 + (titleLines.length - 1) * 60 + 52
  text(ctx, wrap(ctx, `${album.title} (${album.year})`, textWidth, 1)[0], textLeft, albumY, albumFont, COLOR.ink2)
  const rowBottom = Math.max(rowTop + sleeve, albumY + 12)

  // The bar: green while held, orange where paused, to scale, each break labelled.
  const barTop = rowBottom + 132
  bar(ctx, share, left, right, barTop)
  text(ctx, plankSummary(share.pauses, song.seconds), left, barTop + 32 + 58, `500 30px ${MONO}`, COLOR.ink2)
  if (share.xp) text(ctx, `+${share.xp.toLocaleString()} XP`, right, barTop + 32 + 58, `600 30px ${MONO}`, COLOR.ink, 'right')

  cardFooter(ctx, CARD_HEIGHT)
  return toPng(canvas)
}

/** A blank card, once the fonts it uses have loaded (the page already loads them), so it never draws in a fallback. */
export async function newCard(height: number): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  await Promise.allSettled(
    [`600 80px ${DISPLAY}`, `600 40px ${SANS}`, `500 40px ${SANS}`, `400 40px ${SANS}`, `500 30px ${MONO}`].map((font) => document.fonts.load(font)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available')
  return { canvas, ctx }
}

/** The invite at the foot of every card, and where to find it. */
export function cardFooter(ctx: CanvasRenderingContext2D, height: number, ink = COLOR.ink, ink2 = COLOR.ink2, rules = COLOR.rule, star = COLOR.signal) {
  const left = MARGIN
  rule(ctx, left, CARD_WIDTH - MARGIN, height - MARGIN - 108, 2, rules)
  text(ctx, 'Hold a plank for the length of a Taylor Swift song.', left, height - MARGIN - 54, `400 30px ${SANS}`, ink2)
  icon(ctx, STAR, left, height - MARGIN - 26, 28, star)
  text(ctx, window.location.host, left + 42, height - MARGIN, `600 34px ${SANS}`, ink)
}

export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the card'))), 'image/png'),
  )
}

function bar(ctx: CanvasRenderingContext2D, share: ShareInput, left: number, right: number, top: number) {
  const height = 32
  const gap = 6
  const segments = plankSegments(share.pauses, share.song.seconds)
  const minWidth = (kind: 'hold' | 'pause') => (kind === 'pause' ? 18 : 6)
  // Every segment gets its minimum, then the rest of the width is shared out by time.
  const spare = right - left - gap * (segments.length - 1) - segments.reduce((sum, s) => sum + minWidth(s.kind), 0)
  const totalMs = segments.reduce((sum, s) => sum + s.ms, 0)
  let x = left
  let labelEnd = -Infinity
  ctx.font = `500 28px ${MONO}`
  for (const segment of segments) {
    const width = minWidth(segment.kind) + (spare * segment.ms) / totalMs
    box(ctx, x, top, width, height, 6, segment.kind === 'hold' ? COLOR.held : COLOR.paused)
    if (segment.kind === 'pause') {
      // Centred over the break, kept on the card, and skipped if it would run into the last label.
      const label = pauseLabel(segment.ms)
      const labelWidth = ctx.measureText(label).width
      const labelLeft = Math.min(Math.max(x + width / 2 - labelWidth / 2, left), right - labelWidth)
      if (labelLeft > labelEnd + 12) {
        text(ctx, label, labelLeft, top - 16, ctx.font, COLOR.pausedInk)
        labelEnd = labelLeft + labelWidth
      }
    }
    x += width + gap
  }
}

export function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = 'left',
) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(value, x, y)
}

export function rule(ctx: CanvasRenderingContext2D, from: number, to: number, y: number, weight: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(from, y, to - from, weight)
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius)
  else ctx.rect(x, y, width, height)
  ctx.fill()
}

/** An icon from its 24×24 path, with its top left at x, y. The flame is also stroked, as the lit icon is. */
export function icon(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, size: number, color: string, stroke = false) {
  const shape = new Path2D(path)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.fillStyle = color
  ctx.fill(shape)
  if (stroke) {
    ctx.strokeStyle = color
    ctx.lineWidth = 1.75
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(shape)
  }
  ctx.restore()
}

/** Breaks text into lines that fit, ending the last one with … if it runs over. Uses the current ctx.font. */
export function wrap(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of value.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (!line || ctx.measureText(next).width <= maxWidth) line = next
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  let last = lines.slice(maxLines - 1).join(' ')
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
  return [...lines.slice(0, maxLines - 1), `${last.trimEnd()}…`]
}
