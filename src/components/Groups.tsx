import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  askToSignIn,
  createGroup,
  GroupError,
  groupInvite,
  joinGroup,
  leaveGroup,
  loadBoard,
  loadGroups,
  saveDisplayName,
  useAccount,
  type Group,
} from '../lib/account'
import type { DayKey } from '../lib/dates'
import {
  forgetInvite,
  GROUP_NAME_LENGTH,
  GROUPS_EACH,
  inviteCode,
  keepInvite,
  type BoardMember,
  type GroupKind,
  type GroupProblem,
  type Invite,
} from '../lib/groups'
import { followLink, GROUPS, hashFor, navigate } from '../lib/route'
import { siteLink } from '../lib/share'
import { streakInfo } from '../lib/streaks'
import { Avatar } from './Avatar'
import { ConfirmDialog } from './ConfirmDialog'
import { PageTop } from './PageTop'

const PROBLEMS: Record<GroupProblem, string> = {
  'sign-in': 'Sign in first.',
  name: "Add your name first: it's how the group sees you.",
  'too-many': `You're in ${GROUPS_EACH} groups already, the most each. Leave one to join another.`,
  full: 'This group is full: 50 members is the most.',
  'not-found': "This invite link doesn't work any more. Ask for a new one.",
  'not-maker': 'Only the person who made the group can do that.',
  unavailable: "Couldn't reach the site just now. Try again in a moment.",
}

const problemOf = (error: unknown) => PROBLEMS[error instanceof GroupError ? error.problem : 'unavailable']

/** A group's invite link. */
export const inviteLink = (code: string) => `${siteLink()}#join/${code}`

const KINDS: { kind: GroupKind; label: string; about: string }[] = [
  {
    kind: 'private',
    label: 'Private',
    about: "The group's day counts when everyone has planked today's song. Only members see the group.",
  },
  {
    kind: 'public',
    label: 'Public',
    about: "The group's day counts when anyone has. Anyone with its link can see its name, its streak, and who's planked this month.",
  },
]

