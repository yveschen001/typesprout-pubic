// Simple keyboard-only checklist runner (non-Playwright) to print hints
// For full e2e a11y, integrate Playwright + axe later.
console.log('Keyboard-only a11y checklist:')
console.log('- Tab order reaches: Skip link -> Nav -> Main -> Footer (if any)')
console.log('- Focus visible ring is apparent on all interactive elements')
console.log('- ARIA landmarks exist: header/nav/main')
console.log('- aria-keyshortcuts present on key components (Test toolbar, Leaderboard list)')
console.log('- Controls have accessible names (aria-label or label) and ≥44px touch targets')
console.log('\nManual steps: run npm run dev, open /en-US/test and /en-US/leaderboard, use Tab/Shift+Tab to verify order, and try Space/R/F shortcuts.')

