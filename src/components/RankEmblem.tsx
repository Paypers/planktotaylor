import type { Tier, TierId } from '../lib/ranks'

// Each rank's emblem: a medallion holding its piece of writing. The seven tiers sit on a tint of
// their colour; the top three are solid, with a frame that grows with each. Drawn on a 120 grid.

const f = (n: number) => String(Math.round(n * 100) / 100)

/** A line of writing: a bar with round ends. */
function bar(x: number, y: number, w: number, h: number): string {
  const r = h / 2
  return `M${f(x + r)} ${f(y)} H${f(x + w - r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)} H${f(x + r)} A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)} Z`
}

/** Lines of writing starting at `x`: [top, width, own x?]. */
const bars = (x: number, h: number, rows: [number, number, number?][]) => rows.map(([y, w, rx]) => bar(rx ?? x, y, w, h)).join(' ')

/** A sheet of paper with softly rounded corners. */
function sheet(x: number, y: number, w: number, h: number): string {
  return `M${x + 2} ${y} H${x + w - 2} A2 2 0 0 1 ${x + w} ${y + 2} V${y + h - 2} A2 2 0 0 1 ${x + w - 2} ${y + h} H${x + 2} A2 2 0 0 1 ${x} ${y + h - 2} V${y + 2} A2 2 0 0 1 ${x + 2} ${y} Z`
}

/** Short strokes around the rim, for the top ranks. */
function spokes(n: number, r0: number, r1: number, offset: number): string {
  return Array.from({ length: n }, (_, i) => {
    const a = ((offset + (i * 360) / n) * Math.PI) / 180
    return `M${f(60 + r0 * Math.cos(a))} ${f(60 + r0 * Math.sin(a))} L${f(60 + r1 * Math.cos(a))} ${f(60 + r1 * Math.sin(a))}`
  }).join(' ')
}

function leaf(b: [number, number], tip: [number, number], w: number): string {
  const [mx, my] = [(b[0] + tip[0]) / 2, (b[1] + tip[1]) / 2]
  const [dx, dy] = [tip[0] - b[0], tip[1] - b[1]]
  const len = Math.hypot(dx, dy) || 1
  const [px, py] = [(-dy / len) * w, (dx / len) * w]
  return `M${f(b[0])} ${f(b[1])} Q${f(mx + px)} ${f(my + py)} ${f(tip[0])} ${f(tip[1])} Q${f(mx - px)} ${f(my - py)} ${f(b[0])} ${f(b[1])} Z`
}

interface LaurelShape {
  r: number
  cy: number
  /** Where each branch runs, in degrees clockwise from 3 o'clock: bottom to top. */
  branches: [number, number][]
  count: number
  length: number
  width: number
}

/** Two branches curving up either side from the bottom, a pair of leaves at each step. */
function laurel({ r, cy, branches, count, length, width }: LaurelShape): { leaves: string; stems: string } {
  const leaves: string[] = []
  const stems: string[] = []
  for (const [from, to] of branches) {
    const [a0, a1] = [(from * Math.PI) / 180, (to * Math.PI) / 180]
    const dir = a1 > a0 ? 1 : -1
    const at = (a: number): [number, number] => [60 + r * Math.cos(a), cy + r * Math.sin(a)]
    const [p0, p1] = [at(a0), at(a1)]
    stems.push(`M${f(p0[0])} ${f(p0[1])} A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${f(p1[0])} ${f(p1[1])}`)
    for (let i = 0; i < count; i++) {
      const a = a0 + ((a1 - a0) * (i + 0.5)) / count
      const b = at(a)
      const [tx, ty, nx, ny] = [-Math.sin(a) * dir, Math.cos(a) * dir, Math.cos(a), Math.sin(a)]
      for (const side of [1, -1]) {
        leaves.push(leaf(b, [b[0] + tx * length * 0.75 + nx * length * 0.55 * side, b[1] + ty * length * 0.75 + ny * length * 0.55 * side], width))
      }
    }
    leaves.push(leaf(p1, [p1[0] - Math.sin(a1) * dir * length, p1[1] + Math.cos(a1) * dir * length], width))
  }
  return { leaves: leaves.join(' '), stems: stems.join(' ') }
}

interface Art {
  /** Filled shapes, back to front. */
  shapes: { d: string; fill: string }[]
  /** Fine lines drawn over them. */
  lines?: { d: string; color: string; width: number }
  laurel?: { leaves: string; stems: string; color: string }
  /** The top ranks' inner ring and rim strokes. */
  inner?: { r: number; color: string; width: number }
  rim?: { d: string; color: string; width: number }
  /** Overrides the ring's colour (Magnum Opus's gold). */
  ring?: string
}

