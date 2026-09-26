import type { DayKey } from './dates'
import type { Completion } from './progress'
import { streakInfo, type StreakInfo } from './streaks'

// Groups: friends who plank together (signed-in players only). The rules live in the database
// (supabase/schema.sql, checked by supabase/rules-test.sql); what's here is the site's side of them.

/**
 * private  the group's day counts when everyone has planked; only members see the group
 * public   the group's day counts when anyone has; anyone with its link can see it
 */
export type GroupKind = 'private' | 'public'

/** Members in a group, at most. schema.sql has the same limit: keep them in step. */
export const GROUP_SIZE = 50
/** Groups each player can be in, at most. schema.sql has the same limit: keep them in step. */
export const GROUPS_EACH = 10
/** A group's name, at most. */
export const GROUP_NAME_LENGTH = 40

/** An invite code, as the database makes them. */
const CODE = /^[0-9a-f]{20}$/

/** The code from an invite link's address (or a pasted code), tidied, or null if it can't be one. */
export function inviteCode(text: string): string | null {
  const code = text.trim().toLowerCase()
  return CODE.test(code) ? code : null
}

/** One member, as the group's board shows them to the other members. */
export interface BoardMember {
  user_id: string
  name: string
  avatar_url: string | null
  /** The day they joined, in their time zone. */
  joined_on: DayKey
  /** Every day they planked today's song. */
  days: DayKey[]
  /** Today's held with no breaks (the green tick); null when they haven't planked it today. */
  clean_today: boolean | null
}

/** What an invite link shows before joining. */
export type Invite =
  /** A private group, signed out: nothing about it. */
  | { kind: 'private'; name?: undefined; id?: undefined }
  | {
      kind: GroupKind
      name: string
      members: number
      /** Set when you're in it already. */
      id: string | null
      /** A public group's: the days anyone in it planked. */
      days?: DayKey[]
      /** A public group's: each member's days planked this month, most first. */
      contributors?: { name: string; avatar_url: string | null; days: number }[]
    }

// An invite followed while signed out is kept here through sign-in: the magic link comes back to the
// site's front page, without the #join/<code> it left from.
const PENDING_KEY = 'plank-to-taylor:join'
/** A kept invite older than this is forgotten: signing in days later is for something else. */
const PENDING_MS = 24 * 60 * 60 * 1000

export function keepInvite(code: string, now = Date.now()) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ code, at: now }))
  } catch {
    // Private mode: the invite link still works when it's opened again after signing in.
  }
}

/** The invite kept through sign-in, if there's a recent one. */
export function keptInvite(now = Date.now()): string | null {
  try {
    const kept = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null
    if (!kept || typeof kept.code !== 'string' || typeof kept.at !== 'number' || now - kept.at > PENDING_MS) return null
    return inviteCode(kept.code)
  } catch {
    return null
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // Nothing kept, then.
  }
}

/** Why a group call was refused, from the database's message. */
export type GroupProblem = 'sign-in' | 'name' | 'too-many' | 'full' | 'not-found' | 'not-maker' | 'unavailable'

export function groupProblem(message: string | undefined): GroupProblem {
  if (!message) return 'unavailable'
  if (message.includes('sign in first')) return 'sign-in'
  if (message.includes('a name first')) return 'name'
  if (message.includes('too many groups')) return 'too-many'
  if (message.includes('group full')) return 'full'
  if (message.includes('no such group')) return 'not-found'
  if (message.includes("group's maker")) return 'not-maker'
  return 'unavailable'
}

/**
 * The days a group counts, up to today. A plank counts for a group from the day its planker joined. A day
 * counts once anyone has planked it: in a public group that's all it takes; in a private group it also needs
 * everyone who joined before that day, so joining partway through a day never breaks it. Members who've
 * left aren't on the board, so they count neither way.
 */
export function groupDays(kind: GroupKind, board: readonly BoardMember[], today: DayKey): Set<DayKey> {
  const members = board.map((m) => ({ joined: m.joined_on, days: new Set(m.days.filter((d) => d >= m.joined_on && d <= today)) }))
  const planked = new Set(members.flatMap((m) => [...m.days]))
  if (kind === 'public') return planked
  return new Set([...planked].filter((day) => members.every((m) => m.joined >= day || m.days.has(day))))
}

/** The group streak: worked out like a player's, freezes and all, over the days the group counts. */
export function groupStreak(kind: GroupKind, board: readonly BoardMember[], today: DayKey): StreakInfo {
  return streakInfo(groupDays(kind, board, today), today)
}

export interface GroupToday {
  /** Members who've planked today's song. */
  planked: number
  members: number
  /** A private group's: members today still needs, who joined before today and haven't planked it. */
  waiting: number
}

export function groupToday(kind: GroupKind, board: readonly BoardMember[], today: DayKey): GroupToday {
  const planked = board.filter((m) => m.days.includes(today)).length
  const waiting = kind === 'private' ? board.filter((m) => m.joined_on < today && !m.days.includes(today)).length : 0
  return { planked, members: board.length, waiting }
}

/**
 * A public group's contributors: the days each member planked today's song this calendar month, from the
 * day they joined, most first. Planks only, never breaks. The same as an invite link shows (group_invite).
 */
export function contributions(board: readonly BoardMember[], today: DayKey): { member: BoardMember; days: number }[] {
  const monthStart = `${today.slice(0, 7)}-01`
  return board
    .map((member) => {
      const from = member.joined_on > monthStart ? member.joined_on : monthStart
      return { member, days: member.days.filter((d) => d >= from && d <= today).length }
    })
    .sort((a, b) => b.days - a.days || a.member.name.localeCompare(b.member.name))
}

/**
 * The board with the player's own row brought up to date from this browser: a plank just finished may not
 * have reached the account yet.
 */
export function withMine(board: readonly BoardMember[], me: string, completions: readonly Completion[], today: DayKey): BoardMember[] {
  const daily = completions.filter((c) => c.mode === 'daily')
  const mineToday = daily.find((c) => c.day === today)
  return board.map((m) =>
    m.user_id !== me
      ? m
      : {
          ...m,
          days: [...new Set([...m.days, ...daily.map((c) => c.day)])].sort(),
          clean_today: mineToday ? (mineToday.pauses ?? []).length === 0 : m.clean_today,
        },
  )
}
