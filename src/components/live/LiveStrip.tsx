import type { LiveMember, LiveStatus } from '../../lib/live/link'
import { byJoined } from '../../lib/live/strip'
import { Icon } from '../Icon'

// Read out after each name. In the lobby they're just here.
const SAID: Record<LiveStatus, string> = { lobby: '', planking: 'planking', done: 'done', out: 'stepped out' }

/**
 * Everyone in the room, on the plank screen: planking, ✓ once they're done, faded if they've stepped out.
 * Never their breaks. First, while the connection's being made again, a quiet note: the plank carries on.
 */
export function LiveStrip({ members, me, reconnecting }: { members: readonly LiveMember[]; me: string; reconnecting: boolean }) {
  return (
    <ul className="live-strip" aria-label="Planking together">
      {reconnecting && <li className="live-reconnecting">Reconnecting…</li>}
      {byJoined(members).map((member) => (
        <li key={member.id} className={`live-chip is-${member.status}`}>
          {member.status === 'planking' && <span className="live-dot" aria-hidden="true" />}
          {member.status === 'done' && <Icon name="check" size={14} />}
          <bdi>{member.id === me ? 'You' : member.name}</bdi>
          {SAID[member.status] && <span className="sr-only">, {SAID[member.status]}</span>}
        </li>
      ))}
    </ul>
  )
}
