import { useAccount } from '../lib/account'
import type { DayKey } from '../lib/dates'
import { useMyGroups } from '../lib/myGroups'
import { usePlankingNow, useWatchGroupsPlanking } from '../lib/plankingNow/channels'
import { followLink, GROUPS, hashFor } from '../lib/route'
import { Icon } from './Icon'

/**
 * Groups, in the header on every page, with a count when anyone in your groups is planking now. It also
 * keeps your groups watched for the rest of the site, since the header is always there.
 */
export function GroupsLink({ today, current }: { today: DayKey; current: boolean }) {
  const { user } = useAccount()
  const { groups } = useMyGroups(today)
  useWatchGroupsPlanking(groups?.map((g) => g.id) ?? [], user?.id ?? null)
  const { total } = usePlankingNow()
  return (
    <a
      href={hashFor(GROUPS)}
      className="icon-btn groups-link"
      onClick={(e) => followLink(e, GROUPS)}
      aria-label={total > 0 ? `Groups: ${total} planking now` : 'Groups'}
      aria-current={current ? 'page' : undefined}
    >
      <Icon name="users" />
      {total > 0 && (
        <span className="planking-badge" aria-hidden="true">
          {total}
        </span>
      )}
    </a>
  )
}
