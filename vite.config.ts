import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// The Settings footer reads this. Injected from package.json at build time rather than typed
// into a component, so the number shown in the app is always the number that was released.
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
