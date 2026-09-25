import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  addDiscordWebhook,
  askToSignIn,
  changeDiscordGroup,
  changeDiscordZone,
  DiscordAddError,
  discordPreview,
  loadDiscordWebhooks,
  removeDiscordWebhook,
  useAccount,
  type DiscordWebhook,
  type Group,
} from '../../lib/account'
import { clockTime } from '../../lib/dates'
import { LABEL_LENGTH, MORNING_POST, NIGHT_POST, WEBHOOKS_EACH, webhookAddress, zoneName, type AddProblem } from '../../lib/discord'
import { useToday } from '../../lib/hooks'
import { useMyGroups } from '../../lib/myGroups'
import { ConfirmDialog } from '../ConfirmDialog'

const PROBLEMS: Record<AddProblem | 'unavailable', string> = {
  'sign-in': 'Your sign-in has run out. Sign in again, then try once more.',
  'bad-address': "That isn't a webhook address. In Discord, use Copy Webhook URL: it starts https://discord.com/api/webhooks/.",
  'bad-zone': 'Pick a time zone from the list.',
  'not-found': 'Discord doesn\'t know that webhook. It may have been deleted: copy the address again from Discord.',
  'channel-taken': 'That channel already gets the daily post.',
  'too-many': `You have ${WEBHOOKS_EACH} channels already, the most each. Remove one to add another.`,
  'too-many-today': "That's as many as you can add today. Try again tomorrow.",
  busy: 'Lots of servers have signed up in the last hour. Try again in a little while.',
  'discord-down': "Couldn't reach Discord just now. Try again in a moment.",
  unavailable: "The daily post isn't available right now. Try again later.",
}

const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone

/** Every time zone this browser knows, with any that are already chosen. */
function timeZones(chosen: string[]): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return [...new Set([...known, HERE, ...chosen])].sort()
}

