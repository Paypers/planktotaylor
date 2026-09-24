import type { ReactNode } from 'react'
import { LADDER } from '../data/songs'
import { accountsEnabled } from '../lib/account'
import { followLink, hashFor, RANKS } from '../lib/route'
import { LIGHT_XP } from '../lib/xp'
import { PageTop } from './PageTop'

/** One topic: its name in the left column on wide screens, the rules beside it. */
function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="section grid" aria-labelledby={`help-${id}`}>
      <div className="section-rule" />
      <div className="section-label">
        <h2 id={`help-${id}`}>{title}</h2>
      </div>
      <dl className="section-body rules">{children}</dl>
    </section>
  )
}

/** How the site works, from the info button in the header. */
export function HelpPage() {
  return (
    <div className="info-page">
      <PageTop title="How it works" />

      <Topic id="plank" title="Planking">
        <dt>Start</dt>
        <dd>Get into position and press Start. After a 3-second countdown the song plays, and the timer runs with it.</dd>
        <dt>Hold</dt>
        <dd>A plank counts when you hold it to the end of the song. There's no skipping ahead.</dd>
        <dt>Breaks</dt>
        <dd>
          Pausing is fine: use Pause, tap the video, or your phone's media controls, and the song and timer stop
          together. Every break is noted, where in the song and for how long, and shows in what you share. A break
          under a second doesn't count.
        </dd>
        <dt>Ending early</dt>
        <dd>
          Give up, close the plank, leave the page or lose your connection, and that attempt ends there. It's kept in
          your plank history, and you can go again as often as you like.
        </dd>
        <dt>Your best</dt>
        <dd>
          Until you've finished a song, a mark on the progress bar shows the furthest you've held it before. Pass it
          and you'll hear a chime.
        </dd>
        <dt>Chimes</dt>
        <dd>
          With sounds on, a chime plays at halfway and another with 30 seconds left, so you know where you are with
          your face to the floor.
        </dd>
        <dt>Music</dt>
        <dd>
          Each song plays as its album track from YouTube. Some phones only start it from a tap on the video. Turn
          music off in Music & sound, or press Start without music, to plank to the timer alone.
        </dd>
      </Topic>

      <Topic id="lights" title="Aurora lights">
        <dt>Catching them</dt>
        <dd>
          While the song plays, soft light drifts behind the timer, and every so often a light appears with a soft chime.
          Tap it to catch it. Put your phone at least an arm's length away, so catching one means lifting an arm off the
          floor.
        </dd>
        {accountsEnabled && (
          <>
            <dt>What they're worth</dt>
            <dd>
              {LIGHT_XP} XP each, on a plank that earns XP: today's song, or a ladder level the first time, once you've
              held it to the end. Practice and extra goes have lights too, just for fun.
            </dd>
          </>
        )}
        <dt>Missing one</dt>
        <dd>Costs nothing, and is never shown anywhere. Only the lights you catch are counted.</dd>
        <dt>Turning them off</dt>
        <dd>In Settings, under Plank. Off, there are no lights and no light XP.</dd>
      </Topic>

      <Topic id="daily" title="Today's song">
        <dt>The same for everyone</dt>
        <dd>Everyone gets the same song each day, by their own calendar. New releases take the spot on their release day.</dd>
        <dt>Your streak</dt>
        <dd>
          Plank today's song to keep your streak going. The flame in the header lights up once today's is done. Ladder
          levels don't count towards it.
        </dd>
        <dt>Freezes</dt>
        <dd>
          Miss a day and a freeze covers it, so your streak carries on. You get 3 a month, used automatically, and they
          refill on the 1st. A frozen day keeps your streak but doesn't add to it. Freezes cover two days in a row at
          most: miss a third and your streak starts again.
        </dd>
        <dt>Again</dt>
        <dd>Plank today's song as many times as you like after that. The first go is the one that keeps your streak.</dd>
        {accountsEnabled && (
          <>
            <dt>Everyone</dt>
            <dd>
              Once you've planked it, see how everyone did today: how many planked it, the time held together, how many
              held it all the way through, and, once enough people have planked, where the song gets toughest.
            </dd>
          </>
        )}
      </Topic>

      <Topic id="ladder" title="The ladder">
        <dt>Climbing</dt>
        <dd>
          All {LADDER.length} songs, shortest to longest. Plank your next level to climb to the one after, as many a day
          as you like. Levels are climbed in order, never skipped.
        </dd>
        <dt>Two for one</dt>
        <dd>When today's song is also your ladder level, one plank counts for both.</dd>
        <dt>The setlist</dt>
        <dd>
          Every level and how it went: a green tick for no breaks, an orange count for breaks. Tap a song for its
          details, or to plank a level you've climbed again for practice. Practice never moves the ladder.
        </dd>
        <dt>The top</dt>
        <dd>Once you've climbed every level, you can start again from level 1. Your streak and XP stay as they are.</dd>
      </Topic>

      {accountsEnabled && (
        <>
          <Topic id="xp" title="XP and ranks">
            <dt>XP</dt>
            <dd>
              Signed in, every plank earns XP: a point for every second of song, with a bonus for holding it with no
              breaks, and {LIGHT_XP} for each aurora light you catch. Today's song pays every day, a ladder level the first time you climb it. Going again pays nothing,
              unless it's your first go with no breaks after goes with breaks: that earns the bonus.
            </dd>
            <dt>Ranks</dt>
            <dd>
              XP and your ladder level move you from Scribble up to Magnum Opus. Your rank's plaque sits under your name.{' '}
              <a href={hashFor(RANKS)} onClick={(e) => followLink(e, RANKS)}>
                See every rank and what it takes
              </a>
              .
            </dd>
          </Topic>

          <Topic id="account" title="Your account">
            <dt>Without one</dt>
            <dd>
              Everything works without an account. Your progress stays in this browser. The only thing sent is today's
              anonymous count when you plank today's song: a +1, the song's length and where you took breaks, with
              nothing that says who.
            </dd>
            <dt>Signed in</dt>
            <dd>
              Your streak, ladder, XP, plank history, name, photo, sound settings and color themes follow you to every
              device you sign in on. Which theme shows is up to each device. Progress from before you signed in comes
              along too.
            </dd>
          </Topic>
        </>
      )}

      <Topic id="home-screen" title="On your phone">
        <dt>Home screen</dt>
        <dd>
          Add Plank to Taylor to your home screen and it opens full screen, like an app. On iPhone or iPad, tap Share,
          then Add to Home Screen. On Android, use the button the site offers after a couple of planks, or Add to Home
          screen in the browser's menu.
        </dd>
      </Topic>

      <Topic id="share" title="Sharing">
        <dt>After a plank</dt>
        <dd>
          Share it as an image card or as text like Wordle: ten green squares for the song, with an orange one wherever
          you paused.
        </dd>
      </Topic>
    </div>
  )
}
