import fs from 'fs'
import path from 'path'
import { Converter } from 'opencc-js'

const PUB = path.resolve(process.cwd(), 'public')
const fromLang = 'zh-CN'
const toLang = 'zh-TW'

function readJson(p){ return JSON.parse(fs.readFileSync(p, 'utf8')) }
function writeJson(p, obj){ fs.writeFileSync(p, JSON.stringify(obj)) }

function ensureDir(p){ if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

function copyAndRelabelPages(){
  const idxPath = path.join(PUB, 'index.json')
  if (!fs.existsSync(idxPath)) throw new Error('public/index.json not found')
  const idx = readJson(idxPath)
  const pages = Number((idx.filesPerLang||{})[fromLang] || 0)
  if (!pages) throw new Error(`filesPerLang.${fromLang} not set or zero`)
  const dstDir = path.join(PUB, toLang)
  ensureDir(dstDir)
  const conv = Converter({ from: 'cn', to: 'tw' })
  for (let i=1;i<=pages;i++){
    const file = `page-${String(i).padStart(4,'0')}.json`
    const src = path.join(PUB, fromLang, file)
    const dst = path.join(dstDir, file)
    const js = readJson(src)
    const items = Array.isArray(js.items) ? js.items : []
    for (const it of items){
      if (it && typeof it === 'object'){
        if (typeof it.text === 'string') it.text = conv(it.text)
        it.lang = toLang
      }
    }
    writeJson(dst, { ...js, items })
  }
  // update index.json
  idx.langs = Array.isArray(idx.langs) ? idx.langs : []
  if (!idx.langs.includes(toLang)) idx.langs.push(toLang)
  idx.filesPerLang = idx.filesPerLang || {}
  idx.filesPerLang[toLang] = pages
  writeJson(idxPath, idx)
  console.log(`✓ Generated ${toLang} from ${fromLang} with ${pages} pages.`)
}

copyAndRelabelPages()


