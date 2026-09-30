import { useState } from 'react'
import { accountsEnabled } from '../../lib/account'
import { dailySong } from '../../lib/daily'
import type { DayKey } from '../../lib/dates'
import { makeRoomCode } from '../../lib/live/code'
import { hashFor, navigate, togetherRoute, useRoute, type Route } from '../../lib/route'
import { Dialog } from '../Dialog'
import { SongLine } from '../SongRow'
import { SongPicker } from './SongPicker'

/** "Plank together": pick the song (today's, unless changed), then make a room and open its lobby. */
export function StartTogether({ today }: { today: DayKey }) {
  const route = useRoute()
  // The page it was opened on. Leaving that page (Back, or a room link) closes it: open on a hidden
  // page, it would stop the next one taking any taps.
  const [openOn, setOpenOn] = useState<Route | null>(null)
  const open = openOn !== null && hashFor(openOn) === hashFor(route)
  // Rooms run on Supabase Realtime: without accounts there's nowhere for them.
  if (!accountsEnabled) return null
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={() => setOpenOn(route)}>
        Plank together
      </button>
      <Dialog open={open} title="Plank together" onClose={() => setOpenOn(null)}>
        <MakeRoom today={today} onMade={() => setOpenOn(null)} />
      </Dialog>
    </>
  )
}

function MakeRoom({ today, onMade }: { today: DayKey; onMade: () => void }) {
  const todays = dailySong(today)
  const [song, setSong] = useState(todays)
  const [choosing, setChoosing] = useState(false)
  const make = () => {
    onMade()
    navigate(togetherRoute(makeRoomCode(), song.id))
  }
  return (
    <div className="make-room">
      <p className="fine make-room-which">{song.id === todays.id ? "Today's song" : 'Your pick'}</p>
      <SongLine song={song} />
      {choosing ? (
        <SongPicker
          onPick={(picked) => {
            setSong(picked)
            setChoosing(false)
          }}
        />
      ) : (
        <button type="button" className="btn btn-link make-room-other" onClick={() => setChoosing(true)}>
          Choose another
        </button>
      )}
      <p>
        Send the link to friends. Everyone who opens it planks this song with you, at the same moment. When anyone pauses,
        everyone pauses.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={make}>
          Make the link
        </button>
      </div>
    </div>
  )
}
