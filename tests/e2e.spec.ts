import { test, expect } from '@playwright/test'

test('happy path: test -> result -> leaderboard (guest)', async ({ page }) => {
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'
  await page.goto(`${base}/en-US/test?e2e=1`)
  await page.getByRole('button', { name: /開始|start/i }).click()
  await page.getByRole('textbox').fill('Kids type and the seedling grows.')
  await page.getByRole('button', { name: /提交本題/i }).click()
  await expect(page.getByRole('heading', { name: /結果|Result/ })).toBeVisible()
  await page.goto(`${base}/en-US/leaderboard`)
  await expect(page.getByText(/排行榜|Leaderboard/)).toBeVisible()
})


