import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forgetInvite, groupProblem, inviteCode, keepInvite, keptInvite } from './groups'

describe('invite codes', () => {
  it('takes a code as the database makes them, tidied', () => {
    expect(inviteCode('0123456789abcdef0123')).toBe('0123456789abcdef0123')
    expect(inviteCode('  0123456789ABCDEF0123 ')).toBe('0123456789abcdef0123')
  })

  it('refuses anything else', () => {
    for (const text of ['', 'abc', '0123456789abcdef012', '0123456789abcdef01234', '0123456789abcdef012g', '../../settings']) {
      expect(inviteCode(text), text).toBeNull()
    }
  })
})

describe('an invite kept through sign-in', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage
  })
  afterEach(() => {
    // @ts-expect-error: put back as it was, with no storage
    delete globalThis.localStorage
  })

  it('is there after sign-in, for a day', () => {
    keepInvite('0123456789abcdef0123', 1000)
    expect(keptInvite(1000 + 60_000)).toBe('0123456789abcdef0123')
    expect(keptInvite(1000 + 25 * 60 * 60 * 1000)).toBeNull()
  })

  it('is gone once forgotten', () => {
    keepInvite('0123456789abcdef0123')
    forgetInvite()
    expect(keptInvite()).toBeNull()
  })

  it('ignores anything else kept under its name', () => {
    store.set('plank-to-taylor:join', 'not json')
    expect(keptInvite()).toBeNull()
    store.set('plank-to-taylor:join', JSON.stringify({ code: 'nope', at: Date.now() }))
    expect(keptInvite()).toBeNull()
  })
})

describe('why a group call was refused', () => {
  it('reads the database\'s messages', () => {
    expect(groupProblem('a name first')).toBe('name')
    expect(groupProblem('too many groups')).toBe('too-many')
    expect(groupProblem('group full')).toBe('full')
    expect(groupProblem('no such group')).toBe('not-found')
    expect(groupProblem("only the group's maker can do that")).toBe('not-maker')
    expect(groupProblem('sign in first')).toBe('sign-in')
    expect(groupProblem('Failed to fetch')).toBe('unavailable')
    expect(groupProblem(undefined)).toBe('unavailable')
  })
})