/** "America/Argentina/Buenos_Aires" → "America / Argentina / Buenos Aires". */
const zoneOption = (zone: string) => zone.replace(/_/g, ' ').replace(/\//g, ' / ')

/** When the posts go, in the server's time. */
const postTimes = (zone: string) => `${clockTime(MORNING_POST)} and ${clockTime(NIGHT_POST)}, ${zoneName(zone)} time`

/** Settings → Discord: a daily post in a Discord server, through a channel's webhook. */
export function DiscordSettings() {
  const { user } = useAccount()
  /** Null when the site doesn't have the post yet (schema.sql not run). */
  const [webhooks, setWebhooks] = useState<DiscordWebhook[] | null>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [zone, setZone] = useState(HERE)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [removing, setRemoving] = useState<DiscordWebhook | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const zones = useMemo(() => timeZones((webhooks ?? []).map((w) => w.time_zone)), [webhooks])
  const today = useToday()
  const { groups } = useMyGroups(today)
  // The groups a channel can post: public ones the player's in, and private ones they made. Null while loading.
  const postable = groups === undefined ? null : (groups ?? []).filter((g) => g.kind === 'public' || g.made_by === user?.id)

  useEffect(() => {
    if (!user) return
    let live = true
    setLoading(true)
    setLoadError(false)
    loadDiscordWebhooks()
      .then((found) => live && setWebhooks(found))
      .catch(() => live && setLoadError(true))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [user])

  if (!user) {
    return (
      <section className="settings-group" aria-labelledby="discord-heading">
        <h3 id="discord-heading">Daily post in your server</h3>
        <p>
          Plank to Taylor can post in a Discord server every day: today's song in the morning, and how everyone did at
          night. Adding it is for signed-in players, so you can remove it again later.
        </p>
        <div>
          <button type="button" className="btn btn-primary" onClick={askToSignIn}>
            Sign in
          </button>
        </div>
      </section>
    )
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    setProblem(null)
    setAdded(null)
    // Checked here first, so a slip never leaves the site.
    if (!webhookAddress(url)) {
      setProblem(PROBLEMS['bad-address'])
      return
    }
    setAdding(true)
    addDiscordWebhook(url, zone, label)
      .then((webhook) => {
        setWebhooks((list) => [...(list ?? []), webhook])
        setUrl('')
        setLabel('')
        setAdded(webhook.label)
      })
      .catch((error) => setProblem(PROBLEMS[error instanceof DiscordAddError ? error.problem : 'unavailable']))
      .finally(() => setAdding(false))
  }

  const changeZone = (webhook: DiscordWebhook, timeZone: string) => {
    const before = webhooks
    setWebhooks((list) => list?.map((w) => (w.id === webhook.id ? { ...w, time_zone: timeZone } : w)) ?? null)
    setRowError(null)
    changeDiscordZone(webhook.id, timeZone).catch(() => {
      setWebhooks(before)
      setRowError("Couldn't change the time zone. Try again in a moment.")
    })
  }

  const changeGroup = (webhook: DiscordWebhook, groupId: string | null) => {
    const before = webhooks
    setWebhooks((list) => list?.map((w) => (w.id === webhook.id ? { ...w, group_id: groupId } : w)) ?? null)
    setRowError(null)
    changeDiscordGroup(webhook.id, groupId).catch(() => {
      setWebhooks(before)
      setRowError("Couldn't change what it posts. Try again in a moment.")
    })
  }

  const remove = () => {
    const webhook = removing
    setRemoving(null)
    if (!webhook) return
    setRowError(null)
    setAdded(null)
    removeDiscordWebhook(webhook.id)
      .then(() => setWebhooks((list) => list?.filter((w) => w.id !== webhook.id) ?? null))
      .catch(() => setRowError(`Couldn't remove ${webhook.label}. Try again in a moment.`))
  }

  const full = (webhooks?.length ?? 0) >= WEBHOOKS_EACH

  return (
    <>
      <section className="settings-group" aria-labelledby="discord-heading" aria-busy={loading}>
        <h3 id="discord-heading">Daily post in your server</h3>
        <p>
          Add a channel and Plank to Taylor posts there every day: today's song at {clockTime(MORNING_POST)}, and how
          everyone did at {clockTime(NIGHT_POST)}, in the server's time zone. There's nothing to install.
        </p>

        {loading ? (
          <p className="fine">Checking your channels…</p>
        ) : loadError ? (
          <p className="error" role="alert">
            Couldn't load your channels. Try again in a moment.
          </p>
        ) : webhooks === null ? (
          <p className="settings-note">The daily post isn't set up on this site yet.</p>
        ) : (
          webhooks.length > 0 && (
            <ul className="webhooks" aria-label="Your channels">
              {webhooks.map((webhook) => (
                <li key={webhook.id} className="webhook">
                  <div className="webhook-top">
                    <div className="webhook-text">
                      <span className="webhook-name">{webhook.label}</span>
                      <span className="fine">Posts at {postTimes(webhook.time_zone)}</span>
                    </div>
                    <button type="button" className="btn btn-secondary" onClick={() => setRemoving(webhook)}>
                      Remove<span className="sr-only"> {webhook.label}</span>
                    </button>
                  </div>
                  <label className="field webhook-zone">
                    <span>Time zone</span>
                    <select className="input" value={webhook.time_zone} onChange={(e) => changeZone(webhook, e.target.value)}>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {zoneOption(z)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {postable && <NightChoice webhook={webhook} groups={postable} onChange={(groupId) => changeGroup(webhook, groupId)} />}
                </li>
              ))}
            </ul>
          )
        )}
        {rowError && (
          <p className="error" role="alert">
            {rowError}
          </p>
        )}
        {added && (
          <p className="settings-note" role="status">
            Added {added}. Have a look in the channel: Plank to Taylor has said hello.
          </p>
        )}
      </section>

      {!loading && !loadError && webhooks !== null && (
        <section className="settings-group" aria-labelledby="discord-add-heading">
          <h3 id="discord-add-heading">Add a channel</h3>
          {full ? (
            <p>
              You have {WEBHOOKS_EACH} channels, the most each. Remove one to add another.
            </p>
          ) : (
            <>
              <ol className="steps">
                <li>In Discord, open the server's settings, then Integrations → Webhooks. It takes permission to manage webhooks.</li>
                <li>Choose New Webhook, set its channel to the one for the daily post, and Copy Webhook URL.</li>
                <li>Paste it here.</li>
              </ol>
              <form onSubmit={add} noValidate>
                <label className="field">
                  <span>Webhook address</span>
                  <input
                    className="input"
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://discord.com/api/webhooks/…"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Name it (just for this list)</span>
                  <input
                    className="input"
                    type="text"
                    maxLength={LABEL_LENGTH}
                    placeholder="Optional: the webhook's own name otherwise"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                </label>
                <label className="field webhook-zone">
                  <span>The server's time zone</span>
                  <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {zoneOption(z)}
                      </option>
                    ))}
                  </select>
                </label>
                {problem && (
                  <p className="error" role="alert">
                    {problem}
                  </p>
                )}
                <div className="button-row">
                  <button type="submit" className="btn btn-primary" disabled={adding || url.trim() === ''}>
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </form>
            </>
          )}
          <p className="fine">
            Adding it posts a short hello in the channel, to check it works. Anyone with a webhook's address can post in
            its channel, so the site keeps it where nobody can read it back, you included. To stop the posts, remove it
            here or delete the webhook in Discord.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Stop the daily post in ${removing?.label ?? 'this channel'}?`}
        confirmLabel="Remove"
        cancelLabel="Keep it"
        destructive
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>Plank to Taylor won't post there any more. You can add it again later.</p>
      </ConfirmDialog>
    </>
  )
}

/**
 * What a channel posts at night: how everyone did, or how one of the player's groups did (its streak, and
 * who planked with their names and photos), with a preview of tonight's card.
 */
function NightChoice({ webhook, groups, onChange }: { webhook: DiscordWebhook; groups: Group[]; onChange: (groupId: string | null) => void }) {
  const chosen = groups.find((g) => g.id === webhook.group_id) ?? null
  // A group it posts that the player can no longer choose (they left it): shown as it is, until changed.
  const [picked, setPicked] = useState<string>(chosen?.id ?? groups[0]?.id ?? '')
  const [preview, setPreview] = useState<{ url: string | null; loading: boolean; failed: boolean } | null>(null)
  const name = `night-${webhook.id}`
  // The picture shown, let go of when it's replaced or the page closes.
  const shown = useRef<string | null>(null)
  const showUrl = (url: string | null) => {
    if (shown.current) URL.revokeObjectURL(shown.current)
    shown.current = url
  }
  useEffect(() => () => showUrl(null), [])

  // A new choice: the preview's out of date.
  useEffect(() => {
    showUrl(null)
    setPreview(null)
  }, [webhook.group_id])

  const show = () => {
    setPreview({ url: shown.current, loading: true, failed: false })
    discordPreview(webhook.group_id ? 'group' : 'everyone', webhook.group_id, webhook.time_zone)
      .then((png) => {
        const url = png && URL.createObjectURL(png)
        showUrl(url)
        setPreview({ url, loading: false, failed: false })
      })
      .catch(() => {
        showUrl(null)
        setPreview({ url: null, loading: false, failed: true })
      })
  }

  return (
    <fieldset className="kind-choice night-choice">
      <legend>At {clockTime(NIGHT_POST)}, post</legend>
      <label className="kind-option">
        <input type="radio" name={name} checked={webhook.group_id === null} onChange={() => onChange(null)} />
        <span>
          <strong>How everyone did</strong>
          <span className="fine">Everyone on the site: how many planked today's song, and how many held it all the way.</span>
        </span>
      </label>
      <label className={groups.length === 0 ? 'kind-option off' : 'kind-option'}>
        <input
          type="radio"
          name={name}
          checked={webhook.group_id !== null}
          disabled={groups.length === 0}
          onChange={() => picked && onChange(picked)}
        />
        <span>
          <strong>How a group did</strong>
          <span className="fine">
            {groups.length === 0
              ? "One of your groups: public ones you're in, and private ones you made. You have none yet."
              : "One of your groups: its streak, and who planked with their names and photos. Its members see on the group page that it's posted here."}
          </span>
          {groups.length > 0 && (
            <select
              className="input"
              aria-label="Group"
              value={webhook.group_id ?? picked}
              onChange={(e) => {
                setPicked(e.target.value)
                if (webhook.group_id !== null) onChange(e.target.value)
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </span>
      </label>
      <div className="night-preview">
        {preview?.url ? (
          <img src={preview.url} alt={`Tonight's card for ${webhook.label}`} />
        ) : preview && !preview.loading ? (
          <p className="fine" role="status">
            {preview.failed ? "Couldn't draw the card just now. Try again in a moment." : "Nothing to show yet: tonight's card appears once someone's planked today."}
          </p>
        ) : null}
        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={show} disabled={preview?.loading}>
            {preview?.loading ? 'Drawing…' : preview ? 'Preview again' : "Preview tonight's card"}
          </button>
        </div>
      </div>
    </fieldset>
  )
}
