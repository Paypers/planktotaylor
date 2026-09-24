/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { dailySchedule } from './src/lib/daily'
import { addDays, todayKey } from './src/lib/dates'

/**
 * daily.json: the song of the day from a couple of days before the build to a year after it, worked out
 * by the site's own src/lib/daily.ts. The server's reminders and Discord posts read it from the live site,
 * so they name the same song the site does, and a deploy (a new release, say) updates them too.
 */
function dailyJson(): Plugin {
  return {
    name: 'daily-json',
    apply: 'build',
    generateBundle() {
      const from = addDays(todayKey(), -2)
      const source = JSON.stringify({ from, days: dailySchedule(from, 400) })
      this.emitFile({ type: 'asset', fileName: 'daily.json', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), dailyJson()],
  // Tests read styles.css as text (?raw) to check it against the theme palettes.
  test: { css: { include: [/styles\.css/] } },
})
