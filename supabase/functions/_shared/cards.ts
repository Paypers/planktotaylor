// The Discord posts' cards: a picture under each post, like Wordle's results, in the site's own look (the
// paper, Fraunces over Instrument Sans, the star, the green tick). What goes on a card is worked out by
// the site's code (morningCard, everyoneCard, groupCard in src/lib/discord.ts); this only draws it.
// satori lays it out into an SVG and resvg turns that into a PNG, drawn at twice the size for sharpness.
import satori from 'npm:satori@0.12.2'
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2'
import { FACES_SHOWN } from './site.js'

type CardSong = { title: string; length: string; album: string; short: string; color: string; ink: string }
type CardPerson = { name: string; photo: string | null }
export type Card =
  | { kind: 'morning'; top: string; song: CardSong }
  | {
      kind: 'everyone'
      top: string
      song: CardSong | null
      planks: number
      together: string | null
      noBreak: number
      heat: number[] | null
      toughest: string | null
    }
  | { kind: 'group'; top: string; song: CardSong | null; group: string; streak: number; held: CardPerson[]; planked: CardPerson[] }

const COLOR = { paper: '#f4f0e8', well: '#ebe5da', rule: '#d8cfc1', ink: '#1c1813', ink2: '#5f564b', signal: '#c23b22', held: '#3a8f5c' }
const WIDTH = 520
const SCALE = 2

const STAR = 'M12 1.5 14.2 9.8 22.5 12 14.2 14.2 12 22.5 9.8 14.2 1.5 12 9.8 9.8Z'
const FLAME =
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
const CHECK = 'M20 6 9 17l-5-5'

// ——— Drawing ———

let ready: Promise<void> | null = null
/** resvg's WebAssembly, once per instance of the function. */
const wasm = () => (ready ??= initWasm(fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')))

/** Draws a card as a PNG. */
export async function drawCard(card: Card, site: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const [tree, height] = await layout(card, new URL(site).host, fetcher)
  const [fonts] = await Promise.all([fontsFor(textOf(card), fetcher), wasm()])
  const svg = await satori(tree, { width: WIDTH, height, fonts })
  return new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH * SCALE } }).render().asPng()
}

type Node = { type: string; props: Record<string, unknown> }
type Child = Node | string | null | false | undefined
const el = (type: string, style: Record<string, unknown>, ...children: Child[]): Node => ({
  type,
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c !== null && c !== false && c !== undefined) },
})

/** An icon from its 24×24 path, as a picture. */
function icon(path: string, size: number, color: string, stroke = false): Node {
  const paint = stroke
    ? `fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`
    : `fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="${path}" ${paint}/></svg>`
  return { type: 'img', props: { src: `data:image/svg+xml;base64,${btoa(svg)}`, width: size, height: size, style: { flexShrink: 0 } } }
}

