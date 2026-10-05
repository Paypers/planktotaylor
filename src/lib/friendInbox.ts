import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { realtimeClient } from './account'
import { refreshFriends } from './myFriends'

// Each player's friend inbox: a private Realtime channel, friend-inbox:<their id>. Only they can listen, and only
// their friends, or someone whose request is waiting with them, can send to it (schema.sql). A request, an
// accepted request or an invite sends a nudge there with nothing in it, so the friend's site checks in straight
// away instead of up to 45 seconds later. Nothing is stored, and a nudge that doesn't arrive costs only the wait.

const EVENT = 'nudge'
/** A channel that wouldn't join waits this long before trying again. */
const RETRY_MS = 60_000

/** Listens to the signed-in player's inbox while there's one to listen to. */
export function useFriendInbox(userId: string | null) {
  useEffect(() => {
    if (!userId) return
    let closed = false
    let supabase: SupabaseClient | null = null
    let channel: RealtimeChannel | null = null
    let retry: ReturnType<typeof setTimeout> | undefined

    const join = () => {
      if (closed || !supabase) return
      const joining = supabase.channel(`friend-inbox:${userId}`, { config: { private: true } })
      channel = joining
      joining
        .on('broadcast', { event: EVENT }, () => void refreshFriends())
        .subscribe((status) => {
          if (closed || channel !== joining) return
          // Back after a drop: anything sent meanwhile is caught up on.
          if (status === 'SUBSCRIBED') void refreshFriends()
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            channel = null
            void supabase?.removeChannel(joining).catch(() => {})
            clearTimeout(retry)
            retry = setTimeout(join, RETRY_MS)
          }
        })
    }

    void realtimeClient()
      .then((client) => {
        supabase = client
        join()
      })
      .catch(() => {})
    return () => {
      closed = true
      clearTimeout(retry)
      if (supabase && channel) void supabase.removeChannel(channel).catch(() => {})
    }
  }, [userId])
}

/** Nudges each of these players' inboxes, so their friends lists check in now. Sent and forgotten. */
export async function nudgeFriends(userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return
  try {
    const supabase = await realtimeClient()
    // The signed-in player's token, for the inboxes' rules: the socket may never have connected.
    await supabase.realtime.setAuth()
    await Promise.all(
      [...new Set(userIds)].map(async (id) => {
        const channel = supabase.channel(`friend-inbox:${id}`, { config: { private: true } })
        try {
          await channel.httpSend(EVENT, {})
        } catch {
          // Not allowed (they've blocked you, or you're not friends any more), or no connection: they'll see it soon.
        } finally {
          void supabase.removeChannel(channel).catch(() => {})
        }
      }),
    )
  } catch {
    // No client, no token: the check-in catches it up.
  }
}
