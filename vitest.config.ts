import { defineConfig } from 'vitest/config'

// Root test config for the three areas spec Appendix B calls out as earning automated coverage
// (CLAUDE.md "What earns automated tests"): src/lib/dates.ts — month boundaries, challenge
// start/end, both DST transitions — server-side scoring, and maxPointsForDate. Every tested
// module is pure TypeScript with no React or browser dependency, so the default 'node'
// environment is correct and keeps the suite fast. Deliberately not built on top of
// vite.config.ts (Phase 0's file) — this config has nothing to share with it and staying separate
// avoids any collision with concurrent Phase 0 work on that file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
  },
})
