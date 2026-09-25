import type { DayKey } from './dates'

// Groups: friends who plank together (signed-in players only). The rules live in the database
// (supabase/schema.sql, checked by supabase/groups-test.sql); what's here is the site's side of them.

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
  /** Today's held with no breaks (🟩); null when they haven't planked it today. */
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
