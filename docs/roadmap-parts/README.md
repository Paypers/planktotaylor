# The roadmap, in parts

[roadmap.md](../roadmap.md) lists everything we've decided to build, big and small. This folder cuts it into parts, each sized for one Claude session. The small features are grouped into one part, each medium feature gets a part of its own, and the biggest (Friends and groups) gets two. The parts follow the roadmap's suggested order.

To build one, hand Claude the file: *"Build docs/roadmap-parts/part-01-quick-wins.md"*.

## The parts

| Part | Builds | Size | Needs first | Schema change | Notes | Done |
| --- | --- | --- | --- | --- | --- | --- |
| [1](part-01-quick-wins.md) | Chimes, your ghost, streak freezes, add to home screen | 4 small | | No | Test on a real iPhone after | ✓ |
| [2](part-02-everyone-today.md) | How everyone did today | Medium | | Yes | | ✓ |
| [3](part-03-aurora-lights.md) | Aurora lights | Medium | 1 | Yes | | ✓ |
| [4](part-04-year-in-review.md) | Year in review | Medium | 1, 3 | No | **Ready by 30 November** | ✓ |
| [5](part-05-daily-reminders.md) | Daily reminders | Medium | 1 | Yes | First server code; two checks before building | |
| [6](part-06-discord-daily-post.md) | Discord daily post | Medium | 2, 5 | Yes | | |
| [7](part-07-collect-the-eras.md) | Collect the eras | Medium | | No | Settle the release badges first | |
| [8](part-08-groups-database.md) | Groups: the database and joining | Large, first half | 1 | Yes | Settle public groups first | |
| [9](part-09-groups-page.md) | Groups: the group page | Large, second half | 8 | Maybe | | |
| [10](part-10-native-app.md) | Native app | Large | 1, 5 | No | Plan and feasibility only, no code yet | |
| [11](part-11-discord-activity.md) | Discord Activity | Large | 8, 9 | ? | Plan and feasibility only, no code yet | |

**Why it's cut this way**

- **Part 1** has all four small features. None of them change the database or need a server. The chimes and the ghost both go in the plank screen's tick loop and `sound.ts`, so they're built back to back.
- **Parts 2–7** are one medium feature each. Each one changes the database, adds server code, or has a lot of new screens, so each gets a session of its own.
- **Groups is split in two** (8 and 9). Part 8 is the first time one player can see another's data, so its database rules need a session of their own. Part 9 builds the page on top.
- **Parts 10 and 11** are too big and too uncertain to build straight away. Each starts with a decision or a small test, then gets planned into more parts.

**Order:** Part 4 needs Part 1 (the best streak counts freezes) and Part 3 (the lights slide), and has a deadline, so don't let it slip behind 5–7. Part 6 uses Part 5's scheduled-function setup and Part 2's stats.

## How every part is built

These apply to every session, on top of the part's own file.

1. **Read first:** the part file, the [rules every feature follows](../roadmap.md#rules-every-feature-follows) at the top of roadmap.md, and the files the part points to.
2. **Decide first.** If the part has a "Decide first" section and the answers aren't written in it yet, ask before writing any code. Write the answers into the part file.
3. **One feature at a time, in the order given.** After each one, `npm test` and `npm run build` pass, and it's been tried in the browser at `http://localhost:5173` (not `127.0.0.1`, where YouTube won't play her tracks).
4. **The person commits, not Claude.** After each feature, stop and give them the commands to run: `git add -A`, `git commit -m "<message>"`, `git pull --rebase`, `git push`. All on `main`. Keep the message as short as possible while still saying what changed, with no co-author lines. Pushing to `main` redeploys the live site, so when the feature changes the schema, say to run `schema.sql` first.
5. **Keep the help up to date.** Any change to a rule, or anything players see, goes into [HelpPage.tsx](../../src/components/HelpPage.tsx) and the [README](../../README.md).
6. **Schema changes** go in [schema.sql](../../supabase/schema.sql) and must be safe to run again (`if not exists`, `drop ... if exists`, new limits added as `not valid`), the way the file does it now.
7. **When the part is done:** put a ✓ in the Done column above. Take the built features out of roadmap.md, including their rows in its Suggested order table (that file only lists what isn't built yet, and this part file keeps the spec). Finish with a short list of anything the person has to do by hand: run `schema.sql`, set secrets, test on a phone.
