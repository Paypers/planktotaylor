# Coding standards

## General style

- **Follow the patterns already here.** Match the surrounding code's structure and
  idiom rather than introducing a new approach. If something genuinely has no
  precedent, say so explicitly and use it only where it's needed for correctness.
- **Stay inside the task.** Don't refactor functions you weren't asked to touch,
  and don't change code that isn't strictly necessary for the work at hand.

## File size and shape

Aim to split a file once it reaches **about 200 lines**. This is a loose guideline, not a hard limit - but a file past it is usually doing more than one job.

Separate **business logic** from **presentation**. Logic goes in `src/lib/`,
where it can be read and tested without React.

Bad:

```
PomodoroSection.tsx — 357 lines: form state, minute↔second conversion,
                      validation, Supabase writes, and all the markup
```

Good:

```
lib/settings/pomodoroSettingsForm.ts  — conversion, validation, normalization
store/boardStore.ts                   — the Supabase write
settings/PomodoroSection.tsx          — form wiring and markup (159)
settings/PomodoroDurationField.tsx    — the field, used 4×
```

## One thing per component, one task per function

A component should do exactly one thing. If it does more, either split it or ask
whether it should exist at all.

Bad:

```tsx
<GoogleCalendarPanel /> // connection + migration prompt + calendar picker
```

Good:

```tsx
<GoogleCalendarPanel />; // composition
useGoogleMigrationPrompt(); // "what about my existing events?"
useSyncedCalendarPicker(); // "which calendars do we pull from?"
```

The same applies to functions. A 90-line `handleSaveEvent` that validates,
converts dates, branches on event-vs-occurrence and reports errors becomes
`findDraftError()` + `draftToEventFields()` + a short handler that orchestrates
them.

## Group related files into folders

Files sit in a folder that says what they are. No loose files in
`src/components/`.

```
src/
  pages/                 top-level screens
  components/
    board/ widgets/ tasks/ settings/
    ui/                  generic primitives with no domain knowledge
  lib/
    calendar/ tasks/ settings/ auth/ appearance/
    hooks/               cross-cutting UI mechanics
  store/  types/
```

## Naming: clarity over brevity

The qualifier that says _how_ something works is part of the name, not noise to
be trimmed. This applies to function and variable names.

Bad:

```ts
getUser(id)
requirement.test(pw)
resetDisabled={...}
<ColorCategoryCard>
```

Good:

```ts
getUserById(id)
requirement.isSatisfiedBy(pw)
isAtDefaults={...}
<ResettableSettingsCard>
```

Name props for **why**, not for the DOM state they happen to produce:
`resetDisabled` described the button's attribute; `isAtDefaults` says why it's
disabled, which is what every caller was already computing.

## Functional style

- Use `const` instead of `let` - don't reassign or mutate.
- Avoid side effects other than inside `useEffect` hooks.

Good:

```ts
const state = { ...DEFAULT };
if (parsed.count) {
    state.repeatEndMode = "afterCount";
    state.repeatCount = parsed.count;
}
return state;
```

Bad:

```ts
return { ...DEFAULT, ...repeatEndStateFromRule(parsed) };
```

## Reuse: if it's duplicated, make it a component

When the same markup or logic appears in more than one file, lift it into a
shared component or hook rather than leaving parallel copies. Duplicated logic is
the dangerous kind — copies drift apart silently.

Real examples from this codebase:

| Was duplicated                                | Now                             |
| --------------------------------------------- | ------------------------------- |
| Three hand-rolled confirm dialogs             | `ui/ConfirmDialog`              |
| 12 hand-styled error/success lines            | `ui/StatusMessage`              |
| The password rules, verbatim in 2 files       | `lib/auth/passwordRequirements` |
| ~35 lines of all-day layout maths, in 2 files | `lib/calendar/allDayLayout`     |
| `resolveUserId`, verbatim in 2 stores         | `lib/getSignedInUserId`         |

## Comments

Use `//` — never `/** ... */`, including on exported functions and types.
Keep them to **two or three lines**. They don't need to be grammatical
sentences. Anyone reading the comment should be able to understand it in 2 seconds. You almost never need to be commenting to explain style (e.g., Tailwind code).

