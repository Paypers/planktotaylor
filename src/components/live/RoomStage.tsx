import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Song } from '../../data/songs'
import type { RoomLink } from '../../lib/live/channel'
import type { DayKey } from '../../lib/dates'
import type { LiveLink, TogetherShare } from '../../lib/live/link'
import { togetherSession } from '../../lib/live/session'
import { heldThisRound, roomView, type Held } from '../../lib/live/view'
import { getData } from '../../lib/store'
import type { PlankSession } from '../PlankTimer'
import { Lobby } from './Lobby'
import { RoundOver } from './RoundOver'
import { Watching } from './Watching'

interface Props {
  link: RoomLink
  code: string
  song: Song
  today: DayKey
  renderPlank: (session: PlankSession, link: LiveLink, onClose: () => void) => ReactNode
  onShareTogether: (share: TogetherShare) => void
}

/** The room: the lobby, a round on, or how it went, with this device's plank screen over it for each round it's in. */
export function RoomStage({ link, code, song, today, renderPlank, onShareTogether }: Props) {
  const state = useSyncExternalStore(link.subscribe, link.getState)
  const members = useSyncExternalStore(link.subscribe, link.getMembers)
  const here = link.startedHere()
  const live = state.phase === 'countdown' || state.phase === 'running' || state.phase === 'paused'
  const [plank, setPlank] = useState<{ round: number; session: PlankSession } | null>(null)
  const opened = useRef(0)

  const [held, setHeld] = useState<Held>({ round: state.round, members: [] })
  const nowHeld = heldThisRound(held, state.round, members)
  if (nowHeld !== held) setHeld(nowHeld)

  // A round that started with this device in the room opens its plank screen, once. What it counts for
  // is worked out as it starts, so finishing it can't change it midway.
  useEffect(() => {
    if (!live || here !== state.round || opened.current === here) return
    opened.current = here
    link.setStatus('planking')
    setPlank({ round: here, session: togetherSession(song, getData(), today) })
  }, [live, here, state.round, link, song, today])

  const closePlank = () => {
    // Closed before the end: stepped out of this round.
    if (link.getMembers().find((m) => m.id === link.me)?.status !== 'done') link.setStatus('out')
    setPlank(null)
  }

  const view = roomView(state.phase, members.find((m) => m.id === link.me)?.status)
  return (
    <>
      {view === 'lobby' && <Lobby link={link} members={members} code={code} song={song} />}
      {view === 'watching' && <Watching link={link} state={state} members={members} song={song} />}
      {view === 'results' && (
        <RoundOver
          link={link}
          members={members}
          finishers={nowHeld.members}
          state={state}
          song={song}
          today={today}
          onShareTogether={onShareTogether}
        />
      )}
      {plank?.round === state.round && <Fragment key={plank.round}>{renderPlank(plank.session, link, closePlank)}</Fragment>}
    </>
  )
}
