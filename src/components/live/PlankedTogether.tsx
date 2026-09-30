import { useState } from 'react'
import type { LiveMember } from '../../lib/live/link'
import { addFinishers } from '../../lib/live/strip'
import { Icon } from '../Icon'

/** On the finished screen: everyone who's held to the end so far, ticked as they finish. Never who stopped. */
export function PlankedTogether({ members, me }: { members: readonly LiveMember[]; me: string }) {
  const [finishers, setFinishers] = useState<readonly LiveMember[]>([])
  // Kept as they come in, so someone who finishes and then leaves the room stays listed.
  const listed = addFinishers(finishers, members)
  if (listed !== finishers) setFinishers(listed)
  return (
    <section className="done-together" aria-labelledby="done-together-heading">
      <h3 id="done-together-heading">Planked together</h3>
      <ul className="done-together-names" aria-live="polite">
        {listed.map((member) => (
          <li key={member.id}>
            <Icon name="check" size={16} />
            <bdi>{member.id === me ? 'You' : member.name}</bdi>
          </li>
        ))}
      </ul>
    </section>
  )
}
