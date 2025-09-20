import { test, expect } from '@playwright/test'

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

test('login → 1min test (fast) → result → leaderboard', async ({ page }) => {
  // Assume Google login will be manual in CI; here we run as guest and use e2e acceleration
  await page.goto(`${base}/en-US/test?e2e=1`)
  await page.getByRole('button', { name: /開始|start/i }).click()
  await page.getByRole('textbox').fill('Kids type and the seedling grows.')
  await page.getByRole('button', { name: /提交本題/i }).click()
  await expect(page.getByText(/Result|結果|排行榜|Leaderboard/)).toBeVisible()
  await page.goto(`${base}/en-US/leaderboard`)
  await expect(page.getByText(/Leaderboard/)).toBeVisible()
  // Filter interactions
  await page.getByRole('combobox').first().selectOption('weekly')
  await expect(page.getByRole('combobox').first()).toBeVisible()
})

test('garden activity rule visible (no shop)', async ({ page }) => {
  await page.goto(`${base}/en-US/garden`)
  await expect(page.getByText('最近 5 天活躍')).toBeVisible()
  await expect(page.getByRole('button', { name: /Shop|商店/i })).toHaveCount(0)
})


