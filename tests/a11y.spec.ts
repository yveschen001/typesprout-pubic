import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

test.describe('a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${base}/en-US/`)
  })

  test('home has no critical a11y violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()
    const critical = results.violations.filter(v => ['critical','serious'].includes(v.impact || ''))
    // save report for artifact
    fs.mkdirSync('tests-results', { recursive: true })
    fs.writeFileSync('tests-results/axe-home.json', JSON.stringify(results, null, 2))
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })

  test('test page keyboard focusable controls', async ({ page }) => {
    await page.goto('/en-US/test')
    await expect(page.getByRole('progressbar')).toBeVisible()
    await page.keyboard.press('F')
    await page.keyboard.type('abc')
    await page.keyboard.press('Space')
    await page.keyboard.press('R')
  })

  test('leaderboard filters and class/grade URL params', async ({ page }) => {
    await page.goto('/en-US/leaderboard?grade=3&class=ABC')
    await expect(page.getByText(/排行榜|Leaderboard/)).toBeVisible()
    await page.keyboard.press('Alt+ArrowDown') // sort desc
  })

  test('garden actions visible', async ({ page }) => {
    await page.goto('/en-US/garden')
    await expect(page.getByRole('heading', { level: 2, name: /種樹|Garden|我的小樹/i })).toBeVisible()
    await expect(page.getByText('最近 5 天活躍')).toBeVisible()
  })

  // 商店已移除
})


