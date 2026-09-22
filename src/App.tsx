import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccountDialog } from './components/AccountDialog'
import { Avatar } from './components/Avatar'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Flame, Icon, StarMark } from './components/Icon'
import { MusicDialog } from './components/MusicDialog'
import { PlankTimer, type FinishSummary, type PlankSession, type PlankShare } from './components/PlankTimer'
import { Setlist } from './components/Setlist'
import { ShareDialog } from './components/ShareDialog'
import { LadderProgress, SongLine, SongRow } from './components/SongRow'
import { StreakPanel } from './components/StreakPanel'
import { LADDER, type Song } from './data/songs'
import { accountsEnabled, bumpDailyCount, displayName, fetchDailyCount, saveLadderCursor, useAccount } from './lib/account'
import { fromDayKey } from './lib/dates'
import { useToday } from './lib/hooks'
import { dailyView, ladderView, songFor, streakDays, type Completion, type Pause } from './lib/progress'
import { dailyNumber } from './lib/daily'
import { plankSummary, type ShareInput } from './lib/share'
import { getData, recordPlank, setLadderLevel, useAppData } from './lib/store'
import { streakInfo } from './lib/streaks'
import { plankXp, rankFor, totalXp } from './lib/xp'

export function App() {
  const data = useAppData()
  const today = useToday()
  const { user, profile } = useAccount()
  const [session, setSession] = useState<PlankSession | null>(null)
  const [dialog, setDialog] = useState<'music' | 'account' | null>(null)
  const [dailyCount, setDailyCount] = useState<number | null>(null)
  const [jumpTo, setJumpTo] = useState<number | null>(null)
  const [sharing, setSharing] = useState<ShareInput | null>(null)

  const daily = dailyView(data, today)
  const ladder = ladderView(data, today)
  const days = useMemo(() => streakDays(data.completions), [data.completions])
  const streak = streakInfo(days, today)
  const twofer = !ladder.finished && ladder.song?.id === daily.song.id
  // XP is for signed-in players only.
  const earningXp = accountsEnabled && user !== null
  const rank = earningXp ? rankFor(totalXp(data.completions)) : null
  const shownName = user ? displayName(user, profile) : ''
  const climbed = ladder.climbedToday.length
  const lastClimb = ladder.climbedToday.at(-1)
  const climbedXp = totalXp(data.completions.filter((c) => c.day === today && ladder.climbedToday.some((l) => l.at === c.at)))

  useEffect(() => {
    let live = true
    void fetchDailyCount(today).then((n) => live && setDailyCount(n))
    return () => {
      live = false
    }
  }, [today])

  // Opens the share box for one plank: what it counted for, how it went, and the streak.
  const sharePlank = ({ song, pauses, counted }: PlankShare, day = today) => {
    setSharing({
      dailyNumber: dailyNumber(day),
      day,
      streak: streakInfo(streakDays(getData().completions), today).current,
      xp: totalXp(counted) || undefined,
      song,
      daily: counted.some((c) => c.mode === 'daily'),
      level: counted.find((c) => c.mode === 'ladder')?.level,
      pauses,
    })
  }

  /** Share a plank from today's list. One plank can have counted for both rows. */
  const shareCompletion = (completion: Completion) => {
    const song = songFor(completion)
    if (!song) return
    const counted = getData().completions.filter((c) => c.day === completion.day && c.at === completion.at)
    sharePlank({ song, pauses: completion.pauses ?? [], counted }, completion.day)
  }

  const dailyDone = data.completions.find((c) => c.mode === 'daily' && c.day === today)

  const finish = useCallback(
    (song: Song, pauses: Pause[]): FinishSummary => {
      const before = totalXp(getData().completions)
      const counted = recordPlank(song, pauses, earningXp)
      if (counted.some((c) => c.mode === 'daily')) {
        void bumpDailyCount(today).then((n) => n !== null && setDailyCount(n))
      }
      const now = getData()
      const after = ladderView(now, today)
      const next = counted.some((c) => c.mode === 'ladder') && after.song ? { level: after.level, song: after.song } : null
      // Signed out, the finished screen shows what the plank would have earned.
      const xp =
        accountsEnabled && counted.length > 0
          ? { award: plankXp(song.seconds, pauses), earned: earningXp, before, after: totalXp(now.completions) }
          : null
      return { counted, streak: streakInfo(streakDays(now.completions), today).current, next, xp }
    },
    [today, earningXp],
  )

  const confirmJump = () => {
    if (jumpTo !== null) void saveLadderCursor(setLadderLevel(jumpTo))
    setJumpTo(null)
  }

  const start = (song: Song, label: string) => setSession({ song, label })
  // Without an account, progress lives in this browser: say so quietly where there's something to keep.
  const offerSignIn = accountsEnabled && !user ? () => setDialog('account') : undefined
  const dateline = fromDayKey(today).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <>
      <div className="page">
        <header className="site-header">
          <a className="brand" href={import.meta.env.BASE_URL}>
            <StarMark size={18} />
            <span>Plank to Taylor</span>
          </a>
          <nav className="header-actions" aria-label="Settings">
            <span className="streak-pill" title={streak.doneToday ? 'Streak safe today' : "Plank today's song to keep your streak"}>
              <Flame size={20} lit={streak.doneToday} />
              <span className="streak-pill-num">{streak.current}</span>
              <span className="sr-only">-day streak</span>
            </span>
            <button type="button" className="icon-btn" onClick={() => setDialog('music')} aria-label="Music and sound">
              <Icon name="music" />
            </button>
            {accountsEnabled &&
              (user && rank ? (
                // Signed in: your photo, name and rank. The rank sits on the photo on phones.
                <button
                  type="button"
                  className="profile-btn"
                  onClick={() => setDialog('account')}
                  aria-label={`Your profile: ${shownName}, rank ${rank.rank}`}
                >
                  <span className="profile-photo">
                    <Avatar name={shownName} url={profile.avatarUrl} size={36} />
                    <span className="profile-badge narrow-only">{rank.rank}</span>
                  </span>
                  <span className="profile-text wide-only">
                    <span className="profile-name">{shownName}</span>
                    <span className="profile-rank">Rank {rank.rank}</span>
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary header-account"
                  onClick={() => setDialog('account')}
                  aria-label="Sign in"
                >
                  <Icon name="user" className="narrow-only" />
                  <span className="wide-only">Sign in</span>
                </button>
              ))}
          </nav>
        </header>

        <main>
          <section className="masthead grid">
            <div className="masthead-meta">
              <p>{dateline}</p>
              <p>Daily No. {daily.number}</p>
            </div>
            <div className="masthead-body">
              <h1 className="headline">Hold a plank for the length of a Taylor Swift song.</h1>
              <p className="lede">
                Everyone gets the same song each day: plank it to keep your streak. Your ladder climbs her whole catalog,
                shortest song to longest, as fast as you like.
              </p>
            </div>
          </section>

          <section className="section grid" aria-labelledby="today-heading">
            <div className="section-rule" />
            <div className="section-label">
              <h2 id="today-heading">Today</h2>
              <p className="label-meta">{daily.done ? 'Streak safe' : "Today's song to go"}</p>
            </div>
            <div className="section-body today-list">
              <SongRow
                eyebrow="Today's song · the same for everyone"
                song={daily.song}
                done={daily.done}
                startLabel="Start plank"
                onStart={() => start(daily.song, "Today's song")}
                onShare={dailyDone && (() => shareCompletion(dailyDone))}
                onAgain={() => start(daily.song, "Today's song · extra credit")}
              >
                {dailyDone && <p className="row-note">{plankSummary(dailyDone.pauses ?? [], dailyDone.seconds)}</p>}
                {dailyCount !== null && dailyCount > 0 && (
                  <p className="row-note">
                    {dailyCount.toLocaleString()} {dailyCount === 1 ? 'person has' : 'people have'} planked it today
                  </p>
                )}
                {twofer && <p className="row-note signal">It's also your ladder level: one plank counts for both.</p>}
              </SongRow>

              {ladder.finished ? (
                <article className="song-row finished">
                  <div className="row-text">
                    <p className="row-eyebrow">Your ladder · complete</p>
                    <h3 className="row-title">You planked the whole catalog.</h3>
                    <p className="row-album">
                      All {ladder.total} songs, up to All Too Well (10 Minute Version).
                    </p>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setJumpTo(1)}>
                      Start again
                    </button>
                  </div>
                </article>
              ) : (
                <SongRow
                  eyebrow={`Your ladder · level ${ladder.level} of ${ladder.total}`}
                  song={ladder.song!}
                  done={false}
                  startLabel={`Start level ${ladder.level}`}
                  onStart={() => start(ladder.song!, `Level ${ladder.level} of ${ladder.total}`)}
                  onShare={lastClimb && (() => shareCompletion(lastClimb))}
                >
                  <LadderProgress done={ladder.level - 1} total={ladder.total} />
                  {climbed > 0 ? (
                    <p className="row-note">
                      {climbed} {climbed === 1 ? 'level' : 'levels'} climbed today
                      {climbedXp > 0 && ` · +${climbedXp.toLocaleString()} XP`}. Keep going as long as you like.
                    </p>
                  ) : ladder.level === 1 && data.completions.length === 0 ? (
                    <p className="row-note">Level 1 is her shortest song. They get longer from here.</p>
                  ) : (
                    <p className="row-note">Climb as many levels a day as you like. Only today's song keeps your streak.</p>
                  )}
                </SongRow>
              )}
            </div>
          </section>

          <StreakPanel
            completions={data.completions}
            days={days}
            streak={streak}
            today={today}
            onSignIn={offerSignIn}
            rank={rank}
          />
          <Setlist level={ladder.level} onJump={setJumpTo} />
        </main>

        <footer className="site-footer grid">
          <div className="section-rule light" />
          <div className="footer-mark">
            <StarMark size={14} />
          </div>
          <div className="footer-body">
            <p>
              {user
                ? `Synced to ${user.email}.`
                : accountsEnabled
                  ? 'Your progress is saved in this browser. Sign in to take it with you.'
                  : 'Your progress is saved in this browser.'}
            </p>
            <p>A fan project. Not affiliated with Taylor Swift, her label or YouTube.</p>
          </div>
        </footer>
      </div>

      {session && (
        <PlankTimer
          key={`${session.song.id}-${session.label}`}
          session={session}
          prefs={data.prefs}
          onFinish={finish}
          onShare={(plank) => sharePlank(plank)}
          onClose={() => setSession(null)}
          onSignIn={offerSignIn}
          onNext={start}
        />
      )}
      <MusicDialog open={dialog === 'music'} prefs={data.prefs} onClose={() => setDialog(null)} />
      {accountsEnabled && <AccountDialog open={dialog === 'account'} onClose={() => setDialog(null)} rank={rank} />}
      <ConfirmDialog
        open={jumpTo !== null}
        title={jumpTo === 1 && ladder.finished ? 'Start the ladder again?' : `Move to level ${jumpTo}?`}
        confirmLabel={jumpTo === 1 && ladder.finished ? 'Start again' : `Move to level ${jumpTo}`}
        cancelLabel="Cancel"
        onConfirm={confirmJump}
        onCancel={() => setJumpTo(null)}
      >
        {jumpTo !== null && <SongLine song={LADDER[jumpTo - 1]} />}
        <p>Your ladder picks up from this song. Your calendar and streak stay as they are.</p>
      </ConfirmDialog>
      <ShareDialog share={sharing} onClose={() => setSharing(null)} />
    </>
  )
}
