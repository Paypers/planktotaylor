// A group's board, as the group page shows it (group_board in schema.sql), for a Discord channel that posts
// the group: each member's name and photo, the day they joined, the days they planked today's song, and
// whether `day`'s was held with no breaks. Nothing else: never breaks, XP, attempts or the ladder.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.117.1'

export interface BoardMember {
  user_id: string
  name: string
  avatar_url: string | null
  joined_on: string
  days: string[]
  clean_today: boolean | null
}

export interface GroupBoard {
  name: string
  kind: 'private' | 'public'
  board: BoardMember[]
}

const PAGE_SIZE = 1000

/** The group and its board on `day`, through the service key; null if the group's gone. */
export async function loadGroupBoard(db: SupabaseClient, groupId: string, day: string): Promise<GroupBoard | null> {
  const group = await db.from('groups').select('name, kind').eq('id', groupId).maybeSingle()
  if (group.error) throw group.error
  if (!group.data) return null
  const members = await db.from('group_members').select('user_id, joined_on').eq('group_id', groupId).order('joined_at').order('user_id')
  if (members.error) throw members.error
  const rows = members.data as { user_id: string; joined_on: string }[]
  if (rows.length === 0) return null
  const ids = rows.map((m) => m.user_id)

  const profiles = await db.from('plank_profiles').select('user_id, display_name, avatar_url').in('user_id', ids)
  if (profiles.error) throw profiles.error
  const profileOf = new Map((profiles.data as { user_id: string; display_name: string | null; avatar_url: string | null }[]).map((p) => [p.user_id, p]))

  // A plank counts for a group from the day its planker joined, so nothing before the first joined is needed.
  const since = rows.reduce((first, m) => (m.joined_on < first ? m.joined_on : first), day)
  const days = new Map<string, Set<string>>()
  const clean = new Map<string, boolean>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const planks = await db
      .from('plank_completions')
      .select('user_id, day, pauses')
      .eq('mode', 'daily')
      .in('user_id', ids)
      .gte('day', since)
      .lte('day', day)
      .order('user_id')
      .order('day')
      .range(from, from + PAGE_SIZE - 1)
    if (planks.error) throw planks.error
    for (const plank of planks.data as { user_id: string; day: string; pauses: unknown[] | null }[]) {
      if (!days.has(plank.user_id)) days.set(plank.user_id, new Set())
      days.get(plank.user_id)!.add(plank.day)
      if (plank.day === day) clean.set(plank.user_id, !plank.pauses || plank.pauses.length === 0)
    }
    if (planks.data.length < PAGE_SIZE) break
  }

  return {
    name: group.data.name as string,
    kind: group.data.kind as 'private' | 'public',
    board: rows.map((m) => {
      const profile = profileOf.get(m.user_id)
      return {
        user_id: m.user_id,
        name: profile?.display_name?.trim() || 'A planker',
        avatar_url: profile?.avatar_url ?? null,
        joined_on: m.joined_on,
        days: [...(days.get(m.user_id) ?? [])].sort(),
        clean_today: clean.get(m.user_id) ?? null,
      }
    }),
  }
}
