import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DayKey } from './dates'
import {
  contributions,
  forgetInvite,
  groupDays,
  groupProblem,
  groupStreak,
  groupToday,
  inviteCode,
  keepInvite,
  keptInvite,
  withMine,
  type BoardMember,
} from './groups'
import type { Completion } from './progress'

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

/** Days of September 2026, by number. */
const sep = (...days: number[]): DayKey[] => days.map((d) => `2026-09-${String(d).padStart(2, '0')}`)
/** Every day of September from `from` to `to`, except those in `skip`. */
const run = (from: number, to: number, skip: number[] = []) =>
  sep(...Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((d) => !skip.includes(d)))

const member = (name: string, joined: DayKey, days: DayKey[], clean: boolean | null = null): BoardMember => ({
  user_id: name.toLowerCase(),
  name,
  avatar_url: null,
  joined_on: joined,
  days,
  clean_today: clean,
})

describe('the group streak', () => {
  const [first, today] = sep(1, 10)

  it('grows on days everyone planked, in a private group', () => {
    const board = [member('Ana', first, run(1, 9)), member('Ben', first, run(1, 9))]
    const streak = groupStreak('private', board, today)
    expect(streak.current).toBe(9)
    expect(streak.frozen.size).toBe(0)
  })

  it('uses a freeze on a day someone missed, which keeps it going without adding to it', () => {
    const board = [member('Ana', first, run(1, 9)), member('Ben', first, run(1, 9, [5]))]
    expect([...groupDays('private', board, today)]).toEqual(run(1, 9, [5]))
    const streak = groupStreak('private', board, today)
    expect(streak.current).toBe(8)
    expect([...streak.frozen]).toEqual(sep(5))
    expect(streak.freezesLeft).toBe(2)
  })

  it('ends on a third missed day in a row, freezes left or not', () => {
    const board = [member('Ana', first, run(1, 9)), member('Ben', first, run(1, 9, [5, 6, 7]))]
    const streak = groupStreak('private', board, today)
    expect(streak.current).toBe(2)
    expect(streak.best).toBe(4)
  })

  it('has 3 freezes a month, the same as a player', () => {
    const board = [member('Ana', first, sep(1, 3, 5, 7, 9))]
    const streak = groupStreak('public', board, today)
    // Missed the 2nd, 4th and 6th on freezes; the 8th had none left.
    expect(streak.best).toBe(4)
    expect(streak.current).toBe(1)
  })

  it("doesn't need a member before the day after they joined", () => {
    const board = [
      member('Ana', first, run(1, 9)),
      // Joined on the 5th without planking it; planked the 3rd before joining, which doesn't count.
      member('Cat', sep(5)[0], [...sep(3), ...run(6, 9)]),
    ]
    expect(groupStreak('private', board, today).current).toBe(9)
    // From the day after joining, they're needed like anyone.
    const missed = [member('Ana', first, run(1, 9)), member('Cat', sep(5)[0], run(7, 9))]
    expect([...groupStreak('private', missed, today).frozen]).toEqual(sep(6))
  })

  it("counts today only once it's done, and until then carries the streak to yesterday", () => {
    const waiting = [member('Ana', first, run(1, 10)), member('Ben', first, run(1, 9))]
    const before = groupStreak('private', waiting, today)
    expect(before).toMatchObject({ current: 9, doneToday: false, atRisk: true })
    const done = [member('Ana', first, run(1, 10)), member('Ben', first, run(1, 10))]
    expect(groupStreak('private', done, today)).toMatchObject({ current: 10, doneToday: true, atRisk: false })
  })

  it("needs someone to plank a day, even one nobody was needed for yet", () => {
    expect(groupDays('private', [member('Ana', today, [])], today).size).toBe(0)
    expect([...groupDays('private', [member('Ana', today, [today])], today)]).toEqual([today])
  })

  it('grows on days anyone planked, in a public group, from the day they joined', () => {
    const board = [member('Ana', first, sep(1, 2, 3)), member('Ben', sep(5)[0], sep(4, 5, 6))]
    expect([...groupDays('public', board, today)].sort()).toEqual(sep(1, 2, 3, 5, 6))
    // The 4th (before Ben joined) was frozen, then nobody planked the 7th, 8th and 9th.
    expect(groupStreak('public', board, today)).toMatchObject({ current: 0, best: 5 })
  })

  it('leaves out days after today, planked where it was already tomorrow', () => {
    const board = [member('Ana', first, run(1, 11))]
    expect(groupDays('public', board, today).has(sep(11)[0])).toBe(false)
  })
})

describe("how today's going", () => {
  const today = sep(10)[0]
  it("counts who's planked, and who a private group's day still needs", () => {
    const board = [
      member('Ana', sep(1)[0], [today], true),
      member('Ben', sep(1)[0], []),
      // Joined today: not needed today.
      member('Cat', today, []),
    ]
    expect(groupToday('private', board, today)).toEqual({ planked: 1, members: 3, waiting: 1 })
    expect(groupToday('public', board, today)).toEqual({ planked: 1, members: 3, waiting: 0 })
  })
})

describe("a public group's contributors", () => {
  it("counts this month's days from joining, most first, then by name", () => {
    const today = sep(24)[0]
    const board = [
      member('Cat', sep(1)[0], []),
      member('Ben', sep(10)[0], sep(5, 10, 11, 12)),
      member('Ana', '2026-08-01', ['2026-08-30', ...sep(1, 2, 24, 25)]),
    ]
    expect(contributions(board, today).map((c) => [c.member.name, c.days])).toEqual([
      ['Ana', 3],
      ['Ben', 3],
      ['Cat', 0],
    ])
  })
})

describe("the player's own row", () => {
  const today = sep(24)[0]
  const plank = (day: DayKey, mode: Completion['mode'], pauses?: Completion['pauses']): Completion => ({
    day,
    mode,
    songId: 'style',
    seconds: 231,
    at: `${day}T12:00:00.000Z`,
    pauses,
  })

  it('shows a plank this browser has that the account may not yet', () => {
    const board = [member('Ana', sep(1)[0], sep(1)), member('Ben', sep(1)[0], sep(1, 24), false)]
    const completions = [plank(sep(2)[0], 'daily', [{ at: 30, ms: 5000 }]), plank(today, 'daily'), plank(sep(23)[0], 'ladder')]
    const [ana, ben] = withMine(board, 'ana', completions, today)
    expect(ana.days).toEqual(sep(1, 2, 24))
    expect(ana.clean_today).toBe(true)
    expect(ben).toBe(board[1])
  })

  it("keeps the board's today when this browser hasn't planked it", () => {
    const board = [member('Ana', sep(1)[0], sep(1, 24), false)]
    expect(withMine(board, 'ana', [], today)[0].clean_today).toBe(false)
  })
})
