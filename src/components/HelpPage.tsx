import { LADDER } from '../data/songs'
import { accountsEnabled } from '../lib/account'
import { clockTime } from '../lib/dates'
import { MORNING_POST, NIGHT_POST, WEBHOOKS_EACH } from '../lib/discord'
import { DISCORD, ERAS, followLink, GROUPS, hashFor, INSTALL, RANKS } from '../lib/route'
import { remindersAvailable } from '../lib/push'
import { LIGHT_XP } from '../lib/xp'
import { PageTop } from './PageTop'
import { Topic } from './Topic'

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
        <dt>Time planked</dt>
        <dd>
          Under your streak, tap Time planked to open a ring of where your time went: today's song, the ladder, or
          planking again, or split by album. Every plank held to the end counts once, goes again included. Tap a slice
          to see it on its own.
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

      <Topic id="eras" title="Collect the eras">
        <dt>Stamps</dt>
        <dd>
          Every song you plank, as today's song or a ladder level, is stamped into its album. See them all in{' '}
          <a href={hashFor(ERAS)} onClick={(e) => followLink(e, ERAS)}>
            Collect the eras
          </a>
          , from the setlist or the Ranks page.
        </dd>
        <dt>Gold</dt>
        <dd>Hold a song with no breaks, any time, and its stamp turns gold.</dd>
        <dt>Badges</dt>
        <dd>
          Stamp every song on an album and its badge is yours, on your Ranks page. When every stamp on it is gold, the
          badge gets a gold edge.
        </dd>
        <dt>New releases</dt>
        <dd>
          New songs premiere as today's song and join their album's page. A release that joins an album has a charm of
          its own, on the edge of the album's badge, for stamping all of its songs. After its premiere day, plank a new song
          from its album page to stamp it: that earns stamps, not XP, and doesn't touch your streak. A badge or charm
          you've won stays when new songs join.
        </dd>
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

      {accountsEnabled && (
        <Topic id="groups" title="Groups">
          <dt>Plank together</dt>
          <dd>
            Signed in, make a group in{' '}
            <a href={hashFor(GROUPS)} onClick={(e) => followLink(e, GROUPS)}>
              Groups
            </a>{' '}
            (from your profile) and share its invite link. Anyone with the link can join: up to 50 members, and 10 groups
            each. You'll need a name to show the group. Your groups show on the home page, under Today.
          </dd>
          <dt>The group page</dt>
          <dd>
            Who's planked today's song (a tick, green with no breaks), everyone's own streak, and the group's streak. Members are
            in the order they joined, or by name: never by streak or breaks. Whoever made the group can rename it, make a new
            invite link (the old one stops working) and remove members.
          </dd>
          <dt>The group streak</dt>
          <dd>
            A private group's day counts when everyone who joined before that day has planked today's song, so joining
            partway through a day never breaks it. A public group's day counts when anyone in it has. A day that doesn't
            count uses one of the group's freezes, on the same rules as yours: 3 a month, at most 2 days in a row. Private or
            public is chosen when the group is made, so the streak always means the same thing.
          </dd>
          <dt>This month</dt>
          <dd>
            A public group also shows how many days each member planked today's song this month, since joining. It starts
            again on the 1st.
          </dd>
          <dt>What the group sees</dt>
          <dd>
            Your name and photo, the days you planked today's song, and whether today's was held with no breaks (a green
            tick).
            Never your breaks, your XP, your ladder or your plank history. In a public group, anyone with its link, signed
            in or not, can see its name, its streak, and each member's name, photo and how many days they planked this
            month.
          </dd>
          <dt>Leaving</dt>
          <dd>
            Leave any time, and join again from the link. If whoever made the group leaves, the member who joined first
            looks after it. The last one out takes the group with them.
          </dd>
        </Topic>
      )}

      {remindersAvailable && (
        <Topic id="reminders" title="Reminders">
          <dt>Daily</dt>
          <dd>
            Signed in, turn on a daily reminder in Settings: today's song and your streak, at the time you pick. It never
            comes once today's song is done.
          </dd>
          <dt>Evening</dt>
          <dd>
            Add a nudge at 8 pm on days you haven't planked yet. It only comes when you have a streak of 3 days or more.
          </dd>
          <dt>Each device</dt>
          <dd>
            Reminders come to the device you turned them on, at its time. On iPhone and iPad, add the site to your home
            screen first. Signing out turns them off there.
          </dd>
        </Topic>
      )}

      {accountsEnabled && (
        <Topic id="discord" title="Discord">
          <dt>Daily post</dt>
          <dd>
            Add Plank to Taylor to a Discord server and it posts in a channel every day: today's song at{' '}
            {clockTime(MORNING_POST)}, and how everyone did at {clockTime(NIGHT_POST)}, in the server's time zone. Each
            post comes with a card.
          </dd>
          <dt>Adding it</dt>
          <dd>
            Signed in, go to{' '}
            <a href={hashFor(DISCORD)} onClick={(e) => followLink(e, DISCORD)}>
              Settings → Discord
            </a>
            . In Discord, open the server's settings, then Integrations → Webhooks → New Webhook, pick the channel and
            Copy Webhook URL. Paste it in, and a hello appears in the channel. Up to {WEBHOOKS_EACH} channels each.
          </dd>
          <dt>What it shares</dt>
          <dd>
            What the daily card shows once you've planked: how many planked, the time held together, how many held it
            all the way through, and where the song gets toughest. Never anyone's name, and never breaks.
          </dd>
          <dt>A group's night</dt>
          <dd>
            A channel can post how one of your groups did instead: its streak, and who held it all the way through or
            planked it, with their names and photos, like Wordle's results. Never who didn't. Any member can choose a
            public group; only whoever made a private one can. Everyone in the group sees where it's posted, and leaving
            the group stops it. Preview tonight's card in Settings → Discord.
          </dd>
          <dt>Stopping it</dt>
          <dd>Remove it in Settings → Discord, or delete the webhook in Discord.</dd>
        </Topic>
      )}

      <Topic id="home-screen" title="On your home screen">
        <dt>The app</dt>
        <dd>
          Add Plank to Taylor to your home screen and it opens full screen from its own icon, like an app. There's no app
          in the App Store or Google Play: this is it.{' '}
          <a href={hashFor(INSTALL)} onClick={(e) => followLink(e, INSTALL)}>
            See how, step by step
          </a>
          , for iPhone, iPad, Android and computers.
        </dd>
        <dt>iPhone and iPad</dt>
        <dd>
          The home screen keeps its own copy of the site, apart from the browser.
          {accountsEnabled
            ? ' Sign in there, with the code from the email, to bring your planks along.'
            : ' It starts afresh there.'}
          {remindersAvailable && ' Daily reminders only come to that copy.'}
        </dd>
      </Topic>

      <Topic id="year" title="Your Plank Year">
        <dt>When</dt>
        <dd>
          From 1 December to the end of January, look back on your year in planks: the time you held, your top album,
          your longest hold, the one that fought back and more. December shows the year so far; January, the year just
          ended.
        </dd>
        <dt>Sharing it</dt>
        <dd>Every slide has its own card to share, sized for a post or a story.</dd>
        <dt>Just yours</dt>
        <dd>It's worked out on your device from your own planks, signed in or not, and it never counts breaks.</dd>
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
