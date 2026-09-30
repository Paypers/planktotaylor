import { dailyNumber } from '../daily'
import { plankBar, plankSummary, siteLink } from '../share'
import type { TogetherShare } from './link'
import { cleanName } from './name'

// The room's share as text: one for the whole room, naming everyone who held to the end.
// Never who stopped or who paused.

// Names listed in full in the text. Past this, the first few and "and N more".
const TEXT_NAMES = 8
const NAMES_BEFORE_MORE = 3

/** The names worth showing (blank ones dropped), and how many held to the end in all. */
export function finisherNames(finishers: readonly string[]): { names: string[]; count: number } {
  return { names: finishers.map(cleanName).filter(Boolean), count: finishers.length }
}

/** "Ana", "Ana and Ben", "Ana, Ben and Cleo", or past TEXT_NAMES, "Ana, Ben, Cleo and 6 more". */
export function namesList(finishers: readonly string[]): string {
  const { names, count } = finisherNames(finishers)
  const shown = count > TEXT_NAMES ? names.slice(0, NAMES_BEFORE_MORE) : names
  const more = count - shown.length
  const items = more > 0 ? [...shown, `${more} more`] : shown
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : (items[0] ?? '')
}

/** The room's share as text: the song, how many held to the end, the room's bar, the names and the link. */
export function togetherText({ song, day, finishers, pauses }: TogetherShare): string {
  const count = finishers.length
  // One alone might have had company who stopped early, so this never says "just me" or "1 of us".
  return [
    `Plank to Taylor #${dailyNumber(day)} · ${count === 1 ? 'Planked it' : 'Planked together'}`,
    count > 1 ? `${song.title} · ${count} people` : song.title,
    plankBar(pauses, song.seconds),
    plankSummary(pauses, song.seconds),
    namesList(finishers),
    `Plank along: ${siteLink()}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** The card's alt text. */
export function togetherAlt({ song, finishers, pauses }: TogetherShare): string {
  const names = namesList(finishers)
  const who = names ? `${finishers.length === 1 ? 'planked by' : 'planked together by'} ${names}` : 'planked together'
  return `${song.title}, ${who}: ${plankSummary(pauses, song.seconds)}.`
}
