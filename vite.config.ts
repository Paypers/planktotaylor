/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Tests read styles.css as text (?raw) to check it against the theme palettes.
  test: { css: { include: [/styles\.css/] } },
})
