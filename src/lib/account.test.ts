import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Completion } from './progress'

// The account's side is a stand-in for Supabase: one row set per user, as row-level security gives
// each player only their own. Every request is counted, to check what leaves the browser, and each
// pull of planks or attempts noted with how many came back. Like the database, it stamps what it gets
// with when (saved_at), and plank_changes says when it looked, both by its own clock (`now`).
const fake = vi.hoisted(() => {
  type Rows = { completions: Record<string, unknown>[]; profile: Record<string, unknown> | null; attempts?: Record<string, unknown>[] }
  const state = {
    users: new Map<string, Rows>(),
    user: null as string | null,
    requests: 0,
    now: '2026-09-22T12:00:00.000Z',
    pulled: [] as { table: string; rows: number }[],
    // Requests made, and (while set) a wait before any is answered: each is answered as whoever made it.
    asked: 0,
    hold: null as Promise<void> | null,
    // What each database function answers, by name
    answers: new Map<string, unknown>(),
    onAuth: null as ((event: string, session: { user: { id: string; email: string } } | null) => void) | null,
  }
  const rows = (who: string | null) => {
    if (!who) throw new Error('Signed out: the account refuses.')
    if (!state.users.has(who)) state.users.set(who, { completions: [], profile: null })
    return state.users.get(who)!
  }
  type Query = { after: [string, string][]; range: [number, number] | null }
  const stamped = (value: unknown) => (value as Record<string, unknown>[]).map((row) => ({ ...row, saved_at: state.now }))
  function pull(table: string, all: Record<string, unknown>[], query: Query) {
    const found = all.filter((row) => query.after.every(([column, after]) => String(row[column]) > after))
    const page = query.range ? found.slice(query.range[0], query.range[1] + 1) : found
    state.pulled.push({ table, rows: page.length })
    return { data: page, error: null }
  }
  function run(table: string, op: string, value: unknown, query: Query, who: string | null) {
    state.requests++
    const mine = rows(who)
    if (table === 'plank_completions' && op === 'select') return pull(table, mine.completions, query)
    if (table === 'plank_completions' && op === 'upsert') {
      mine.completions.push(...stamped(value))
      return { error: null }
    }
    if (table === 'plank_attempts' && op === 'select') return pull(table, mine.attempts ?? [], query)
    if (table === 'plank_attempts' && op === 'upsert') {
      mine.attempts = [...(mine.attempts ?? []), ...stamped(value)]
      return { error: null }
    }
    if (table === 'plank_profiles' && op === 'select') return { data: mine.profile, error: null }
    if (table === 'plank_profiles' && (op === 'upsert' || op === 'insert')) {
      mine.profile = { ...mine.profile, ...(value as object) }
      return { error: null }
    }
    if (table === 'plank_profiles' && op === 'update') {
      if (!mine.profile) return { data: [], error: null }
      mine.profile = { ...mine.profile, ...(value as object) }
      return { data: [{ user_id: who }], error: null }
    }
    return { data: [], error: null }
  }
  function from(table: string) {
    const who = state.user
    state.asked++
    let op = 'select'
    let value: unknown
    const asked: Query = { after: [], range: null }
    const query = {
      select: () => query,
      order: () => query,
      range: (from: number, to: number) => ((asked.range = [from, to]), query),
      gt: (column: string, after: string) => (asked.after.push([column, after]), query),
      eq: () => query,
      limit: () => query,
      maybeSingle: () => query,
      upsert: (v: unknown) => ((op = 'upsert'), (value = v), query),
      update: (v: unknown) => ((op = 'update'), (value = v), query),
      insert: (v: unknown) => ((op = 'insert'), (value = v), query),
      then: (resolve: (r: unknown) => void, reject: (e: unknown) => void) => {
        const answer = () => {
          try {
            resolve(run(table, op, value, asked, who))
          } catch (error) {
            reject(error)
          }
        }
        if (state.hold) void state.hold.then(answer)
        else answer()
      },
    }
    return query
  }
  const after = (all: Record<string, unknown>[], since: unknown) =>
    all.filter((row) => typeof since !== 'string' || Date.parse(String(row.saved_at)) > Date.parse(since))
  function rpc(name: string, args: Record<string, unknown> = {}) {
    const who = state.user
    state.asked++
    const answer = () => {
      state.requests++
      if (name !== 'plank_changes') return { data: state.answers.get(name) ?? null, error: null }
      const mine = rows(who)
      const completions = after(mine.completions, args.p_planks)
      const attempts = after(mine.attempts ?? [], args.p_attempts)
      state.pulled.push({ table: 'plank_completions', rows: completions.length }, { table: 'plank_attempts', rows: attempts.length })
      return { data: { at: state.now, completions, attempts }, error: null }
    }
    return state.hold ? state.hold.then(answer) : Promise.resolve(answer())
  }
  const client = {
    from,
    rpc,
    auth: {
      onAuthStateChange: (fn: NonNullable<typeof state.onAuth>) => {
        state.onAuth = fn
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
  }
  return { state, client }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }))

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

/** Opens the site: a fresh copy of every module over this browser's storage. */
async function visit() {
  vi.resetModules()
  const account = await import('./account')
  const store = await import('./store')
  const theme = await import('./theme')
  const attempts = await import('./attempts')
  await vi.waitFor(() => expect(fake.state.onAuth).not.toBeNull())
  return { account, store, theme, attempts }
}

function signIn(id: string) {
  fake.state.user = id
  fake.state.onAuth!('SIGNED_IN', { user: { id, email: `${id}@example.com` } })
}

function signOut() {
  fake.state.user = null
  fake.state.onAuth!('SIGNED_OUT', null)
}

const account = (id: string) => fake.state.users.get(id)

const plank: Completion = { day: '2026-09-22', mode: 'daily', songId: 'cancelled', seconds: 211, at: '2026-09-22T12:00:00.000Z' }

describe('account sync', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'anon-key')
    vi.stubGlobal('localStorage', memoryStorage())
    fake.state.users.clear()
    fake.state.user = null
    fake.state.requests = 0
    fake.state.now = '2026-09-22T12:00:00.000Z'
    fake.state.pulled = []
    fake.state.asked = 0
    fake.state.hold = null
    fake.state.answers.clear()
    fake.state.onAuth = null
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('brings sound settings and custom themes to a new device, which keeps its own choice of theme', async () => {
    const midnight = { id: 'midnight', name: 'Midnight', colors: { paper: '#000000' } }
    fake.state.users.set('ana', {
      completions: [],
      profile: {
        ladder_level: 1,
        updated_at: '2026-09-20T00:00:00.000Z',
        display_name: 'Ana',
        avatar_url: 'https://example.supabase.co/avatar.jpg',
        prefs: { music: false, sounds: true, updatedAt: '2026-09-20T00:00:00.000Z' },
        // Saved before the choice stayed on each device: its "selected" is ignored.
        theme: { v: 1, selected: 'midnight', themes: [midnight], updatedAt: '2026-09-20T00:00:00.000Z' },
      },
    })
    const { store, theme } = await visit()
    signIn('ana')
    await vi.waitFor(() => expect(theme.getTheme().themes).toMatchObject([{ id: 'midnight', name: 'Midnight' }]))
    expect(theme.getTheme().selected).toBe('system')
    expect(store.getData().prefs.music).toBe(false)
    // Saved before there were aurora lights: they're on.
    expect(store.getData().prefs.lights).toBe(true)
    // And before there was a volume slider: as loud as the cues were made.
    expect(store.getData().prefs.volume).toBe(1)
    // And before there were lyrics: off, as for everyone until they choose them.
    expect(store.getData().prefs.lyrics).toBe(false)
    // And before stretching together: stretching along.
    expect(store.getData().prefs.stretch).toBe(true)
  })

  it('saves settings changed while signed in to the account, and sends nothing while signed out', async () => {
    const { store, theme } = await visit()
    store.setPrefs({ sounds: false })
    const first = theme.createTheme()
    expect(fake.state.requests).toBe(0)

    // Signing in takes them along: the account had none.
    signIn('ana')
    await vi.waitFor(() => expect(account('ana')?.profile?.prefs).toMatchObject({ sounds: false }))
    await vi.waitFor(() => expect(account('ana')?.profile?.theme).toMatchObject({ themes: [{ id: first }] }))

    store.setPrefs({ music: false })
    await vi.waitFor(() => expect(account('ana')?.profile?.prefs).toMatchObject({ music: false, sounds: false }))
    const id = theme.createTheme()
    await vi.waitFor(() => expect(account('ana')?.profile?.theme).toMatchObject({ themes: [{ id: first }, { id }] }))
    // Which theme shows is this device's own business.
    expect(account('ana')?.profile?.theme).not.toHaveProperty('selected')

    signOut()
    const before = fake.state.requests
    store.setPrefs({ music: true })
    theme.selectTheme('dark')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fake.state.requests).toBe(before)
  })

  it('keeps whichever copy of a setting was changed last', async () => {
    const { account: sync, store } = await visit()
    store.setPrefs({ music: false }) // Changed here, after the account's copy.
    fake.state.users.set('ana', {
      completions: [],
      profile: {
        ladder_level: 1,
        updated_at: '2026-09-20T00:00:00.000Z',
        prefs: { music: true, sounds: false, updatedAt: '2000-01-01T00:00:00.000Z' },
      },
    })
    signIn('ana')
    await vi.waitFor(() => expect(account('ana')?.profile?.prefs).toMatchObject({ music: false, sounds: true }))
    expect(store.getData().prefs).toMatchObject({ music: false, sounds: true })

    // Then changed on another device.
    account('ana')!.profile!.prefs = { music: true, sounds: false, updatedAt: '2999-01-01T00:00:00.000Z' }
    sync.retrySync()
    await vi.waitFor(() => expect(store.getData().prefs).toMatchObject({ music: true, sounds: false }))
  })

  it("never puts one account's planks in another's", async () => {
    const { store } = await visit()
    store.replaceProgress([plank], { level: 3, updatedAt: '2026-09-22T12:00:00.000Z' })
    signIn('ana')
    // Her ladder is the last thing her sync sends.
    await vi.waitFor(() => expect(account('ana')?.profile).toMatchObject({ ladder_level: 3 }))
    expect(account('ana')?.completions).toHaveLength(1)

    // Ana signs out and keeps her copy here. Then Ben signs in on the same browser.
    signOut()
    expect(store.getData().completions).toHaveLength(1)
    signIn('ben')
    // A fresh ladder is the last thing his sync sends.
    await vi.waitFor(() => expect(account('ben')?.profile).toMatchObject({ ladder_level: 1 }))
    expect(account('ben')?.completions).toEqual([])
    expect(store.getData().completions).toEqual([])

    // Back to Ana: her planks come back from her account.
    signOut()
    signIn('ana')
    await vi.waitFor(() => expect(store.getData().completions).toHaveLength(1))
  })

  it('sends a plank with no more breaks than the database keeps', async () => {
    const { store } = await visit()
    const pauses = Array.from({ length: 150 }, (_, i) => ({ at: i, ms: 1000 }))
    store.replaceProgress([{ ...plank, pauses }], { level: 1, updatedAt: '2026-09-22T12:00:00.000Z' })
    signIn('ana')
    await vi.waitFor(() => expect(account('ana')?.completions).toHaveLength(1))
    expect(account('ana')!.completions[0].pauses).toHaveLength(100)
  })

  it("sends an attempt's breaks, and only its count when there are more than the database keeps", async () => {
    const { attempts } = await visit()
    const few = attempts.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    attempts.endAttempt(few, 'gave-up', 95, [{ at: 60, ms: 8000 }])
    const many = attempts.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    attempts.endAttempt(many, 'finished', 211, Array.from({ length: 150 }, (_, i) => ({ at: i, ms: 1000 })))
    const clean = attempts.beginAttempt({ songId: 'cancelled', kind: 'daily' })
    attempts.endAttempt(clean, 'finished', 211, [])
    signIn('ana')
    await vi.waitFor(() => expect(account('ana')?.attempts).toHaveLength(3))
    const sent = new Map(account('ana')!.attempts!.map((row) => [row.id, row]))
    expect(sent.get(few)).toMatchObject({ pauses: 1, breaks: [{ at: 60, ms: 8000 }] })
    expect(sent.get(many)).toMatchObject({ pauses: 150, breaks: null })
    expect(sent.get(clean)).toMatchObject({ pauses: 0, breaks: null })
  })

  it('brings back only breaks that are breaks, one for each the attempt counted', async () => {
    const row = (id: string, pauses: number, breaks: unknown) => ({
      id,
      song_id: 'cancelled',
      kind: 'daily',
      level: null,
      started_at: '2026-09-22 12:00:00+00',
      ended_at: '2026-09-22 12:04:00+00',
      outcome: 'gave-up',
      reached: '95.0',
      pauses,
      breaks,
    })
    fake.state.users.set('ana', {
      completions: [],
      profile: null,
      attempts: [
        row('timed', 2, [
          { at: 30.5, ms: 4000 },
          { at: 61, ms: 0 },
        ]),
        row('untimed', 3, null),
        row('not-a-list', 1, { at: 1, ms: 1000 }),
        row('negative', 1, [{ at: -1, ms: 1000 }]),
        row('not-numbers', 1, [{ at: '30', ms: 1000 }]),
        row('miscounted', 2, [{ at: 30, ms: 1000 }]),
      ],
    })
    const { account: sync, attempts } = await visit()
    signIn('ana')
    await sync.pullAttempts()
    const byId = new Map(attempts.getAttempts().map((a) => [a.id, a]))
    expect(byId.get('timed')).toMatchObject({ pauses: 2, breaks: [{ at: 30.5, ms: 4000 }, { at: 61, ms: 0 }] })
    for (const id of ['untimed', 'not-a-list', 'negative', 'not-numbers', 'miscounted']) {
      expect(byId.get(id)).not.toHaveProperty('breaks')
    }
    expect(byId.get('untimed')).toMatchObject({ pauses: 3 })
  })

  it("keeps every device's planks and attempts on each device, and after that looks only for what's new", async () => {
    // Ana's phone has been busy: two planks and three attempts on her account.
    const planked = (day: string, songId: string, saved: string) => ({
      user_id: 'ana', day, mode: 'daily', song_id: songId, level: null, seconds: 211, completed_at: `${day} 12:00:00+00`, pauses: null, xp: 211, saved_at: saved,
    })
    const tried = (id: string, saved: string) => ({
      id, song_id: 'cancelled', kind: 'daily', level: null, started_at: '2026-09-22 12:00:00+00', ended_at: '2026-09-22 12:04:00+00', outcome: 'finished', reached: '211.0', pauses: 0, breaks: null, saved_at: saved,
    })
    fake.state.users.set('ana', {
      completions: [planked('2026-09-20', 'cancelled', '2026-09-20 12:00:01.123456+00'), planked('2026-09-21', 'style', '2026-09-21 12:00:01+00')],
      profile: { ladder_level: 4, updated_at: '2026-09-21T12:00:00.000Z' },
      attempts: [tried('a1', '2026-09-20 12:04:01+00'), tried('a2', '2026-09-21 12:04:01+00'), tried('a3', '2026-09-21 12:04:01+00')],
    })
    // Her laptop has never opened its history.
    const { store, attempts } = await visit()
    signIn('ana')
    await vi.waitFor(() => expect(attempts.getAttempts().map((a) => a.id)).toEqual(['a1', 'a2', 'a3']))
    expect(store.getData().completions.map((c) => c.day)).toEqual(['2026-09-20', '2026-09-21'])
    expect(store.getData().ladder.level).toBe(4)

    // The next day she planks on her phone again, while the laptop sits open.
    const ana = account('ana')!
    ana.completions.push(planked('2026-09-23', 'wood', '2026-09-23 12:00:01+00'))
    ana.attempts!.push(tried('a4', '2026-09-23 12:04:01+00'))
    ana.profile = { ...ana.profile, ladder_level: 5, updated_at: '2026-09-23T12:00:00.000Z' }
    fake.state.now = '2026-09-23T12:10:00.000Z'
    fake.state.pulled = []
    let redrawn = 0
    store.subscribe(() => redrawn++)
    // What supabase-js says when the laptop's tab comes back, as the site's own looks do every couple of minutes.
    fake.state.onAuth!('SIGNED_IN', { user: { id: 'ana', email: 'ana@example.com' } })
    await vi.waitFor(() => expect(attempts.getAttempts().map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4']))
    expect(store.getData().completions.map((c) => c.day)).toEqual(['2026-09-20', '2026-09-21', '2026-09-23'])
    expect(store.getData().ladder.level).toBe(5)
    // Only what was new came back.
    expect(fake.state.pulled).toEqual([
      { table: 'plank_completions', rows: 1 },
      { table: 'plank_attempts', rows: 1 },
    ])

    // Looking again with nothing new changes nothing on screen.
    redrawn = 0
    fake.state.now = '2026-09-23T12:12:00.000Z'
    fake.state.pulled = []
    fake.state.onAuth!('SIGNED_IN', { user: { id: 'ana', email: 'ana@example.com' } })
    await vi.waitFor(() => expect(fake.state.pulled).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 10))
    // And the next visit to the laptop carries on from there: its attempts aren't asked for again.
    expect(localStorage.getItem('plank-to-taylor:attempts-seen')).toBe('"2026-09-23T12:12:00.000Z"')
    expect(fake.state.pulled).toEqual([
      { table: 'plank_completions', rows: 0 },
      { table: 'plank_attempts', rows: 0 },
    ])
    expect(redrawn).toBe(0)
  })

  it('picks up where it left off on the next visit, asking only for attempts the account got since', async () => {
    const tried = (id: string, saved: string) => ({
      id, song_id: 'cancelled', kind: 'daily', level: null, started_at: '2026-09-22 12:00:00+00', ended_at: '2026-09-22 12:04:00+00', outcome: 'gave-up', reached: '30.0', pauses: 0, breaks: null, saved_at: saved,
    })
    fake.state.users.set('ana', { completions: [], profile: null, attempts: [tried('a1', '2026-09-22 08:00:00+00'), tried('a2', '2026-09-22 09:00:00+00')] })
    let visited = await visit()
    signIn('ana')
    await vi.waitFor(() => expect(visited.attempts.getAttempts()).toHaveLength(2))
    // Ana closes the tab. Her phone adds one, the next day.
    account('ana')!.attempts!.push(tried('a3', '2026-09-23 09:00:00+00'))
    fake.state.now = '2026-09-23T10:00:00.000Z'
    fake.state.pulled = []
    visited = await visit()
    signIn('ana')
    await vi.waitFor(() => expect(visited.attempts.getAttempts().map((a) => a.id)).toEqual(['a1', 'a2', 'a3']))
    expect(fake.state.pulled.find((p) => p.table === 'plank_attempts')).toEqual({ table: 'plank_attempts', rows: 1 })
  })

  it("asks for every attempt again when the last ones it got couldn't be kept", async () => {
    const tried = (id: string) => ({
      id, song_id: 'cancelled', kind: 'daily', level: null, started_at: '2026-09-22 12:00:00+00', ended_at: '2026-09-22 12:04:00+00', outcome: 'gave-up', reached: '30.0', pauses: 0, breaks: null, saved_at: '2026-09-22 08:00:00+00',
    })
    fake.state.users.set('ana', { completions: [], profile: null, attempts: [tried('a1')] })
    // Storage is full: the attempt log can't be written.
    const storage = memoryStorage()
    const setItem = storage.setItem
    storage.setItem = (key, value) => {
      if (key === 'plank-to-taylor:attempts') throw new Error('QuotaExceededError')
      setItem(key, value)
    }
    vi.stubGlobal('localStorage', storage)
    const { attempts } = await visit()
    signIn('ana')
    await vi.waitFor(() => expect(attempts.getAttempts()).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(attempts.attemptsSeen()).toBeNull()
  })

  it("never puts one account's planks in another's, even when someone else signs in mid-sync", async () => {
    fake.state.users.set('ana', { completions: [{ user_id: 'ana', day: '2026-09-22', mode: 'daily', song_id: 'cancelled', seconds: 211, completed_at: '2026-09-22 12:00:00+00' }], profile: null })
    const { store } = await visit()
    let answer!: () => void
    fake.state.hold = new Promise((resolve) => (answer = resolve))
    signIn('ana')
    // Ana's sync has asked her account, and hasn't heard back when Ben signs in on the same browser.
    await vi.waitFor(() => expect(fake.state.asked).toBeGreaterThan(0))
    signOut()
    signIn('ben')
    fake.state.hold = null
    answer()
    await vi.waitFor(() => expect(account('ben')?.profile).toMatchObject({ ladder_level: 1 }))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(store.getData().completions).toEqual([])
    expect(account('ben')?.completions).toEqual([])
  })

  it("shows other players' photos only from the project's own bucket", async () => {
    const { account: sync } = await visit()
    signIn('ana')
    const photo = 'https://example.supabase.co/storage/v1/object/public/avatars/0f8fad5b-d9cb-469f-a165-70867728950e/avatar.jpg?v=1'
    const tracker = 'https://tracker.example/storage/v1/object/public/avatars/0f8fad5b-d9cb-469f-a165-70867728950e/avatar.jpg'
    fake.state.answers.set('group_board', [
      { name: 'Ben', avatar_url: photo },
      { name: 'Mallory', avatar_url: tracker },
    ])
    fake.state.answers.set('group_invite', { kind: 'public', contributors: [{ name: 'Mallory', avatar_url: tracker, days: 1 }] })
    expect((await sync.loadBoard('gym', '2026-09-25')).map((m) => m.avatar_url)).toEqual([photo, null])
    expect(await sync.groupInvite('0123456789abcdef0123', '2026-09-25')).toMatchObject({ contributors: [{ name: 'Mallory', avatar_url: null }] })
  })

  it('still brings progress made before ever signing in', async () => {
    const { store } = await visit()
    store.replaceProgress([plank], { level: 3, updatedAt: '2026-09-22T12:00:00.000Z' })
    signIn('ana')
    await vi.waitFor(() => expect(account('ana')?.completions).toHaveLength(1))
    expect(account('ana')?.profile).toMatchObject({ ladder_level: 3 })
  })
})
