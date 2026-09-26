// What the Supabase Edge Functions share with the site, bundled for them into one plain module
// (supabase/functions/_shared/site.js) by `npm run functions:build`, so they never keep a copy of their own.
export { dueReminder, localClock, PUSH_SERVICE, reminderMessage } from '../lib/reminders'
export {
  DISCORD_WEBHOOK,
  duePost,
  everyoneCard,
  FACES_SHOWN,
  groupCard,
  groupNight,
  groupNightPost,
  hideTokens,
  knownZone,
  morningCard,
  morningPost,
  nightPost,
  WEBHOOKS_EACH,
  webhookAddress,
  webhookLabel,
  welcomePost,
} from '../lib/discord'
export { readStats } from '../lib/together'
export { photoInOwnBucket } from '../lib/avatar'