const CARD = 'M40 42 H74 L82 50 V76 A2 2 0 0 1 80 78 H40 A2 2 0 0 1 38 76 V44 A2 2 0 0 1 40 42 Z'
const PAGES = 'M60 40 C52 36 42 36 34 38 V74 C42 72 52 72 60 76 Z M60 40 C68 36 78 36 86 38 V74 C78 72 68 72 60 76 Z'
const ROLLS = 'M38 40 A5 5 0 0 1 43 45 V75 A5 5 0 0 1 33 75 V45 A5 5 0 0 1 38 40 Z M82 40 A5 5 0 0 1 87 45 V75 A5 5 0 0 1 77 75 V45 A5 5 0 0 1 82 40 Z'
const BOOKS = 'M36 42 H48 V84 H36 Z M49 36 H63 V84 H49 Z M66 84 L78 84 L88 47 L76 47 Z'

const ART: Record<TierId, Art> = {
  // A pencil squiggle.
  scribble: {
    shapes: [],
    lines: {
      d: 'M36 66 C40 54 48 50 50 58 C52 66 44 70 44 62 C44 52 58 48 62 56 C66 64 58 70 58 62 C58 52 72 48 76 56 C79 62 80 64 84 60',
      color: 'var(--ink-2)',
      width: 2.4,
    },
  },
  // A note card with two lines.
  couplet: {
    shapes: [
      { d: CARD, fill: '#e3b88c' },
      { d: `M74 42 V48 A2 2 0 0 0 76 50 H82 Z ${bars(46, 4, [[55, 28], [64, 20]])}`, fill: '#8f5d31' },
    ],
    lines: { d: CARD, color: '#6b4020', width: 1.2 },
  },
  // A page with a four-line stanza.
  verse: {
    shapes: [
      { d: sheet(44, 36, 36, 52), fill: '#c3c8ce' },
      { d: sheet(40, 32, 36, 52), fill: '#eef0f3' },
      { d: bars(46, 3.6, [[46, 24], [54, 18], [62, 22], [70, 14]]), fill: '#6b737c' },
    ],
    lines: { d: sheet(40, 32, 36, 52), color: '#454c55', width: 1.2 },
  },
  // Fourteen lines: three quatrains and a couplet.
  sonnet: {
    shapes: [
      { d: sheet(43, 29, 40, 64), fill: '#deb551' },
      { d: sheet(40, 26, 40, 64), fill: '#f7e6b0' },
      {
        d: bars(45, 1.8, [
          [33, 29], [36.5, 26], [40, 30], [43.5, 24],
          [49, 28], [52.5, 30], [56, 25], [59.5, 27],
          [65, 29], [68.5, 24], [72, 30], [75.5, 26],
          [81, 24, 49], [84.5, 20, 49],
        ]),
        fill: '#b08422',
      },
    ],
    lines: { d: sheet(40, 26, 40, 64), color: '#6b4d0b', width: 1.2 },
  },
  // A song sheet on a scroll.
  ballad: {
    shapes: [
      { d: 'M40 44 H80 V76 H40 Z', fill: '#e2f4f1' },
      { d: ROLLS, fill: '#a7d4cd' },
      { d: 'M46 66 A4 3.2 0 1 0 54 66 A4 3.2 0 1 0 46 66 Z', fill: '#1f5a52' },
    ],
    lines: { d: `M43 44 H77 M43 76 H77 M54 66 V50 C56 53 60 54 60 58 M63 54 H73 M63 61 H71 M63 68 H73 ${ROLLS}`, color: '#1f5a52', width: 1.4 },
  },
  // An open book with a ribbon.
  chapter: {
    shapes: [
      { d: 'M60 44 C52 40 40 40 32 42 V78 C42 76 52 76 60 80 C68 76 78 76 88 78 V42 C80 40 68 40 60 44 Z', fill: '#a996d6' },
      { d: PAGES, fill: '#f5f1fc' },
      { d: 'M58 76 H62 V86 L60 84 L58 86 Z', fill: '#4f3d86' },
    ],
    lines: {
      d: `${PAGES} M39 46 C45 45 50 45 55 47 M39 53 C45 52 50 52 55 54 M39 60 C45 59 50 59 55 61 M39 67 C45 66 50 66 55 68 M65 47 C70 45 75 45 81 46 M65 54 C70 52 75 52 81 53 M65 61 C70 59 75 59 81 60 M65 68 C70 66 75 66 81 67`,
      color: '#4f3d86',
      width: 1.2,
    },
  },
  // A shelf of books.
  anthology: {
    shapes: [
      { d: 'M36 42 H48 V84 H36 Z', fill: '#a6baf1' },
      { d: 'M49 36 H63 V84 H49 Z', fill: '#dde6fd' },
      { d: 'M66 84 L78 84 L88 47 L76 47 Z', fill: '#6f89d6' },
    ],
    lines: { d: `${BOOKS} M36 49 H48 M36 77 H48 M49 43 H63 M49 77 H63 M67.89 77 H79.89 M74.11 54 H86.11 M31 84.5 H89`, color: '#2c4598', width: 1.2 },
  },
  // The whole book: a stack of pages tied with a bow.
  manuscript: {
    shapes: [
      { d: 'M40 40 H80 V80 H40 Z', fill: '#f3eafb' },
      {
        d: 'M57 40 H63 V80 H57 Z M40 57 H80 V63 H40 Z M60 60 C52 48 42 52 49 61 C52 65 57 63 60 60 Z M60 60 C68 48 78 52 71 61 C68 65 63 63 60 60 Z',
        fill: '#8d60b6',
      },
      { d: 'M56.5 60 A3.5 3.5 0 1 0 63.5 60 A3.5 3.5 0 1 0 56.5 60 Z', fill: '#4a286c' },
    ],
    lines: { d: 'M42 82 H82 V42 M44 84 H84 V44', color: '#d7c1ef', width: 1.4 },
    inner: { r: 44, color: '#8d60b6', width: 1 },
  },
  // The pen that wrote it, in a laurel.
  masterpiece: {
    shapes: [
      { d: 'M60 84 L49 63 C49 54 53 47 60 42 C67 47 71 54 71 63 Z', fill: '#fff3f3' },
      { d: 'M60 84 L49 63 C49 54 53 47 60 42 Z', fill: '#f6d6dc' },
      { d: 'M57.6 62 A2.4 2.4 0 1 0 62.4 62 A2.4 2.4 0 1 0 57.6 62 Z', fill: '#7a1424' },
    ],
    lines: { d: 'M60 84 V64.4', color: '#7a1424', width: 1.4 },
    laurel: { ...laurel({ r: 27, cy: 62, branches: [[100, 245], [80, -65]], count: 6, length: 11, width: 3.2 }), color: '#f6c9d1' },
    inner: { r: 44, color: '#d4485c', width: 1 },
    rim: { d: spokes(4, 53, 58, 0), color: '#a4243a', width: 2.4 },
  },
  // The great work: a gold tome in a laurel.
  'magnum-opus': {
    shapes: [
      { d: 'M44 40 H76 A2 2 0 0 1 78 42 V78 A2 2 0 0 1 76 80 H44 Z', fill: '#f4d27a' },
      { d: 'M63 52 L64.9 58.1 L71 60 L64.9 61.9 L63 68 L61.1 61.9 L55 60 L61.1 58.1 Z', fill: '#1b2d5a' },
      { d: 'M44 40 H50 V80 H44 Z', fill: '#c9a44a' },
    ],
    lines: { d: 'M54 46 H72 V74 H54 Z', color: '#1b2d5a', width: 1.2 },
    laurel: { ...laurel({ r: 37, cy: 60, branches: [[105, 235], [75, -55]], count: 6, length: 9, width: 2.6 }), color: '#c9a44a' },
    inner: { r: 45, color: '#f4d27a', width: 0.8 },
    rim: { d: spokes(12, 53, 57.5, 15), color: '#f4d27a', width: 1.4 },
    ring: '#f4d27a',
  },
}

