import { useState, type FormEvent } from 'react'
import type { Song } from '../../data/songs'
import { cleanName, NAME_LENGTH, rememberedName, rememberName } from '../../lib/live/name'
import { unlockAudio } from '../../lib/sound'
import { SongLine } from '../SongRow'

interface Props {
  song: Song
  /** A signed-in player's name, or ''. */
  defaultName: string
  onJoin: (name: string) => void
}

/** Before joining: the song, and the name the room sees. Join is the tap that lets this phone play sounds. */
export function JoinRoom({ song, defaultName, onJoin }: Props) {
  const [name, setName] = useState(() => defaultName || rememberedName())
  // A name that arrives after the page (the account loading) fills the field, if it's still empty.
  const [shownDefault, setShownDefault] = useState(defaultName)
  if (defaultName !== shownDefault) {
    setShownDefault(defaultName)
    if (!name) setName(defaultName)
  }
  const tidy = cleanName(name)

  const join = (event: FormEvent) => {
    event.preventDefault()
    if (!tidy) return
    unlockAudio()
    if (!defaultName) rememberName(tidy)
    onJoin(tidy)
  }

  return (
    <section className="section grid" aria-labelledby="live-join">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="live-join">Join the room</h2>
        <p className="label-meta">Anyone with the link can join</p>
      </div>
      <div className="section-body live-join">
        <SongLine song={song} />
        <p className="groups-lede live-lede">
          Plank to it with everyone in the room, at the same moment. When anyone pauses, everyone pauses.
        </p>
        <form className="group-form" onSubmit={join}>
          <label className="field">
            <span>Your name, as the room sees it</span>
            <input
              className="input"
              value={name}
              maxLength={NAME_LENGTH}
              autoComplete="nickname"
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={!tidy}>
              Join
            </button>
          </div>
        </form>
        <p className="fine">Your plank counts just as it would on your own.</p>
      </div>
    </section>
  )
}
