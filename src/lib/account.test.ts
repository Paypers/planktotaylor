import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Completion } from './progress'

// The account's side is a stand-in for Supabase: one row set per user, as row-level security gives
// each player only their own. Every request is counted, to check what leaves the browser.
const fake = vi.hoisted(() => {
  type Rows = { completions: Record<string, unknown>[]; profile: Record<string, unknown> | null }
  const state = {
    users: new Map<string, Rows>(),
    user: null as string | null,
    requests: 0,
    // What each database function answers, by name
    answers: new Map<string, unknown>(),
    onAuth: null as ((event: string, session: { user: { id: string; email: string } } | null) => void) | null,
  }
  const rows = () => {
    if (!state.user) throw new Error('Signed out: the account refuses.')
    if (!state.users.has(state.user)) state.users.set(state.user, { completions: [], profile: null })
    return state.users.get(state.user)!
  }
  function run(table: string, op: string, value: unknown) {
    state.requests++
    const mine = rows()
    if (table === 'plank_completions' && op === 'select') return { data: mine.completions, error: null }
    if (table === 'plank_completions' && op === 'upsert') {
      mine.completions.push(...(value as Record<string, unknown>[]))
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
      return { data: [{ user_id: state.user }], error: null }
    }
    return { data: [], error: null }
  }
  function from(table: string) {
    let op = 'select'
    let value: unknown
    const query = {
      select: () => query,
      order: () => query,
      range: () => query,
      eq: () => query,
      limit: () => query,
      maybeSingle: () => query,
      upsert: (v: unknown) => ((op = 'upsert'), (value = v), query),
      update: (v: unknown) => ((op = 'update'), (value = v), query),
      insert: (v: unknown) => ((op = 'insert'), (value = v), query),
      then: (resolve: (r: unknown) => void, reject: (e: unknown) => void) => {
        try {
          resolve(run(table, op, value))
        } catch (error) {
          reject(error)
        }
      },
    }
    return query
  }
  const client = {
    from,
    rpc: async (name: string) => ({ data: state.answers.get(name) ?? null, error: null }),
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
  await vi.waitFor(() => expect(fake.state.onAuth).not.toBeNull())
  return { account, store, theme }
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