/** Your groups: each with its members, an invite link and a way out, and a form to make one. */
export function GroupsPage({ today }: { today: DayKey }) {
  const { user } = useAccount()
  /** Undefined while loading; null when the site doesn't have groups yet. */
  const [groups, setGroups] = useState<Group[] | null | undefined>(undefined)
  const [boards, setBoards] = useState<ReadonlyMap<string, BoardMember[]>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<Group | null>(null)

  const reload = useCallback(async () => {
    try {
      const found = await loadGroups()
      setGroups(found)
      setError(null)
      if (!found) return
      const loaded = await Promise.all(found.map(async (g) => [g.id, await loadBoard(g.id, today).catch(() => [])] as const))
      setBoards(new Map(loaded))
    } catch {
      setError("Couldn't load your groups. Try again in a moment.")
      setGroups((g) => g ?? [])
    }
  }, [today])

  useEffect(() => {
    if (user) void reload()
  }, [user, reload])

  const leave = () => {
    const group = leaving
    setLeaving(null)
    if (!group) return
    leaveGroup(group.id)
      .then(reload)
      .catch((e) => setError(problemOf(e)))
  }

  return (
    <div className="info-page groups-page">
      <PageTop title="Groups" />
      {!user ? (
        <section className="section grid" aria-labelledby="groups-signed-out">
          <div className="section-rule" />
          <div className="section-label">
            <h2 id="groups-signed-out">Plank together</h2>
          </div>
          <div className="section-body">
            <p className="groups-lede">
              Make a group with friends, or join one from an invite link, and see who's planked today's song. Groups are
              for signed-in players.
            </p>
            <button type="button" className="btn btn-primary" onClick={askToSignIn}>
              Sign in
            </button>
          </div>
        </section>
      ) : groups === undefined ? (
        <p className="grid fine">Loading your groups…</p>
      ) : groups === null ? (
        <p className="grid settings-note">Groups aren't set up on this site yet.</p>
      ) : (
        <>
          <section className="section grid" aria-labelledby="groups-yours">
            <div className="section-rule" />
            <div className="section-label">
              <h2 id="groups-yours">Your groups</h2>
              <p className="label-meta">
                {groups.length} of {GROUPS_EACH}
              </p>
            </div>
            <div className="section-body">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {groups.length === 0 ? (
                <p className="groups-lede">No groups yet. Make one below, or open an invite link a friend sent you.</p>
              ) : (
                <ul className="group-list">
                  {groups.map((group) => (
                    <GroupCard key={group.id} group={group} board={boards.get(group.id)} me={user.id} onLeave={() => setLeaving(group)} />
                  ))}
                </ul>
              )}
            </div>
          </section>
          {groups.length < GROUPS_EACH && <MakeGroup today={today} onMade={reload} />}
          <WhatTheySee />
        </>
      )}

      <ConfirmDialog
        open={leaving !== null}
        title={`Leave ${leaving?.name ?? 'this group'}?`}
        confirmLabel="Leave"
        cancelLabel="Stay"
        destructive
        onConfirm={leave}
        onCancel={() => setLeaving(null)}
      >
        <p>
          {leaving?.members === 1
            ? "You're its last member, so the group goes too."
            : 'You can join again later from its invite link.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}

function GroupCard({ group, board, me, onLeave }: { group: Group; board: BoardMember[] | undefined; me: string; onLeave: () => void }) {
  return (
    <li className="group-card">
      <div className="group-head">
        <h3>{group.name}</h3>
        <p className="group-meta">
          {group.kind === 'public' ? 'Public' : 'Private'} · {group.members} {group.members === 1 ? 'member' : 'members'}
        </p>
      </div>
      {board && (
        <ul className="group-members" aria-label={`${group.name}'s members`}>
          {board.map((m) => (
            <li key={m.user_id} className="member-chip">
              <Avatar name={m.name} url={m.avatar_url} size={28} />
              <span>
                {m.name}
                {m.user_id === me && <span className="fine"> (you)</span>}
                {m.user_id === group.made_by && <span className="fine"> · made it</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <InviteLink group={group} />
      <div className="button-row">
        <button type="button" className="btn btn-link" onClick={onLeave}>
          Leave
        </button>
      </div>
    </li>
  )
}

/** The group's invite link, to share or copy: anyone who has it can join. */
function InviteLink({ group }: { group: Group }) {
  const [copied, setCopied] = useState(false)
  const link = inviteLink(group.invite_code)
  const text = `Plank with us: join ${group.name} on Plank to Taylor.`
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, text, url: link })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`)
      setCopied(true)
    } catch {
      // The link is on screen to copy by hand.
    }
  }
  return (
    <div className="invite-link">
      <label className="field">
        <span>Invite link</span>
        <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} />
      </label>
      <div className="button-row">
        <button type="button" className="btn btn-secondary" onClick={() => void share()}>
          Share invite
        </button>
        {copied && (
          <span className="fine" role="status">
            Copied.
          </span>
        )}
      </div>
    </div>
  )
}

/** A name to show the group, asked for when the player hasn't chosen one. */
function useGroupName() {
  const { profile } = useAccount()
  const [name, setName] = useState('')
  const needed = !profile.name
  /** Saves the name first, if one was needed. */
  const ready = async () => {
    if (needed) await saveDisplayName(name)
  }
  const field = needed ? (
    <label className="field">
      <span>Your name, as the group sees it</span>
      <input className="input" value={name} maxLength={40} autoComplete="nickname" required onChange={(e) => setName(e.target.value)} />
    </label>
  ) : null
  return { field, ready, missing: needed && name.trim() === '' }
}

function MakeGroup({ today, onMade }: { today: DayKey; onMade: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<GroupKind>('private')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<string | null>(null)
  const you = useGroupName()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMade(null)
    you
      .ready()
      .then(() => createGroup(name, kind, today))
      .then(async (group) => {
        setName('')
        setMade(group.name)
        await onMade()
      })
      .catch((e) => setError(problemOf(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className="section grid" aria-labelledby="groups-make">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="groups-make">Make a group</h2>
      </div>
      <form className="section-body group-form" onSubmit={submit}>
        {you.field}
        <label className="field">
          <span>Group name</span>
          <input className="input" value={name} maxLength={GROUP_NAME_LENGTH} required onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="kind-choice">
          <legend>Kind</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className="kind-option">
              <input type="radio" name="group-kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              <span>
                <strong>{k.label}</strong>
                <span className="fine">{k.about}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="fine">The kind can't be changed later, so the group streak always means the same thing.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {made && (
          <p className="settings-note" role="status">
            {made} is made. Share its invite link to bring people in.
          </p>
        )}
        <div className="button-row">
          <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === '' || you.missing}>
            {busy ? 'Making…' : 'Make the group'}
          </button>
        </div>
      </form>
    </section>
  )
}

/** Exactly what a group sees of each member, on the groups page and before joining. */
function WhatTheySee() {
  return (
    <section className="section grid" aria-labelledby="groups-see">
      <div className="section-rule" />
      <div className="section-label">
        <h2 id="groups-see">What the group sees of you</h2>
      </div>
      <dl className="section-body rules">
        <dt>You</dt>
        <dd>Your name and photo.</dd>
        <dt>Your planks</dt>
        <dd>
          The days you planked today's song, for your streak and the group's, and whether today's was held with no breaks
          (🟩). Never your breaks, your XP, your ladder or your plank history.
        </dd>
        <dt>Public groups</dt>
        <dd>
          Anyone with a public group's link, signed in or not, can see its name, its streak, and each member's name, photo
          and how many days they planked this month.
        </dd>
      </dl>
    </section>
  )
}

/** An invite link: what the group is, and a way in. Signed out, it's kept through signing in. */
export function JoinPage({ code, today }: { code: string; today: DayKey }) {
  const { user } = useAccount()
  const valid = inviteCode(code)
  /** Undefined while loading; null for a link that isn't anyone's. */
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const you = useGroupName()

  useEffect(() => {
    if (!valid) {
      setInvite(null)
      return
    }
    let live = true
    setInvite(undefined)
    groupInvite(valid, today)
      .then((found) => live && setInvite(found))
      .catch((e) => live && setError(problemOf(e)))
    return () => {
      live = false
    }
  }, [valid, today, user])

  useEffect(() => {
    // Signed out: kept for when sign-in brings them back to the front page.
    if (valid && !user && invite) keepInvite(valid)
    if (invite === null || invite?.id) forgetInvite()
  }, [valid, user, invite])

  const join = () => {
    if (!valid) return
    setBusy(true)
    setError(null)
    you
      .ready()
      .then(() => joinGroup(valid, today))
      .then(() => {
        forgetInvite()
        navigate(GROUPS)
      })
      .catch((e) => setError(problemOf(e)))
      .finally(() => setBusy(false))
  }

  const title = invite?.name ?? 'Join a group'
  return (
    <div className="info-page groups-page">
      <PageTop title={invite === undefined ? 'Join a group' : title} />
      <section className="section grid" aria-labelledby="join-heading">
        <div className="section-rule" />
        <div className="section-label">
          <h2 id="join-heading">{invite?.kind === 'public' ? 'Public group' : 'Group invite'}</h2>
          {invite?.name && (
            <p className="label-meta">
              {invite.members} {invite.members === 1 ? 'member' : 'members'}
            </p>
          )}
        </div>
        <div className="section-body">
          {error ? null : invite === undefined ? (
            <p className="fine">Opening the invite…</p>
          ) : invite === null ? (
            <p className="groups-lede">This invite link doesn't work. It may be an old one: ask for a new one.</p>
          ) : (
            <>
              {invite && <InviteDetails invite={invite} today={today} />}
              {invite?.id ? (
                <p className="groups-lede">
                  You're in this group.{' '}
                  <a href={hashFor(GROUPS)} onClick={(e) => followLink(e, GROUPS)}>
                    Your groups
                  </a>
                </p>
              ) : !user ? (
                <>
                  <p className="groups-lede">
                    {invite?.name ? "You've been invited to join." : "You've been invited to a group on Plank to Taylor."} Groups are
                    for signed-in players: sign in, and you'll come back here to join.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={askToSignIn}>
                    Sign in to join this group
                  </button>
                </>
              ) : (
                <div className="group-form">
                  {you.field}
                  <div className="button-row">
                    <button type="button" className="btn btn-primary" onClick={join} disabled={busy || you.missing}>
                      {busy ? 'Joining…' : `Join ${invite?.name ?? 'the group'}`}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
      <WhatTheySee />
    </div>
  )
}

/** What a public group's link shows: its streak and this month's contributors. A private one's, only how it works. */
function InviteDetails({ invite, today }: { invite: Invite; today: DayKey }) {
  if (!invite.name) return null
  if (invite.kind === 'private') {
    return <p className="groups-lede">A private group: its day counts when everyone in it has planked today's song.</p>
  }
  const streak = streakInfo(new Set(invite.days ?? []), today).current
  const planked = (invite.contributors ?? []).filter((c) => c.days > 0)
  return (
    <div className="invite-details">
      <p className="groups-lede">
        {streak > 0 ? `A ${streak}-day group streak. ` : ''}The group's day counts when anyone in it planks today's song.
      </p>
      {planked.length > 0 && (
        <>
          <h3 className="invite-subhead">This month</h3>
          <ol className="contributors">
            {planked.map((c, i) => (
              <li key={i}>
                <Avatar name={c.name} url={c.avatar_url} size={28} />
                <span className="contributor-name">{c.name}</span>
                <span className="contributor-days">
                  {c.days} {c.days === 1 ? 'day' : 'days'}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}