export function RankEmblem({ tier, size }: { tier: Tier; size: number }) {
  const art = ART[tier.id]
  const top = tier.milestone !== undefined
  // Tints and rings mix with the page's own colours, so they sit right in every theme.
  const disc = tier.fill === null ? 'none' : top ? tier.fill : `color-mix(in srgb, ${tier.fill} 26%, var(--paper))`
  const ring =
    tier.fill === null ? 'var(--faint)' : (art.ring ?? (top ? tier.fill : `color-mix(in srgb, ${tier.fill} 55%, var(--ink))`))
  return (
    <svg className="emblem" viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      {art.rim && <path d={art.rim.d} style={{ fill: 'none', stroke: art.rim.color, strokeWidth: art.rim.width, strokeLinecap: 'round' }} />}
      <circle cx="60" cy="60" r="50" style={{ fill: disc }} />
      <circle cx="60" cy="60" r="50" style={{ fill: 'none', stroke: ring, strokeWidth: 1.5, strokeDasharray: tier.fill === null ? '5 5' : undefined }} />
      {art.inner && <circle cx="60" cy="60" r={art.inner.r} style={{ fill: 'none', stroke: art.inner.color, strokeWidth: art.inner.width }} />}
      {art.laurel && (
        <>
          <path d={art.laurel.stems} style={{ fill: 'none', stroke: art.laurel.color, strokeWidth: 1.3, strokeLinecap: 'round' }} />
          <path d={art.laurel.leaves} style={{ fill: art.laurel.color }} />
        </>
      )}
      {art.shapes.map((shape, i) => (
        <path key={i} d={shape.d} style={{ fill: shape.fill }} />
      ))}
      {art.lines && (
        <path
          d={art.lines.d}
          style={{ fill: 'none', stroke: art.lines.color, strokeWidth: art.lines.width, strokeLinecap: 'round', strokeLinejoin: 'round' }}
        />
      )}
    </svg>
  )
}