/** Held with no breaks: the setlist's green tick. */
const heldMark = (size: number) =>
  el('div', { width: size, height: size, borderRadius: size / 2, background: COLOR.held, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, icon(CHECK, size * 0.66, COLOR.paper, true))

/** Planked, with breaks: the same tick, drawn in a line. Its breaks are nobody's business. */
const plainMark = (size: number) =>
  el(
    'div',
    { width: size, height: size, borderRadius: size / 2, border: `1.5px solid ${COLOR.ink}`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    icon(CHECK, size * 0.6, COLOR.ink, true),
  )

/** The top line: the star and what the card is, over an ink rule, with the day on the right. */
const masthead = (label: string, top: string) =>
  el(
    'div',
    {
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 12,
      borderBottom: `1px solid ${COLOR.ink}`,
      fontFamily: 'Mono',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    el('div', { alignItems: 'center', gap: 8, maxWidth: 280 }, icon(STAR, 14, COLOR.signal), el('div', { overflow: 'hidden' }, label)),
    el('div', { color: COLOR.ink2 }, top),
  )

/** An album sleeve: its colour, with its short name in the corner. */
const sleeve = (song: CardSong, size: number) =>
  el(
    'div',
    { width: size, height: size, flexShrink: 0, padding: size / 12, alignItems: 'flex-end', background: song.color, color: song.ink, fontSize: Math.max(8, size / 9), fontWeight: 600 },
    song.short,
  )

/** A title's size, so a long one still fits in its lines. */
const titleSize = (title: string, sizes: [number, number, number, number]) =>
  title.length <= 12 ? sizes[0] : title.length <= 24 ? sizes[1] : title.length <= 44 ? sizes[2] : sizes[3]

const footer = (left: string, host: string) =>
  el(
    'div',
    {
      marginTop: 'auto',
      justifyContent: 'space-between',
      paddingTop: 12,
      borderTop: `1px solid ${COLOR.rule}`,
      fontFamily: 'Mono',
      fontSize: 12,
      fontWeight: 500,
      color: COLOR.ink2,
    },
    el('div', {}, left),
    el('div', {}, host),
  )

const FACE_COLORS = ['#e3d3a8', '#c7cde0', '#e6c9b8', '#c9d6c3', '#d6cdbf']

/** Someone's photo, round, or their initial on a soft colour. Overlapping the one before, like a stack. */
function face(person: CardPerson & { data?: string | null }, index: number): Node {
  const ring = { width: 40, height: 40, borderRadius: 20, border: `2px solid ${COLOR.paper}`, marginLeft: index === 0 ? 0 : -8, flexShrink: 0 }
  if (person.data) return { type: 'img', props: { src: person.data, width: 40, height: 40, style: { ...ring, objectFit: 'cover' } } }
  const initial = [...person.name.trim()][0]?.toUpperCase() ?? '?'
  const color = FACE_COLORS[[...person.name].reduce((sum, c) => sum + c.codePointAt(0)!, 0) % FACE_COLORS.length]
  return el(
    'div',
    { ...ring, alignItems: 'center', justifyContent: 'center', background: color, fontFamily: 'Fraunces', fontSize: 17, fontWeight: 600, color: COLOR.ink },
    initial,
  )
}

/** A row of the group's card: its mark and label, then everyone's faces, "+3" past the first few. */
function row(mark: Node, label: string, people: (CardPerson & { data?: string | null })[]): Node {
  const shown = people.slice(0, FACES_SHOWN)
  const rest = people.length - shown.length
  return el(
    'div',
    { alignItems: 'center', minHeight: 64, borderTop: `1px solid ${COLOR.rule}` },
    el('div', { width: 188, alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }, mark, label),
    el(
      'div',
      { alignItems: 'center' },
      ...shown.map(face),
      rest > 0 &&
        el(
          'div',
          { height: 40, marginLeft: -8, padding: '0 10px', borderRadius: 20, border: `2px solid ${COLOR.paper}`, background: COLOR.well, alignItems: 'center', fontFamily: 'Mono', fontSize: 13, fontWeight: 600 },
          `+${rest}`,
        ),
    ),
  )
}

/** A photo as the card can hold it (a data address), or null to show the initial instead. */
async function photo(url: string | null, fetcher: typeof fetch): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(4000) })
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/^image\/(jpeg|png)$/.test(type)) {
      await response.body?.cancel()
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > 1_000_000) return null
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