**Short sentences, plain words, one idea each.** Being short isn't enough — a
comment that stacks clauses is slow to read at any length. Say what it does,
then why. If you have to read it twice, split it into two sentences.

Bad:

```css
/* Set on the canvas while a group drag runs, so the frames following the one
   under the pointer move without React re-rendering the board. The frame's
   shared transition covers transform, which would leave them lagging behind */
```

Good:

```css
/* Moves the rest of the selection while one widget is dragged.
   Transitions off, or they lag behind the cursor. */
```

**A comment should never duplicate the code.** If the code is
self-explanatory, delete the comment rather than shortening it.

Bad:

```ts
/** Resolves what was typed to a real task, creating one in Today when it
 *  doesn't match anything there yet. Returns the id, or null if there was
 *  nothing to resolve. */
```

Good:

```ts
// Creates a task if entered text doesn't exist as a task yet
```

Comments on types and interfaces should generally be **removed** — field names
are expected to carry that meaning.

What survives is the reasoning you can't recover from the code: why this
approach over the obvious one, or a non-obvious consequence of it.

```ts
// An all-day event is a floating calendar date, stored as UTC midnight purely
// as a carrier, so it has to be read back in UTC -- read in the viewer's zone,
// an Aug 31 event renders as Aug 30-31 west of UTC
```

**No references a future reader can't resolve.** No ticket IDs, PR numbers,
sprint or phase names, and no allusions to code that no longer exists. If the
reasoning behind such a reference matters, state the reasoning.

Bad:

```ts
// READY-03's conflict policy, applied at the one place it matters
// ...as before / the old HOUR_HEIGHT/4 floor this replaces
```

Good:

```ts
// Expiry has to ride in the query string. Passed as a header it lands in
// SignedHeaders and gets signed with a value the browser never sends, so R2
// recomputes a different signature and 403s
```

## Settings and persistence

**Every user-editable setting belongs in the Supabase `user_preferences` table.**
`profiles` holds identity only.

- Add the column with an `alter table` at the end of `supabase-sql/schema.sql`,
  with a one-line comment saying what it's for.
- Read it with `select("*")`, not a column list: PostgREST fails the whole
  request if any named column is missing, so an unapplied migration would take
  the entire settings screen down.
- Fall back to a default when the column reads back `undefined`.

## Queries and writes

Every Supabase call is a round trip. What costs is the **number of requests**.

**One request per user action, not one per row.** A write inside a loop is a
request per iteration.

Bad:

```ts
orderedIds.forEach((id, index) => updateTaskRow(id, { sort_order: index }));
```

Good:

```ts
// One value for every row
supabase.from("tasks").update({ focus_today: false }).in("id", taskIds);

// A value per row -- one statement, in the database
supabase.rpc("reorder_tasks", { task_ids: orderedIds });
```

Set-valued functions go at the end of `supabase-sql/schema.sql`. Leave them
`security invoker` so RLS still applies, and check `auth.uid()` anyway:

```sql
update tasks t
set sort_order = ordered.position - 1
from unnest(task_ids) with ordinality as ordered(id, position)
where t.id = ordered.id and t.user_id = auth.uid();
```

**One read per row, not one per consumer.** Stores wanting the same row share
the request, not the result — see `lib/settings/userPreferencesRow`. Each still
maps the columns it cares about.

**Select only what something reads.** A column earns its place in a `select` by
being read. `user_preferences` is the standing exception, for the reason above.

**Let the database do set work.** Reading rows to write them straight back is
two round trips and a race.

Bad:

```ts
const { data } = await supabase.from("board_widgets").select("id, data")...
data.forEach((row) => saveWidgetData(row.id, { ...row.data, ...settings }));
```

Good:

```sql
update board_widgets set data = data || settings
where user_id = auth.uid() and type = 'timer';
```

**Nothing on a timer runs in a background tab.** Gate intervals on
`usePageVisibility`, and sync once on return so what you look at is never stale.

**Don't refetch what didn't change.** Have the server report what it touched.

Bad:

```ts
await runGoogleCalendarSync();
await refreshEvents();
```

Good:

```ts
const counts = await runGoogleCalendarSync();
if (counts.pulled > 0 || counts.pushed > 0) await refreshEvents();
```

**Bulk bytes don't belong in a row.** Store a key; serve the bytes from object
storage.
