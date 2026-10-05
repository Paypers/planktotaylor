import { useAccount } from '../lib/account'
import type { DayKey } from '../lib/dates'
import { friendStatus } from '../lib/friends'
import { useMyFriends } from '../lib/myFriends'
import { useMyGroups } from '../lib/myGroups'
import { usePlankingNow, useWatchGroupsPlanking } from '../lib/plankingNow/channels'
import { FRIENDS, followLink, GROUPS, hashFor, type Route } from '../lib/route'
import { Icon } from './Icon'

/**
 * Friends and Groups, as tabs across the top of every page, as on Discord: beside the site's name on a computer, on
 * their own row under it on a phone (styles.css). Always there and always in the same place, whatever's loaded.
 * Friends shows how many are online (a green dot) and, in red, the requests and invites waiting; Groups, how many
 * in your groups are planking now. Groups also keeps your groups watched for the rest of the site.
 */
export function SiteTabs({ today, page }: { today: DayKey; page: Route['page'] }) {
  const { user } = useAccount()
  const { now } = useMyFriends(today)
  const { groups } = useMyGroups(today)
  useWatchGroupsPlanking(groups?.map((g) => g.id) ?? [], user?.id ?? null)
  const { total: planking } = usePlankingNow()

  const online = now ? now.friends.filter((f) => friendStatus(f) !== 'offline').length : 0
  const requests = now?.requests_in.length ?? 0
  const invites = now?.invites.length ?? 0
  const waiting = requests + invites
  const friendsSaid = [
    online > 0 && `${online} online`,
    invites > 0 && `${invites} ${invites === 1 ? 'invite' : 'invites'}`,
    requests > 0 && `${requests} ${requests === 1 ? 'request' : 'requests'} waiting`,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <nav className="site-tabs" aria-label="Friends and groups">
      <a
        href={hashFor(FRIENDS)}
        className="site-tab"
        onClick={(e) => followLink(e, FRIENDS)}
        aria-label={friendsSaid ? `Friends: ${friendsSaid}` : 'Friends'}
        aria-current={page === 'friends' || page === 'friend' ? 'page' : undefined}
      >
        <Icon name="smile" size={18} />
        Friends
        {online > 0 && (
          <span className="site-tab-online" aria-hidden="true">
            {online}
          </span>
        )}
        {waiting > 0 && (
          <span className="friends-tab-badge" aria-hidden="true">
            {waiting}
          </span>
        )}
      </a>
      <a
        href={hashFor(GROUPS)}
        className="site-tab"
        onClick={(e) => followLink(e, GROUPS)}
        aria-label={planking > 0 ? `Groups: ${planking} planking now` : 'Groups'}
        aria-current={page === 'groups' || page === 'group' ? 'page' : undefined}
      >
        <Icon name="users" size={18} />
        Groups
        {planking > 0 && (
          <span className="site-tab-planking" aria-hidden="true">
            {planking}
          </span>
        )}
      </a>
    </nav>
  )
}