async function layout(card: Card, host: string, fetcher: typeof fetch): Promise<[Node, number]> {
  const page = (height: number, ...children: Child[]) =>
    el('div', { width: WIDTH, height, flexDirection: 'column', padding: '22px 24px 20px', background: COLOR.paper, color: COLOR.ink, fontFamily: 'Sans' }, ...children)

  if (card.kind === 'morning') {
    const { song } = card
    return [
      page(
        220,
        masthead("Today's song", card.top),
        el(
          'div',
          { gap: 18, alignItems: 'center', paddingTop: 18 },
          sleeve(song, 104),
          el(
            'div',
            { flexDirection: 'column', gap: 4, flexGrow: 1, flexShrink: 1, minWidth: 0 },
            el('div', { fontFamily: 'Fraunces', fontSize: titleSize(song.title, [46, 36, 28, 22]), fontWeight: 600, lineHeight: 1.05 }, song.title),
            el('div', { fontSize: 14, color: COLOR.ink2 }, song.album),
            el(
              'div',
              { alignItems: 'center', gap: 10, marginTop: 6, fontFamily: 'Mono', fontSize: 14, fontWeight: 600 },
              el('div', { flexGrow: 1, height: 6, borderRadius: 3, background: COLOR.held }),
              song.length,
            ),
          ),
        ),
      ),
      220,
    ]
  }

  if (card.kind === 'everyone') {
    const title = card.song?.title ?? "today's song"
    const facts = [
      card.together && el('div', { flexDirection: 'column', gap: 2, flexGrow: 1, flexBasis: 0 }, el('div', { fontFamily: 'Fraunces', fontSize: 30, fontWeight: 600 }, card.together), el('div', { fontSize: 13, color: COLOR.ink2 }, 'of planking, together')),
      card.noBreak > 0 &&
        el(
          'div',
          { flexDirection: 'column', gap: 2, flexGrow: 1, flexBasis: 0 },
          el('div', { alignItems: 'center', gap: 8, fontFamily: 'Fraunces', fontSize: 30, fontWeight: 600 }, heldMark(20), card.noBreak.toLocaleString('en-US')),
          el('div', { fontSize: 13, color: COLOR.ink2 }, 'held it all the way through'),
        ),
    ].filter(Boolean) as Node[]
    // Tall enough for what's on it (a long title wraps under the number).
    const height = 206 + (title.length > 20 ? 22 : 0) + (facts.length > 0 ? 88 : 0) + (card.heat ? 64 : 0)
    return [
      page(
        height,
        masthead('How everyone did', card.top),
        el(
          'div',
          { alignItems: 'flex-end', gap: 14, padding: '18px 0 16px' },
          el('div', { fontFamily: 'Fraunces', fontSize: 76, fontWeight: 600, lineHeight: 0.9, letterSpacing: -3 }, card.planks.toLocaleString('en-US')),
          el(
            'div',
            { flexDirection: 'column', paddingBottom: 4, fontSize: 16, color: COLOR.ink2, flexShrink: 1 },
            el('div', { flexWrap: 'wrap', columnGap: 5 }, el('div', {}, 'planked'), el('div', { color: COLOR.ink, fontWeight: 600 }, title)),
            el('div', {}, 'today'),
          ),
        ),
        facts.length > 0 && el('div', { gap: 16, padding: '14px 0', borderTop: `1px solid ${COLOR.rule}` }, ...facts),
        card.heat &&
          el(
            'div',
            { flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: `1px solid ${COLOR.rule}` },
            el('div', { height: 10, background: COLOR.well }, ...card.heat.map((o) => el('div', { flexGrow: 1, flexBasis: 0, background: COLOR.ink, opacity: o }))),
            el('div', { fontSize: 13, color: COLOR.ink2 }, `Toughest stretch: around ${card.toughest}`),
          ),
        footer(`${card.planks.toLocaleString('en-US')} ${card.planks === 1 ? 'plank' : 'planks'} today`, host),
      ),
      height,
    ]
  }

  // A group's night: its streak, and everyone who planked on the row they finished in.
  const withPhotos = async (people: CardPerson[]) =>
    Promise.all(people.map(async (p, i) => ({ ...p, data: i < FACES_SHOWN ? await photo(p.photo, fetcher) : null })))
  const [held, planked] = await Promise.all([withPhotos(card.held), withPhotos(card.planked)])
  const count = card.held.length + card.planked.length
  const { song } = card
  // Tall enough for what's on it: a long title and a long group name each take a second line.
  const long = (song && song.title.length > 24 ? 20 : 0) + (card.group.length > 24 ? 14 : 0)
  const height = 214 + long + 64 * ((held.length > 0 ? 1 : 0) + (planked.length > 0 ? 1 : 0))
  return [
    page(
      height,
      masthead(card.group, card.top),
      el(
        'div',
        { justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '16px 0' },
        song
          ? el(
              'div',
              { gap: 14, alignItems: 'center', flexShrink: 1, minWidth: 0 },
              sleeve(song, 52),
              el(
                'div',
                { flexDirection: 'column', gap: 2, flexShrink: 1, minWidth: 0 },
                el('div', { fontFamily: 'Fraunces', fontSize: titleSize(song.title, [32, 26, 20, 16]), fontWeight: 600, lineHeight: 1.05 }, song.title),
                el('div', { fontSize: 13, color: COLOR.ink2 }, `${song.album} · ${song.length}`),
              ),
            )
          : el('div', { fontFamily: 'Fraunces', fontSize: 28, fontWeight: 600 }, "Today's song"),
        card.streak > 0 &&
          el(
            'div',
            { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
            el('div', { fontFamily: 'Fraunces', fontSize: 56, fontWeight: 600, lineHeight: 0.9, letterSpacing: -2 }, String(card.streak)),
            el(
              'div',
              { flexDirection: 'column', gap: 2, paddingBottom: 2, fontSize: 12, lineHeight: 1.15, color: COLOR.ink2 },
              icon(FLAME, 18, COLOR.signal),
              el('div', {}, 'day group'),
              el('div', {}, 'streak'),
            ),
          ),
      ),
      held.length > 0 && row(heldMark(18), 'All the way through', held),
      planked.length > 0 && row(plainMark(18), 'Planked it', planked),
      footer(`${count} planked today`, host),
    ),
    height,
  ]
}

// ——— Fonts ———

/** Every word on a card, for the fonts: only the letters used are fetched. */
function textOf(card: Card): string {
  const parts: string[] = [card.top, 'Today\'s song How everyone did planked today of planking, together held it all the way through Toughest stretch: around', '0123456789+:,.·']
  if (card.song) parts.push(card.song.title, card.song.album, card.song.short, card.song.length)
  if (card.kind === 'everyone') parts.push(card.together ?? '', card.toughest ?? '')
  if (card.kind === 'group') parts.push(card.group, 'day group streak All the way through Planked it', ...[...card.held, ...card.planked].map((p) => p.name))
  // Upper case too: the masthead is set in capitals.
  const all = parts.join(' ')
  return [...new Set(all + all.toUpperCase())].join('')
}

const FONTS: { name: string; family: string; weight: 400 | 500 | 600 }[] = [
  { name: 'Fraunces', family: 'Fraunces:opsz,wght@144,600', weight: 600 },
  { name: 'Sans', family: 'Instrument+Sans:wght@400', weight: 400 },
  { name: 'Sans', family: 'Instrument+Sans:wght@500', weight: 500 },
  { name: 'Sans', family: 'Instrument+Sans:wght@600', weight: 600 },
  { name: 'Mono', family: 'IBM+Plex+Mono:wght@500', weight: 500 },
  { name: 'Mono', family: 'IBM+Plex+Mono:wght@600', weight: 600 },
  // Names in other scripts: whatever the site's own faces don't have.
  { name: 'Fallback', family: 'Noto+Sans:wght@500', weight: 500 },
]

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: 'normal' }

/** The site's faces from Google Fonts, cut down to the letters on the card. */
async function fontsFor(text: string, fetcher: typeof fetch): Promise<Font[]> {
  const loaded = await Promise.all(
    FONTS.map(async ({ name, family, weight }) => {
      try {
        const css = await (await fetcher(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)).text()
        const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1]
        if (!url) return null
        const response = await fetcher(url)
        if (!response.ok) return null
        return { name, data: await response.arrayBuffer(), weight, style: 'normal' as const }
      } catch {
        return null
      }
    }),
  )
  const fonts = loaded.filter((f): f is Font => f !== null)
  if (!fonts.some((f) => f.name === 'Sans')) throw new Error('No fonts for the card')
  return fonts
}
