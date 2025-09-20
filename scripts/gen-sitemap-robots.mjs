import { writeFile } from 'node:fs/promises'

const BASE = process.env.SITE_BASE || 'https://example.com'
const langs = ['en-US', 'zh-TW', 'zh-CN']
const paths = ['/', '/practice', '/test', '/result', '/leaderboard', '/profile', '/garden']

const urls = []
for (const l of langs) {
  for (const p of paths) {
    urls.push(`${BASE}/${l}${p}`)
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') +
  `\n</urlset>\n`

await writeFile('public/sitemap.xml', sitemap)
await writeFile('public/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`)
console.log('Generated public/sitemap.xml and public/robots.txt')


