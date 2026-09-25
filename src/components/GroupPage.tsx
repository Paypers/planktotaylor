import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { askToSignIn, groupDiscord, leaveGroup, newGroupCode, removeFromGroup, renameGroup, useAccount, type Group } from '../lib/account'
import { addDays, fromDayKey, type DayKey } from '../lib/dates'
import {
  contributions,
  GROUP_NAME_LENGTH,
  groupStreak,
  groupToday,
  withMine,
  type BoardMember,
  type GroupToday,
} from '../lib/groups'
import { refreshGroups, useMyGroups } from '../lib/myGroups'
import type { Completion } from '../lib/progress'
import { followLink, GROUPS, hashFor, navigate } from '../lib/route'
import { FREEZES_PER_MONTH, MAX_MISSED_IN_A_ROW, streakInfo, type StreakInfo } from '../lib/streaks'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { InviteLink, problemOf } from './Groups'
import { Flame, HeldMark, Icon } from './Icon'
import { PageTop } from './PageTop'

type Order = 'joined' | 'name'

/** A change that's asked about first. */
type Asking = { what: 'leave' } | { what: 'new-link' } | { what: 'remove'; member: BoardMember }

interface Props {
  id: string
  today: DayKey
  completions: readonly Completion[]
}

/** A group's page: the group streak, who's planked today and everyone's streaks, and the group's invite link. */
export function GroupPage({ id, today, completions }: Props) {
  const { user } = useAccount()
  const { groups, boards, failed } = useMyGroups(today)
  const group = groups?.find((g) => g.id === id)
  const loaded = boards.get(id)
  const me = user?.id
  const board = useMemo(() => (loaded && me ? withMine(loaded, me, completions, today) : undefined), [loaded, me, completions, today])
  const [asking, setAsking] = useState<Asking | null>(null)
  const [error, setError] = useState<string | null>(null)

  const back = (
    <div className="grid">
      <a className="page-back" href={hashFor(GROUPS)} onClick={(e) => followLink(e, GROUPS)}>
        <Icon name="left" size={18} />
        Your groups
      </a>
    </div>
  )

  if (!user || !group) {
    return (
      <div className="info-page groups-page">
        {back}
        <PageTop title="Group" />
        <div className="grid">
          <div className="page-note">
            {!user ? (
              <>
                <p className="groups-lede">Sign in to see your groups.</p>
                <button type="button" className="btn btn-primary" onClick={askToSignIn}>
                  Sign in
                </button>
              </>
            ) : groups === undefined ? (
              <p className="fine">Loading the group…</p>
            ) : groups === null ? (
              <p className="settings-note">Groups aren't set up on this site yet.</p>
            ) : (
              <p className="groups-lede">
                {failed ? "Couldn't load the group. Try again in a moment." : "You're not in this group. It may have been left, or you were removed."}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const maker = group.made_by === user.id
  /** Makes a change, then shows the group as it is now. */
  const change = (work: () => Promise<unknown>, then?: () => void) => {
    setError(null)
    work()
      .then(() => refreshGroups())
      .then(then)
      .catch((e) => setError(problemOf(e)))
  }
  const confirm = () => {
    const now = asking
    setAsking(null)
    if (now?.what === 'leave') change(() => leaveGroup(group.id), () => navigate(GROUPS))
    if (now?.what === 'new-link') change(() => newGroupCode(group.id))
    if (now?.what === 'remove') change(() => removeFromGroup(group.id, now.member.user_id))
  }

  return (
    <div className="info-page groups-page">
      {back}
      <PageTop title={group.name} />
      {error && (
        <div className="grid">
          <p className="error page-note" role="alert">
            {error}
          </p>
        </div>
      )}

      {board ? (
        <>
          <GroupStreak group={group} board={board} today={today} />
          <Today group={group} board={board} me={user.id} today={today} onRemove={(member) => setAsking({ what: 'remove', member })} />
          {group.kind === 'public' && <ThisMonth board={board} today={today} />}
        </>
      ) : (
        <div className="grid">
          <p className="page-note fine">{failed ? "Couldn't load who's planked. Try again in a moment." : "Loading who's planked…"}</p>
        </div>
      )}

      <section className="section grid" aria-labelledby="group-invite">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="group-invite">Invite</h2>
          <p className="label-meta">Anyone with the link can join</p>
        </div>
        <div className="section-body">
          <InviteLink group={group} />
          {maker && (
            <div className="group-maker-link">
              <button type="button" className="btn btn-link" onClick={() => setAsking({ what: 'new-link' })}>
                Make a new link
              </button>
              <p className="fine">The old link stops working. Nobody in the group is removed.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section grid" aria-labelledby="group-itself">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="group-itself">The group</h2>
        </div>
        <div className="section-body">
          <PostedIn groupId={group.id} />
          {maker && <Rename group={group} onSave={(name) => change(() => renameGroup(group.id, name))} />}
          <div className="button-row">
            <button type="button" className="btn btn-secondary" onClick={() => setAsking({ what: 'leave' })}>
              Leave the group
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={asking !== null}
        title={
          asking?.what === 'leave'
            ? `Leave ${group.name}?`
            : asking?.what === 'new-link'
              ? 'Make a new invite link?'
              : `Remove ${asking?.member.name ?? 'them'}?`
        }
        confirmLabel={asking?.what === 'leave' ? 'Leave' : asking?.what === 'new-link' ? 'Make a new link' : 'Remove'}
        cancelLabel="Cancel"
        destructive={asking?.what !== 'new-link'}
        onConfirm={confirm}
        onCancel={() => setAsking(null)}
      >
        <p>
          {asking?.what === 'leave'
            ? group.members === 1
              ? "You're its last member, so the group goes too."
              : maker
                ? 'You can join again later from its invite link. Whoever joined first after you looks after the group.'
                : 'You can join again later from its invite link.'
            : asking?.what === 'new-link'
              ? "The link you've shared stops working, so only people you send the new one to can join."
              : "They can join again from the invite link they have, so make a new link too if they shouldn't."}
        </p>
      </ConfirmDialog>
    </div>
  )
}

const RULE_TAIL = `uses a freeze: ${FREEZES_PER_MONTH} a month, at most ${MAX_MISSED_IN_A_ROW} days in a row.`

/** The group's own streak, and what today still needs. */
function GroupStreak({ group, board, today }: { group: Group; board: BoardMember[]; today: DayKey }) {
  const streak = groupStreak(group.kind, board, today)
  const now = groupToday(group.kind, board, today)
  const saved =
    streak.current === 0 || !streak.frozen.has(addDays(today, -1))
      ? null
      : streak.frozen.has(addDays(today, -2))
        ? 'Freezes kept the group streak going the last two days.'
        : 'A freeze kept the group streak going yesterday.'
  return (
    <section className="section grid" aria-labelledby="group-streak">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="group-streak">Group streak</h2>
        <p className="label-meta">
          {group.kind === 'public' ? 'Public' : 'Private'} · {board.length} {board.length === 1 ? 'member' : 'members'}
        </p>
      </div>
      <div className="section-body group-streak">
        <div className="streak-big">
          <span className="streak-num">{streak.current}</span>
          <span className="streak-unit">
            <Flame size={22} lit={streak.doneToday} />
            day streak
          </span>
          {streak.current > 0 && (
            <span className="streak-freezes" title="Group streak freezes left this month">
              <Icon name="snowflake" size={18} />
              {streak.freezesLeft} left
              <span className="sr-only"> {streak.freezesLeft === 1 ? 'freeze' : 'freezes'} this month</span>
            </span>
          )}
        </div>
        <p className="streak-msg">{streakMessage(group.kind, streak, now)}</p>
        {saved && (
          <p className="streak-saved">
            <Icon name="snowflake" size={16} />
            {saved}
          </p>
        )}
        <p className="fine group-rule">
          {group.kind === 'public'
            ? `The group's day counts when anyone in it planks today's song. A day nobody does ${RULE_TAIL}`
            : `The group's day counts when everyone who joined before it has planked today's song. A day someone misses ${RULE_TAIL}`}
        </p>
      </div>
    </section>
  )
}

function streakMessage(kind: Group['kind'], streak: StreakInfo, now: GroupToday): string {
  if (streak.doneToday) {
    return kind === 'private' && now.planked > 1 ? "Everyone's planked today's song. Safe for today." : 'Safe for today.'
  }
  const cantFreeze = streak.lastChance ? " A freeze can't cover today." : ''
  if (kind === 'public' || now.waiting === 0) {
    // A public group, or a private one where nobody's needed yet (everyone joined today): one plank does it.
    return streak.current > 0 ? `One plank of today's song keeps it going.${cantFreeze}` : "One plank of today's song starts it."
  }
  const waiting = `Waiting on ${now.waiting === 1 ? 'one more' : `${now.waiting} more`} to plank today's song.`
  return streak.current > 0 ? `${waiting}${cantFreeze}` : `${waiting} A day everyone planks starts it.`
}

/** Who's planked today (a tick, green with no breaks) and everyone's own streak. Nothing here ranks anyone. */
function Today({
  group,
  board,
  me,
  today,
  onRemove,
}: {
  group: Group
  board: BoardMember[]
  me: string
  today: DayKey
  onRemove: (member: BoardMember) => void
}) {
  const [order, setOrder] = useState<Order>('joined')
  const now = groupToday(group.kind, board, today)
  // The board comes in the order they joined.
  const members = order === 'joined' ? board : [...board].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <section className="section grid" aria-labelledby="group-today">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="group-today">Today</h2>
        <p className="label-meta">
          {now.planked} of {now.members} planked
        </p>
      </div>
      <div className="section-body">
        {board.length > 1 && (
          <div className="split-toggle member-order" role="group" aria-label="Order members by">
            <button type="button" aria-pressed={order === 'joined'} onClick={() => setOrder('joined')}>
              Joined
            </button>
            <button type="button" aria-pressed={order === 'name'} onClick={() => setOrder('name')}>
              Name
            </button>
          </div>
        )}
        <ul className="member-list">
          {members.map((m) => (
            <Member
              key={m.user_id}
              member={m}
              you={m.user_id === me}
              madeIt={m.user_id === group.made_by}
              today={today}
              maker={group.made_by === me}
              onRemove={() => onRemove(m)}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}

function Member({
  member,
  you,
  madeIt,
  today,
  maker,
  onRemove,
}: {
  member: BoardMember
  you: boolean
  madeIt: boolean
  today: DayKey
  /** The one looking is the group's maker: Remove on everyone else. */
  maker: boolean
  onRemove: () => void
}) {
  const streak = streakInfo(new Set(member.days), today)
  const planked = member.days.includes(today)
  const notes = [you && 'you', madeIt && 'made the group', member.joined_on === today && 'joined today'].filter(Boolean).join(' · ')
  return (
    <li className="member-row">
      <Avatar name={member.name} url={member.avatar_url} size={36} />
      <span className="member-text">
        <span className="member-name">{member.name}</span>
        {notes && <span className="member-notes">{notes}</span>}
      </span>
      <span className="member-streak" title={`${member.name}'s streak`}>
        {streak.current > 0 && (
          <>
            <Flame size={16} lit={planked} />
            {streak.current}
            <span className="sr-only">-day streak</span>
          </>
        )}
      </span>
      <span className={planked ? 'member-today done' : 'member-today'}>
        {!planked ? (
          'Not yet'
        ) : member.clean_today ? (
          <span title="Planked today, no breaks">
            <HeldMark label="Planked today, no breaks" />
          </span>
        ) : (
          <span role="img" aria-label="Planked today" title="Planked today">
            <Icon name="check" size={18} />
          </span>
        )}
      </span>
      {maker &&
        (you ? (
          <span className="member-remove-space" />
        ) : (
          <button type="button" className="btn btn-link member-remove" onClick={onRemove} aria-label={`Remove ${member.name}`}>
            Remove
          </button>
        ))}
    </li>
  )
}

/** A public group's contributors this month: planks only, never breaks. */
function ThisMonth({ board, today }: { board: BoardMember[]; today: DayKey }) {
  const planked = contributions(board, today).filter((c) => c.days > 0)
  const month = fromDayKey(today).toLocaleDateString(undefined, { month: 'long' })
  return (
    <section className="section grid" aria-labelledby="group-month">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="group-month">This month</h2>
        <p className="label-meta">{month}</p>
      </div>
      <div className="section-body">
        {planked.length === 0 ? (
          <p className="groups-lede">Nobody's planked today's song yet this month.</p>
        ) : (
          <ol className="contributors">
            {planked.map(({ member, days }) => (
              <li key={member.user_id}>
                <Avatar name={member.name} url={member.avatar_url} size={28} />
                <span className="contributor-name">{member.name}</span>
                <span className="contributor-days">
                  {days} {days === 1 ? 'day' : 'days'}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="fine">Days each member planked today's song this month, since joining. It starts again on the 1st.</p>
      </div>
    </section>
  )
}

/**
 * The Discord channels that post the group each night (its streak, and who planked with their names and
 * photos), so every member knows. Nothing when none does.
 */
function PostedIn({ groupId }: { groupId: string }) {
  const [channels, setChannels] = useState<{ label: string; added_by: string }[]>([])
  useEffect(() => {
    let live = true
    groupDiscord(groupId)
      .then((found) => live && setChannels(found))
      .catch(() => live && setChannels([]))
    return () => {
      live = false
    }
  }, [groupId])
  if (channels.length === 0) return null
  return (
    <div className="posted-in">
      <p className="fine">Posted in Discord each night, with everyone's names and photos:</p>
      <ul>
        {channels.map((c, i) => (
          <li key={i}>
            {c.label} <span className="fine">· added by {c.added_by}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The maker's: a new name for the group. */
function Rename({ group, onSave }: { group: Group; onSave: (name: string) => void }) {
  const [name, setName] = useState(group.name)
  const tidy = name.trim()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (tidy && tidy !== group.name) onSave(tidy)
  }
  return (
    <form className="group-form group-rename" onSubmit={submit}>
      <label className="field">
        <span>Group name</span>
        <input className="input" value={name} maxLength={GROUP_NAME_LENGTH} required onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="button-row">
        <button type="submit" className="btn btn-secondary" disabled={!tidy || tidy === group.name}>
          Rename
        </button>
      </div>
    </form>
  )
}
