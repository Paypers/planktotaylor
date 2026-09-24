import { defineConfig } from 'vite'

// Bundles src/server/functions.ts (the site's own logic the Supabase Edge Functions share: reminders,
// streaks and freezes) into supabase/functions/_shared/site.js. Built before every deploy of the functions
// by `npm run functions:deploy`, and not kept in git, so it always matches the site.
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/server/functions.ts', formats: ['es'], fileName: () => 'site.js' },
    outDir: 'supabase/functions/_shared',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
  },
})
