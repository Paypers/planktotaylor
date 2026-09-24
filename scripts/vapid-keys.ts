// Makes everything daily reminders need to be sent: the key pair that signs them (VAPID), and a secret
// the schedule uses to call the send-reminders function (and the Discord post's discord-post function).
// Run once: `npm run vapid`.
//
// Writes supabase/functions.env (kept out of git) for `npx supabase@2 secrets set --env-file supabase/functions.env`,
// and prints the public key for the site (VITE_VAPID_PUBLIC_KEY) and the lines for Supabase's Vault.
// Making new keys later stops every reminder until each device turns them on again, so it won't
// overwrite the file unless asked: `npm run vapid -- --force`.
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const FILE = 'supabase/functions.env'
const SITE = 'https://planktotaylor.pages.dev'
// The function's address, from the project's URL in .env when it's there.
const project = process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ?? 'https://<project-ref>.supabase.co'
const functionUrl = `${project}/functions/v1/send-reminders`

if (existsSync(FILE) && !process.argv.includes('--force')) {
  console.error(`${FILE} already exists. Making new keys stops every reminder until each device turns them on again.`)
  console.error('To do it anyway: npm run vapid -- --force')
  process.exit(1)
}

const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('base64url')
const vapidKeys = JSON.stringify({
  publicKey: await crypto.subtle.exportKey('jwk', keys.publicKey),
  privateKey: await crypto.subtle.exportKey('jwk', keys.privateKey),
})
const secret = randomBytes(32).toString('base64url')

writeFileSync(
  FILE,
  [
    '# Secrets for the send-reminders Edge Function. Never commit this file.',
    '# npx supabase@2 secrets set --env-file supabase/functions.env',
    `VAPID_KEYS='${vapidKeys}'`,
    // Who push services contact about these messages: the site, rather than anyone's email address.
    `VAPID_SUBJECT=${SITE}`,
    // Where daily.json (today's song) is read from.
    `SITE_URL=${SITE}`,
    `REMINDERS_SECRET=${secret}`,
    '',
  ].join('\n'),
)

console.log(`Wrote ${FILE}.\n`)
console.log('1. The site needs the public key. Add this line to .env, and the same variable to the host\'s build settings:\n')
console.log(`   VITE_VAPID_PUBLIC_KEY=${publicKey}\n`)
console.log('2. Give the function its secrets:\n')
console.log('   npx supabase@2 secrets set --env-file supabase/functions.env\n')
console.log("3. Save the address and secret the schedule calls the function with. These two lines are SQL: paste them into")
console.log('   the Supabase dashboard → SQL Editor → New query, and press Run (not into this terminal):\n')
console.log(`   select vault.create_secret('${functionUrl}', 'reminders_url');`)
console.log(`   select vault.create_secret('${secret}', 'reminders_secret');\n`)
