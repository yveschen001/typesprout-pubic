// TypeSprout · Bible (Standalone) — Build/Fetch/Export
// API.Bible docs: https://docs.api.bible/ and site: https://scripture.api.bible/
// NEVER hardcode API keys. Set Script Properties → key: API_BIBLE_KEY

/* =================== Menu =================== */
function onOpen_BibleMenu(){
  var uiSvc;
  try { uiSvc = SpreadsheetApp.getUi(); } catch(e){ Logger.log('Bible onOpen skipped: no UI'); return; }
  var ui = uiSvc.createMenu('Bible')
    .addItem('① 建立/重置表格（config / bible_refs / bible_bank）', 'bible_buildSheets')
    .addItem('② 依 config×refs 抓取並寫入 bible_bank', 'bible_fetchAndBuildBank')
    .addItem('③ 導出 bible_bank → JSON（分頁）', 'bible_exportBankPrompt')
    .addSeparator()
    .addItem('工具：列出語言可用版本 → bibles_catalog', 'bible_listBiblesCatalogPrompt')
    .addItem('工具：將選取版本套用到 config', 'bible_applyCatalogSelectionToConfig')
    .addItem('工具：依 bible_bank 表頭批次列版本', 'bible_batchListByBankHeader')
    .addItem('工具：依表頭補齊 config 語言列', 'bible_fillConfigFromBankHeader')
    .addItem('工具：快速測試 API 金鑰', 'bible_quickKeyTest')
    .addItem('工具：快速探測常用語言版本(寫入 bibles_probe)', 'bible_probeCommonLanguages')
    .addItem('工具：檢視 CDN 可用版本(寫入 bibles_cdn_catalog)', 'bible_probeCdnCatalog')
    .addItem('工具：列出此 API Key 可用的全部版本(寫入 bibles_all)', 'bible_dumpAllBibles')
    .addItem('一鍵：寫入建議版本到 config', 'bible_applyRecommendedMapping')
    .addItem('工具：掃描 bible_refs 重複', 'bible_scanRefsDuplicates')
    .addItem('按選取語言抓取 → 寫入 bible_bank', 'bible_fetchSelectedLanguageToBank')
    .addItem('按選取語言「從游標續跑」→ 寫入 bible_bank', 'bible_fetchSelectedLanguageFromCursor')
    .addItem('按選取區塊（bible_bank）自動判斷語言並填寫', 'bible_fetchBySelectionRange')
    .addItem('按選取區塊（僅覆寫空白）', 'bible_fetchBySelectionRangeEmptyOnly')
    .addItem('工具：移除 bible_refs 重複（保留首見）', 'bible_removeRefsDuplicatesKeepFirst')
    .addItem('工具：刪除英文>180字之行（bank+refs）', 'bible_deleteRowsEnglishOver180')
    .addItem('工具：刪除空白行（bank+refs）', 'bible_deleteEmptyRowsBankAndRefs')
    .addSeparator()
    .addItem('🔄 將英文來源轉換為目標語言聖經版本', 'bible_translateEnglishToTargetLanguage')
    .addItem('⚡ 快速批量轉換（優化版）', 'bible_fastBatchTranslate')
    .addItem('🚀 智能分批轉換（大數據專用）', 'bible_smartBatchTranslate')
    .addItem('⚡ 超高速併發轉換（基於舊版優化）', 'bible_ultraFastTranslate')
    .addItem('🚀 極簡超高速轉換（大數據專用）', 'bible_simpleUltraFast')
    .addItem('🔧 超穩定轉換（小批次版）', 'bible_ultraStable')
    .addItem('🔄 一鍵開始/繼續轉換（續跑版）', 'bible_fastBatchTranslate_cursored')
    .addItem('🗑️ 清除當前選取的續跑狀態', 'bible_cursor_clearAllForCurrentSelection')
    .addToUi();
}

/* =================== Sheets scaffold =================== */
var SHEET_BCONF = 'config';
var SHEET_BREFS = 'bible_refs';
var SHEET_BBANK = 'bible_bank';
var SHEET_BCATA = 'bibles_catalog';
var SHEET_BPROBE = 'bibles_probe';

function bible_buildSheets(){
  var ss = SpreadsheetApp.getActive();
  // config: lang, bibleId, version, license, notes
  var sc = ss.getSheetByName(SHEET_BCONF) || ss.insertSheet(SHEET_BCONF);
  sc.clear();
  var h1 = ['lang','bibleId','version','license','notes'];
  var d1 = [
    ['zh-TW','<fill-after-list>','RCUV','©','繁中譯本 ID 請填入'],
    ['en-US','<fill-after-list>','NIV','©','英文譯本 ID 請填入']
  ];
  sc.getRange(1,1,1,h1.length).setValues([h1]).setFontWeight('bold');
  sc.getRange(2,1,d1.length,h1.length).setValues(d1);
  sc.setFrozenRows(1);

  // bible_refs: id, ref_human, ref_osis, tags, grade_min, grade_max
  var sr = ss.getSheetByName(SHEET_BREFS) || ss.insertSheet(SHEET_BREFS);
  sr.clear();
  var h2 = ['id','ref_human','ref_osis','tags','grade_min','grade_max'];
  var d2 = [
    ['BIB-NIV-JHN-003-016','John 3:16','JHN.3.16','audience:adult;category:bible;version:NIV', '7','12'],
    ['BIB-RCUV-PSA-023','詩篇 23 篇','PSA.23','audience:adult;category:bible;version:RCUV','7','12']
  ];
  sr.getRange(1,1,1,h2.length).setValues([h2]).setFontWeight('bold');
  sr.getRange(2,1,d2.length,h2.length).setValues(d2);
  sr.setFrozenRows(1);

  // bible_bank: align to content_bank schema (id | type | grade_min | grade_max | tags | <langs>)
  var sb = ss.getSheetByName(SHEET_BBANK) || ss.insertSheet(SHEET_BBANK);
  sb.clear();
  var h3 = ['id','type','grade_min','grade_max','tags',
    'zh-TW','en-US','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU',
    'ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY',
    'hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR','zh-CN'];
  sb.getRange(1,1,1,h3.length).setValues([h3]).setFontWeight('bold');
  sb.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ 已建立表格：config / bible_refs / bible_bank');
}

/* =================== Config helpers =================== */
function getApiBibleKey_(){
  var k = PropertiesService.getScriptProperties().getProperty('API_BIBLE_KEY');
  if (!k) throw new Error('缺少 API_BIBLE_KEY。請到「專案設定 → 腳本屬性」新增。');
  return k;
}
function getHeaders_(){ return { 'Content-Type':'application/json', 'api-key': getApiBibleKey_() }; }

// ---- Rate limiting helpers (per docs: ~5,000/day) ----
var RATE_LIMIT_MS = 300;       // base delay between requests
var MAX_RETRIES   = 3;         // 429/5xx backoff
var DAILY_SOFT_CAP= 4800;      // stop before 5,000

function getTodayKey_(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd'); }
function getQuotaCount_(){ var p=PropertiesService.getScriptProperties(); var k='API_Q_'+getTodayKey_(); return Number(p.getProperty(k)||'0'); }
function incQuotaCount_(n){ var p=PropertiesService.getScriptProperties(); var k='API_Q_'+getTodayKey_(); var v=Number(p.getProperty(k)||'0')+(n||1); p.setProperty(k,String(v)); return v; }
function quotaAvailable_(){ return getQuotaCount_() < DAILY_SOFT_CAP; }

function fetchWithBackoff_(req){
  if (!quotaAvailable_()) return { code:429, text:'' };
  var wait = RATE_LIMIT_MS;
  for (var t=0;t<MAX_RETRIES;t++){
    try{
      var res = UrlFetchApp.fetch(req.url, { method:'get', headers:req.headers||{}, muteHttpExceptions:true, payload:req.payload||null });
      var code = res.getResponseCode(); var text = res.getContentText();
      if (code>=200 && code<300){ incQuotaCount_(1); return { code:code, text:text }; }
      if (code===429 || (code>=500 && code<600)) { Utilities.sleep(wait); wait = Math.min(wait*2, 2000); continue; }
      return { code:code, text:text };
    }catch(e){ Utilities.sleep(wait); wait=Math.min(wait*2,2000); }
  }
  return { code:599, text:'' };
}

var PROGRESS_EVERY = 20; // 顯示進度頻率（每處理N條提示一次）

function httpGetJson_(url){
  var r = fetchWithBackoff_({ url:url, headers: getHeaders_() });
  if (r.code>=200 && r.code<300){ try { return JSON.parse(r.text); } catch(e){ return null; } }
  Logger.log('HTTP '+r.code+' '+url+' body:'+(r.text||'').slice(0,180));
  return null;
}

function httpGetJsonOpen_(url){
  var r = fetchWithBackoff_({ url:url, headers:{} });
  if (r.code>=200 && r.code<300){ try { return JSON.parse(r.text); } catch(e){ return null; } }
  Logger.log('HTTP(open) '+r.code+' '+url+' body:'+(r.text||'').slice(0,180));
  return null;
}

/* =================== Fetch passages =================== */
// API endpoints (see docs): https://docs.api.bible/
var API_BASE = 'https://api.scripture.api.bible/v1';
// Open CDN fallback (no key): https://github.com/wldeh/bible-api
var CDN_BASE = 'https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles';
var CDN_BASE_RAW = 'https://raw.githubusercontent.com/wldeh/bible-api/main/bibles';
var EN_FALLBACK_CDN = 'cdn:en-kjv';

function normLangForApi_(code){
  var c = String(code||'').trim().replace('_','-');
  var short = c.split('-')[0];
  // 首選對照：針對你的表頭做完整映射
  var alias = {
    'zh-TW':'zh-Hant','zh-CN':'zh-Hans',
    'en-US':'en','es-MX':'es','pt-BR':'pt',
    'ja-JP':'ja','ko-KR':'ko','fr-FR':'fr','de-DE':'de','it-IT':'it',
    'id-ID':'id','vi-VN':'vi','th-TH':'th','ru-RU':'ru','ar-SA':'ar',
    'fil-PH':'fil','nl-NL':'nl','pl-PL':'pl','sv-SE':'sv','nb-NO':'nb',
    'da-DK':'da','fi-FI':'fi','ro-RO':'ro','el-GR':'el','cs-CZ':'cs','hu-HU':'hu','uk-UA':'uk','ms-MY':'ms',
    'hi-IN':'hi','bn-BD':'bn','he-IL':'he','fa-IR':'fa','ur-PK':'ur','tr-TR':'tr'
  };
  return { pref: alias[c]||c, short: short };
}

function listBiblesByLanguage_(langCode){
  var n = normLangForApi_(langCode);
  var iso3 = {
    'zh':'zho','en':'eng','es':'spa','pt':'por','ja':'jpn','ko':'kor','fr':'fra','de':'deu','it':'ita','id':'ind','vi':'vie','th':'tha','ru':'rus','ar':'ara','fil':'fil','nl':'nld','pl':'pol','sv':'swe','nb':'nob','da':'dan','fi':'fin','ro':'ron','el':'ell','cs':'ces','hu':'hun','uk':'ukr','ms':'msa','hi':'hin','bn':'ben','he':'heb','fa':'fas','ur':'urd','tr':'tur'
  };
  var extras = {
    'zh': ['cmn'],
    'ar': ['arb'],
    'fil': ['tl','tgl'],
    'ms': ['zsm'],
    'fa': ['pes','per'],
    'el': ['gre']
  };
  var tries = [];
  // 依序嘗試：首選對照 → 完整碼 → 短碼 → ISO3 → 中文特例
  tries.push(n.pref);
  if (tries.indexOf(n.short)===-1) tries.push(n.short);
  if (iso3[n.short] && tries.indexOf(iso3[n.short])===-1) tries.push(iso3[n.short]);
  if ((n.pref==='zh-Hant' || n.pref==='zh-Hans') && tries.indexOf('zh')===-1) tries.push('zh');
  if (tries.indexOf('zho')===-1 && (n.short==='zh' || n.pref.indexOf('zh')===0)) tries.push('zho');
  if (extras[n.short]){
    for (var e=0;e<extras[n.short].length;e++) if (tries.indexOf(extras[n.short][e])===-1) tries.push(extras[n.short][e]);
  }

  for (var i=0;i<tries.length;i++){
    var code = tries[i]; if (!code) continue;
    var u = API_BASE + '/bibles?language='+encodeURIComponent(code);
    var r = httpGetJson_(u);
    if (r && r.data && r.data.length) return r;
  }
  return { data: [] };
}

function fetchPassageText_(bibleId, passageId){
  // 1) 嘗試 passages（純文字）
  var qs = 'contentType=text&include-verse-numbers=false&include-verse-spans=false';
  var base = API_BASE + '/bibles/'+encodeURIComponent(bibleId);
  var u1 = base + '/passages/'+encodeURIComponent(passageId)+'?'+qs;
  var js1 = httpGetJson_(u1);
  var content = '';
  if (js1 && js1.data){
    content = js1.data.content || '';
    if (!content && js1.data.passages && js1.data.passages.length){ content = js1.data.passages[0].content || ''; }
  }

  // 2) 若空，依 OSIS 形態改試 verses 或 chapters（純文字）
  if (!content){
    var os = String(passageId||'').trim();
    var mVerse = os.match(/^[A-Z0-9]{3}\.(\d+)\.(\d+)$/);
    var mChap  = os.match(/^[A-Z0-9]{3}\.(\d+)$/);
    try {
      if (mVerse){
        var u2 = base + '/verses/'+encodeURIComponent(os)+'?'+qs;
        var js2 = httpGetJson_(u2);
        if (js2 && js2.data){ content = js2.data.content || ''; }
      } else if (mChap){
        var u3 = base + '/chapters/'+encodeURIComponent(os)+'?'+qs;
        var js3 = httpGetJson_(u3);
        if (js3 && js3.data){ content = js3.data.content || ''; }
      }
    } catch(e) { /* ignore and continue */ }
  }

  // 3) 若仍空，再用 passages（HTML）並剝除標籤
  if (!content){
    try {
      var u4 = base + '/passages/'+encodeURIComponent(passageId);
      var js4 = httpGetJson_(u4);
      if (js4 && js4.data){
        content = js4.data.content || '';
        if (!content && js4.data.passages && js4.data.passages.length){ content = js4.data.passages[0].content || ''; }
      }
    } catch(e) { /* ignore */ }
  }

  // 剝除 HTML、節號、壓空白
  if (/<[^>]+>/.test(String(content))) content = String(content).replace(/<[^>]+>/g,'');
  content = stripVerseNumAtStart_(String(content||''));
  content = stripLeadingQuotes_(content);
  content = cleanInlineNoise_(content);
  content = content.replace(/\s+/g,' ').trim();
  return content;
}

// 嘗試去掉節號（常見於英文："13But now faith..." 或 "13 But now..."）
function stripVerseNumAtStart_(s){
  var t = String(s||'');
  // 0) 先移除段落符號 ¶（行首與換行起始）
  t = t.replace(/(^|[\n\r])\s*[\u00B6]+[\s\u00A0]*/g, '$1');
  // 1) 去掉詩篇119等小節抬頭 + 節號（如 NUN105) 或 ALEPH 1 ）
  t = t.replace(/^[\s\u00A0]*(?:ALEPH|BETH|GIMEL|DALETH|HE|VAU|ZAIN|CHETH|TETH|JOD|CAPH|LAMED|MEM|NUN|SAMECH|AYIN|PE|TSADDI|KOPH|RESH|SCHIN|SHIN|TAU)[\s\u00A0\-–—]*\(?\d{1,3}[A-Za-z]?\)?[\s\u00A0]*/, '');
  // 2) 開頭節號：
  //    - 數字後直接接正文（任何非數字非空白字元：含中英文、CJK 等）
  t = t.replace(/^\s*\(?\d{1,3}\)?(?=[^\d\s])/, '');
  //    - 只移除數字(+可選單字母後綴)且後面是空白/標點（如 "13B )"、"13 ")
  t = t.replace(/^\s*\(?\d{1,3}[A-Za-z]?\)?(?=[\s\u00A0\)\-–—,.:;!?]|$)[\s\u00A0]*/, '');
  // 3) 段落內殘留（空白後的數字）：
  //    - 空白+數字後直接接正文（任何非數字非空白）
  t = t.replace(/([\s\u00A0])\(?\d{1,3}\)?(?=[^\d\s])/g, '$1');
  //    - 空白+數字(+可選單字母)且後面是空白/標點：全去
  t = t.replace(/([\s\u00A0])\(?\d{1,3}[A-Za-z]?\)?(?=[\s\u00A0\)\-–—,.:;!?]|$)/g, '$1');
  // 4) 少數來源使用冒號樣式："105: Thy word..."（限制在起首）
  t = t.replace(/^\s*\d{1,3}:[\s\u00A0]*/, '');
  return t;
}

// 去掉字串起始的引號類與空格： ” ” ” ” " ' ‘ ’ 等
function stripLeadingQuotes_(s){
  var t = String(s||'');
  // 擴充：加入中日韓常見引號/書名號/全形括號作為「開頭即剝除」的特殊符號
  //  - 角括引號：「」(\u300C\u300D)、『』(\u300E\u300F)
  //  - 書名號：﹁﹂(\uFE41\uFE42)、﹃﹄(\uFE43\uFE44)
  //  - 全形括號（常見於資料來源前置標示）：（）［］｛｝〈〉《》【】
  //  - 西文引號：" ' “ ” „ ‟ ‘ ’ ‚ ‛ « »
  t = t.replace(/^\s*[\"'\u00AB\u00BB\u201C\u201D\u201E\u201F\u2018\u2019\u201A\u201B\u300C\u300D\u300E\u300F\uFE41\uFE42\uFE43\uFE44\uFF08\uFF09\u3010\u3011\uFF3B\uFF3D\uFF5B\uFF5D\u3008\u3009\u300A\u300B\u3014\u3015]+\s*/, '');
  return t;
}

// 行內清理：零寬字元、書名號/引號殘留、標點與括號旁多餘空白
function cleanInlineNoise_(s){
  var t = String(s||'');
  // 零寬與 NBSP → 空白
  t = t.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ');
  // 全域移除中西引號/書名號（來源常見外框符號）
  t = t.replace(/[\"'\u00AB\u00BB\u201C\u201D\u201E\u201F\u2018\u2019\u201A\u201B\u300C\u300D\u300E\u300F\uFE41\uFE42\uFE43\uFE44]/g, '');
  // 標點左右空白歸一
  t = t.replace(/\s*([,.;:!?，。；：！？、])\s*/g, '$1');
  // 括號內外多餘空白
  t = t.replace(/([\(\[\{\uFF08\u3014\u3010\u3008\u300A\u300E\u300C])\s+/g, '$1');
  t = t.replace(/\s+([\)\]\}\uFF09\u3015\u3011\u3009\u300B\u300F\u300D])/g, '$1');
  // 連續空白壓縮（主流程仍會再壓一次）
  t = t.replace(/\s{2,}/g, ' ');
  return t;
}

// 修正常見被吃掉首字母的案例："nd " → "And ", "ut " → "But "（僅在句首或換行後）
function fixCommonLeadingLoss_(s){
  var t = String(s||'');
  // 句首
  t = t.replace(/^\s*nd\b/, 'And');
  t = t.replace(/^\s*ut\b/, 'But');
  // 換行後
  t = t.replace(/([\n\r]+)nd\b/g, '$1And');
  t = t.replace(/([\n\r]+)ut\b/g, '$1But');
  return t;
}

/* =================== Fallback (CDN) =================== */
function fetchFallbackCatalog_(lang){
  var idx = httpGetJsonOpen_(CDN_BASE + '/bibles.json');
  if (!idx || !(idx instanceof Array)) {
    idx = httpGetJsonOpen_(CDN_BASE_RAW + '/bibles.json');
    if (!idx || !(idx instanceof Array)) return [];
  }
  var c = String(lang||'').toLowerCase();
  var short = c.split('-')[0];
  var nameAlias = {
    'ja': ['japanese'],
    'ko': ['korean'],
    'ru': ['russian'],
    'ar': ['arabic'],
    'fil': ['filipino','tagalog','tl'],
    'tl': ['filipino','tagalog'],
    'da': ['danish'],
    'ro': ['romanian'],
    'el': ['greek','hellenic'],
    'ms': ['malay','bahasa melayu'],
    'fa': ['persian','farsi'],
    'zh': ['chinese','zhongwen']
  };
  var list = [];
  for (var i=0;i<idx.length;i++){
    var it = idx[i]||{};
    var id = String(it.id||'');
    var language = (it.language || it.lang || (it.language_name||'')).toString().toLowerCase();
    if (!id || !language) continue;
    var ok = false;
    if (language.indexOf(c)===0 || language.indexOf(short)===0 || id.indexOf(short+'-')===0) ok = true;
    if (!ok && nameAlias[short]){
      for (var a=0;a<nameAlias[short].length;a++){
        if (language.indexOf(nameAlias[short][a])!==-1) { ok = true; break; }
      }
    }
    if (ok){
      list.push({ id: 'cdn:'+id, name: it.name||id, abbreviation: it.abbreviation||'', copyright: it.license||'', dblId: '' });
    }
  }
  return list;
}

function osisToFallbackPath_(osis){
  var os = String(osis||'').trim();
  var mVerse = os.match(/^([A-Z]{3})\.(\d+)\.(\d+)$/);
  var mChap  = os.match(/^([A-Z]{3})\.(\d+)$/);
  var map = {
    GEN:'genesis', EXO:'exodus', LEV:'leviticus', NUM:'numbers', DEU:'deuteronomy',
    JOS:'joshua', JDG:'judges', RUT:'ruth', '1SA':'1-samuel', '2SA':'2-samuel', '1KI':'1-kings', '2KI':'2-kings', '1CH':'1-chronicles', '2CH':'2-chronicles',
    EZR:'ezra', NEH:'nehemiah', EST:'esther', JOB:'job', PSA:'psalms', PRO:'proverbs', ECC:'ecclesiastes', SNG:'song-of-solomon',
    ISA:'isaiah', JER:'jeremiah', LAM:'lamentations', EZK:'ezekiel', DAN:'daniel', HOS:'hosea', JOL:'joel', AMO:'amos', OBA:'obadiah', JON:'jonah', MIC:'micah', NAM:'nahum', HAB:'habakkuk', ZEP:'zephaniah', HAG:'haggai', ZEC:'zechariah', MAL:'malachi',
    MAT:'matthew', MRK:'mark', LUK:'luke', JHN:'john', ACT:'acts', ROM:'romans', '1CO':'1-corinthians', '2CO':'2-corinthians', GAL:'galatians', EPH:'ephesians', PHP:'philippians', COL:'colossians', '1TH':'1-thessalonians', '2TH':'2-thessalonians', '1TI':'1-timothy', '2TI':'2-timothy', TIT:'titus', PHM:'philemon', HEB:'hebrews', JAS:'james', '1PE':'1-peter', '2PE':'2-peter', '1JN':'1-john', '2JN':'2-john', '3JN':'3-john', JUD:'jude', REV:'revelation'
  };
  function res(book, chap, verse, type){ return { ok: !!book, book: book, chapter: chap, verse: verse, type: type||'chapter' }; }
  if (mVerse){ return res(map[mVerse[1]], String(mVerse[2]), String(mVerse[3]), 'verse'); }
  if (mChap){ return res(map[mChap[1]], String(mChap[2]), null, 'chapter'); }
  var mRange = os.match(/^([A-Z]{3})\.(\d+)(?:\.(\d+))?\-/);
  if (mRange){ return res(map[mRange[1]], String(mRange[2]), (mRange[3]||null), mRange[3]?'verse':'chapter'); }
  return { ok:false };
}

function fetchPassageTextFallback_(versionIdRaw, osis){
  var versionId = String(versionIdRaw||'').replace(/^cdn:/,'');
  var p = osisToFallbackPath_(osis);
  if (!p.ok || !p.book || !p.chapter) return '';
  var url;
  if (p.type==='verse' && p.verse){
    url = CDN_BASE + '/' + encodeURIComponent(versionId) + '/books/' + p.book + '/chapters/' + p.chapter + '/verses/' + p.verse + '.json';
    var js1 = httpGetJsonOpen_(url);
    if (js1 && (js1.text || js1.content)){
      return stripVerseNumAtStart_(String(js1.text||js1.content||''));
    }
  }
  url = CDN_BASE + '/' + encodeURIComponent(versionId) + '/books/' + p.book + '/chapters/' + p.chapter + '.json';
  var js2 = httpGetJsonOpen_(url);
  if (!js2) return '';
  if (js2.text){
    var t = String(js2.text||'');
    t = stripVerseNumAtStart_(t);
    return t.trim();
  }
  if (js2.verses && js2.verses.length){
    var buf = [];
    for (var i=0;i<js2.verses.length;i++){
      var v = js2.verses[i];
      if (v && (v.text||v.content)) buf.push(stripVerseNumAtStart_(String(v.text||v.content)));
    }
    return buf.join(' ').trim();
  }
  return '';
}

// AI fallback: translate from English when both official and CDN are missing
function getOpenAIKey_(){
  return PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || '';
}

function aiTranslateFromEnglish_(targetLang, osis, englishText){
  var key = getOpenAIKey_(); if (!key || !englishText) return '';
  var styleMap = {
    'ja-JP': '日本語。聖書の語彙は自然で敬体。新改訳の語感を参考。',
    'ko-KR': '한국어. 개역개정의 어휘 감각을 참고하되 자연스러운 현대어.',
    'ru-RU': 'Русский. Стилистика синодального перевода를 참고하되 현대적 표현.',
    'fil-PH': 'Tagalog. Ang Dating Biblia 1905의 감각을 참고.',
    'da-DK': 'Dansk. 1931 Bibelen 문체 참고.',
    'ro-RO': 'Română. Cornilescu 전통 참고.',
    'el-GR': 'Νεοελληνικά. Βάμβας의 어투 참고.',
    'ms-MY': 'Bahasa Melayu. Shellabear 1912 감각 참고.'
  };
  var sys = 'You translate Scripture for a typing game. Preserve meaning exactly; no paraphrase; return plain text.';
  var user = 'Reference: '+osis+'\nTarget: '+targetLang+'\nStyle: '+(styleMap[targetLang]||'literal, respectful')+'\nEnglish: '+englishText+'\nTranslate faithfully into the target language.';
  var payload = { model:'gpt-4o-mini', messages:[{role:'system',content:sys},{role:'user',content:user}], temperature:0.2, max_tokens:800 };
  try{
    var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', { method:'post', headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'}, payload:JSON.stringify(payload), muteHttpExceptions:true });
    if (res.getResponseCode()>=200 && res.getResponseCode()<300){ var j=JSON.parse(res.getContentText()); var c=(((j||{}).choices||[])[0]||{}).message||{}; return String(c.content||'').trim(); }
  }catch(e){ Logger.log('AI fallback error '+e); }
  return '';
}

function bible_quickKeyTest(){
  try{
    getApiBibleKey_();
    var js = listBiblesByLanguage_('en');
    var n = (js && js.data) ? js.data.length : 0;
    SpreadsheetApp.getUi().alert('API Key 測試成功：英語版本數量 = '+n);
  } catch(e){ SpreadsheetApp.getUi().alert('API 測試失敗：'+e); }
}

function bible_probeCommonLanguages(){
  var probes = [
    { lang:'ja-JP', codes:['ja','jpn'] },
    { lang:'ko-KR', codes:['ko','kor'] },
    { lang:'ru-RU', codes:['ru','rus'] },
    { lang:'ar-SA', codes:['ar','ara'] },
    { lang:'fil-PH', codes:['fil','tl','tgl'] },
    { lang:'da-DK', codes:['da','dan'] },
    { lang:'ro-RO', codes:['ro','ron'] },
    { lang:'el-GR', codes:['el','ell','gre'] },
    { lang:'ms-MY', codes:['ms','msa','zsm'] },
    { lang:'fa-IR', codes:['fa','fas','per'] }
  ];
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_BPROBE) || ss.insertSheet(SHEET_BPROBE);
  sh.clear();
  sh.getRange(1,1,1,5).setValues([[ 'lang','tryCode','count','sampleId','sampleName' ]]).setFontWeight('bold');
  var row = 2;
  for (var p=0;p<probes.length;p++){
    var ok = false; var tried = probes[p].codes;
    for (var c=0;c<tried.length;c++){
      var code = tried[c];
      var js = httpGetJson_(API_BASE + '/bibles?language='+encodeURIComponent(code));
      var items = (js && js.data) ? js.data : [];
      var sampleId = items.length ? String(items[0].id||'') : '';
      var sampleName = items.length ? String(items[0].name||'') : '';
      sh.getRange(row,1,1,5).setValues([[ probes[p].lang, code, items.length, sampleId, sampleName.slice(0,80) ]]);
      row++;
      if (items.length){ ok = true; break; }
    }
    if (!ok){
      // fallback catalog
      var list = fetchFallbackCatalog_(probes[p].lang) || [];
      var sampleId2 = list.length ? list[0].id : '';
      var sampleName2 = list.length ? list[0].name : '';
      sh.getRange(row,1,1,5).setValues([[ probes[p].lang, 'cdn', list.length, sampleId2, sampleName2.slice(0,80) ]]);
      row++;
    }
  }
  SpreadsheetApp.getUi().alert('✅ 探測完成，請查看 '+SHEET_BPROBE+' 表。');
}

function bible_probeCdnCatalog(){
  var langs = ['ja-JP','ko-KR','ru-RU','ar-SA','fil-PH','da-DK','ro-RO','el-GR','ms-MY','fa-IR'];
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('bibles_cdn_catalog') || ss.insertSheet('bibles_cdn_catalog');
  sh.clear();
  sh.getRange(1,1,1,5).setValues([[ 'lang','candidateId','name','source','note' ]]).setFontWeight('bold');
  var row = 2;
  for (var i=0;i<langs.length;i++){
    var list = [];
    try{ list = fetchFallbackCatalog_(langs[i]) || []; } catch(e){}
    if (!list.length){
      sh.getRange(row,1,1,5).setValues([[ langs[i], '(none)', '(no data)', 'cdn', '' ]]);
      row++;
      continue;
    }
    for (var j=0;j<Math.min(20, list.length); j++){
      var it = list[j];
      sh.getRange(row,1,1,5).setValues([[ langs[i], it.id, it.name, 'cdn', '' ]]);
      row++;
    }
  }
  SpreadsheetApp.getUi().alert('✅ 已寫入 bibles_cdn_catalog。若官方為 0，可在此表挑選 candidateId（cdn:...）套用到 config。');
}

function bible_dumpAllBibles(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('bibles_all') || ss.insertSheet('bibles_all');
  sh.clear();
  sh.getRange(1,1,1,7).setValues([[ 'id','abbr','name','language.id','language.name','script','copyright' ]]).setFontWeight('bold');
  var row = 2;
  var page = 1; var fetched = 0; var MAX_PAGES = 10; // 安全上限
  while (page <= MAX_PAGES){
    var u = API_BASE + '/bibles?page=' + page;
    var js = httpGetJson_(u);
    var data = (js && js.data) ? js.data : [];
    if (!data.length) break;
    var out = [];
    for (var i=0;i<data.length;i++){
      var x = data[i]||{}; var lang = (x.language||{});
      out.push([ x.id||'', x.abbreviation||'', (x.name||'').slice(0,120), lang.id||'', lang.name||'', (x.script||'') , (x.copyright||'').toString().slice(0,160) ]);
    }
    sh.getRange(row,1,out.length, out[0].length).setValues(out);
    row += out.length; fetched += out.length; page++;
    Utilities.sleep(150);
  }
  SpreadsheetApp.getUi().alert('✅ 已列出此 API Key 可用版本共 '+fetched+' 筆（見 bibles_all）。可在此表用語言篩選 jpn/kor/rus/arb/tgl/dan/ron/ell/zsm/pes 是否可用。');
}

function bible_applyRecommendedMapping(){
  var rec = {
    'en-US':'9879dbb7cfe39e4d-01', // WEB
    'es-MX':'592420522e16049f-01', // RVR09
    'pt-BR':'941380703fcb500c-01', // ONBV
    'fr-FR':'a93a92589195411f-01', // JND
    'de-DE':'926aa5efbc5e04e2-01', // Luther 1912
    'it-IT':'41f25b97f468e10b-01', // Diodati 1885
    'id-ID':'2dd568eeff29fb3c-01', // TSI
    'vi-VN':'5cc7093967a0a392-01', // OVCB
    'th-TH':'2eb94132ad61ae75-01', // Thai KJV
    'nl-NL':'ead7b4cc5007389c-01', // Dutch 1939
    'pl-PL':'1c9761e0230da6e0-01', // UBG
    'sv-SE':'fa4317c59f0825e0-01', // SKB
    'nb-NO':'246ad95eade0d0a1-01', // ONLNT
    'fi-FI':'c739534f6a23acb2-01', // OFLNT
    'cs-CZ':'c61908161b077c4c-01', // Kralická 1613
    'hu-HU':'fcfc25677b0a53c9-01', // OEIV
    'uk-UA':'6c696cd1d82e2723-04', // ONPU 2022
    'hi-IN':'2133003bb8b5e62b-01', // HCV 2019
    'bn-BD':'efd8a351a07d4264-01', // BCV 2019
    'he-IL':'2c500771ea16da93-01', // WLC
    'ur-PK':'de0270810140edf9-01', // IRV Urdu 2019
    'tr-TR':'f6a5ef6e2e75a8b4-01', // OBTT
    'zh-CN':'7ea794434e9ea7ee-01', // OCCB Simplified
    'zh-TW':'a6e06d2c5b90ad89-01', // OCCBT Traditional
    'ar-SA':'b17e246951402e50-01', // ONAV
    'fa-IR':'7cd100148df29c08-01', // OPCB
    // 無官方清單者 → AI 翻譯
    'ja-JP':'ai:auto',
    'ko-KR':'ai:auto',
    'ru-RU':'ai:auto',
    'da-DK':'ai:auto',
    'ro-RO':'ai:auto',
    'el-GR':'ai:auto',
    'ms-MY':'ai:auto'
  };
  var ss = SpreadsheetApp.getActive();
  var cfg = ss.getSheetByName(SHEET_BCONF) || ss.insertSheet(SHEET_BCONF);
  if (cfg.getLastRow() < 1){ cfg.getRange(1,1,1,5).setValues([[ 'lang','bibleId','version','license','notes' ]]).setFontWeight('bold'); }
  var hc = cfg.getRange(1,1,1,cfg.getLastColumn()).getValues()[0];
  var map = {}; for (var i=0;i<hc.length;i++) map[String(hc[i]).trim()] = i+1;
  var rows = Math.max(0, cfg.getLastRow()-1);
  var data = rows>0 ? cfg.getRange(2,1,rows,cfg.getLastColumn()).getValues() : [];
  var idxByLang = {};
  for (var r=0;r<data.length;r++){ var lang = String(data[r][map['lang']-1]||'').trim(); if (lang) idxByLang[lang]=r; }
  var adds = [];
  for (var lang in rec){ if (!rec.hasOwnProperty(lang)) continue; var bid = rec[lang];
    if (idxByLang.hasOwnProperty(lang)){
      var rowIdx = idxByLang[lang];
      cfg.getRange(2+rowIdx, map['bibleId']).setValue(bid);
      if (map['version']) cfg.getRange(2+rowIdx, map['version']).setValue('auto');
    } else {
      var arr = new Array(hc.length).fill('');
      arr[map['lang']-1] = lang; arr[map['bibleId']-1] = bid; if (map['version']) arr[map['version']-1] = 'auto';
      adds.push(arr);
    }
  }
  if (adds.length){ cfg.getRange(cfg.getLastRow()+1,1,adds.length, hc.length).setValues(adds); }
  SpreadsheetApp.getUi().alert('✅ 已寫入建議版本到 config（含 AI:auto 對 7 個語言）。接著可直接執行「② 抓取」。');
}

function bible_scanRefsDuplicates(){
  var ss = SpreadsheetApp.getActive();
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sr){ SpreadsheetApp.getUi().alert('缺少 '+SHEET_BREFS); return; }
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var map = {}; for (var i=0;i<hr.length;i++) map[String(hr[i]).trim()] = i+1;
  var rows = Math.max(0, sr.getLastRow()-1);
  if (rows<=0){ SpreadsheetApp.getUi().alert('bible_refs 無資料'); return; }
  var data = sr.getRange(2,1,rows, sr.getLastColumn()).getValues();
  var seen = {}; var dups = [];
  for (var r=0;r<data.length;r++){
    var id = String(data[r][map['id']-1]||'').trim();
    var osis = String(data[r][map['ref_osis']-1]||'').trim().toUpperCase();
    if (!osis) continue;
    var key = (id?('ID:'+id+'||'):'')+'OSIS:'+osis;
    if (seen[key]){ dups.push({ row:r+2, id:id, osis:osis, first: seen[key] }); }
    else seen[key] = r+2;
  }
  var sh = ss.getSheetByName('bible_refs_dups') || ss.insertSheet('bible_refs_dups');
  sh.clear();
  sh.getRange(1,1,1,4).setValues([[ 'row','id','ref_osis','first_row' ]]).setFontWeight('bold');
  if (dups.length){
    var out = dups.map(function(x){ return [x.row, x.id, x.osis, x.first]; });
    sh.getRange(2,1,out.length,4).setValues(out);
    SpreadsheetApp.getUi().alert('⚠️ 發現重複 '+dups.length+' 筆，已列在 bible_refs_dups。');
  } else {
    SpreadsheetApp.getUi().alert('✅ 未發現重複。');
  }
}

function bible_removeRefsDuplicatesKeepFirst(){
  var ss = SpreadsheetApp.getActive();
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sr){ SpreadsheetApp.getUi().alert('缺少 '+SHEET_BREFS); return; }
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var map = {}; for (var i=0;i<hr.length;i++) map[String(hr[i]).trim()] = i+1;
  var rows = Math.max(0, sr.getLastRow()-1);
  if (rows<=0){ SpreadsheetApp.getUi().alert('bible_refs 無資料'); return; }
  var data = sr.getRange(2,1,rows, sr.getLastColumn()).getValues();
  var seen = {}; var toDelete = [];
  for (var r=0;r<data.length;r++){
    var id = String(data[r][map['id']-1]||'').trim();
    var osis = String(data[r][map['ref_osis']-1]||'').trim().toUpperCase();
    if (!osis) continue;
    var key = (id?('ID:'+id+'||'):'')+'OSIS:'+osis;
    if (seen[key]){
      toDelete.push(r+2); // actual row index in sheet
    } else {
      seen[key] = r+2;
    }
  }
  if (!toDelete.length){ SpreadsheetApp.getUi().alert('✅ 沒有可移除的重複。'); return; }
  // 刪除需從尾端開始，避免位移
  toDelete.sort(function(a,b){ return b-a; });
  for (var i=0;i<toDelete.length;i++){
    sr.deleteRow(toDelete[i]);
  }
  SpreadsheetApp.getUi().alert('✅ 已移除重複 '+toDelete.length+' 行，後續行已上移。');
}

// 只抓取目前在 bible_bank 表頭選中的語言，並將結果寫入該語言欄。
function bible_fetchSelectedLanguageToBank(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  var sel = sb.getActiveRange();
  if (!sel || sel.getRow()!==1){ SpreadsheetApp.getUi().alert('請在 bible_bank 第1列選取一個語言欄'); return; }
  var lang = String(sb.getRange(1, sel.getColumn(), 1, 1).getValue()||'').trim();
  if (!lang || lang==='id' || lang==='type' || lang==='grade_min' || lang==='grade_max' || lang==='tags'){ SpreadsheetApp.getUi().alert('請選取語言欄位'); return; }

  // 讀 config
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0];
  var cidx = {}; for (var i=0;i<hc.length;i++) cidx[String(hc[i]).trim()] = i+1;
  var nrows = Math.max(0, sc.getLastRow()-1);
  var confs = nrows>0 ? sc.getRange(2,1,nrows, sc.getLastColumn()).getValues() : [];
  var bibleId = '';
  for (var r=0;r<confs.length;r++) if (String(confs[r][cidx['lang']-1]||'').trim()===lang){ bibleId = String(confs[r][cidx['bibleId']-1]||'').trim(); break; }
  if (!bibleId){ SpreadsheetApp.getUi().alert('config 未設定 '+lang+' 的 bibleId'); return; }

  // 讀 refs
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  var rrows = Math.max(0, sr.getLastRow()-1);
  var refs = rrows>0 ? sr.getRange(2,1,rrows, sr.getLastColumn()).getValues() : [];
  if (!refs.length){ SpreadsheetApp.getUi().alert('bible_refs 無資料'); return; }

  // bank 表頭 map
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var k=0;k<hb.length;k++) bmap[String(hb[k]).trim()] = k+1;
  var langCol = bmap[lang] || ensureLangColumn_(sb, lang);

  // 依序抓取並只寫語言欄；若 meta 欄缺值則補寫
  var start = sb.getLastRow()+1;
  for (var t=0;t<refs.length;t++){
    var id = String(refs[t][ridx['id']-1]||'');
    var osis = String(refs[t][ridx['ref_osis']-1]||'');
    var gmin = String(refs[t][ridx['grade_min']-1]||'1');
    var gmax = String(refs[t][ridx['grade_max']-1]||gmin);
    var tags = String(refs[t][ridx['tags']-1]||'');
    if (!osis) continue;

    // 若該行尚不存在，先建 meta 行
    var rowIndex = start + t;
    if (rowIndex > sb.getLastRow()){
      var row = new Array(sb.getLastColumn()).fill('');
      row[bmap['id']-1]=id; row[bmap['type']-1]='bible'; row[bmap['grade_min']-1]=gmin; row[bmap['grade_max']-1]=gmax; row[bmap['tags']-1]=tags;
      sb.getRange(rowIndex,1,1,row.length).setValues([row]);
    }

    var text = '';
    try { text = fetchPassageText_(bibleId, osis); } catch(e){ text=''; }
    if (!text && /^cdn:/.test(bibleId)){
      try { text = fetchPassageTextFallback_(bibleId, osis); } catch(e2){ text=''; }
    }
    if (!text && getOpenAIKey_()){
      try { var en = fetchPassageTextFallback_(EN_FALLBACK_CDN, osis); if (en) text = aiTranslateFromEnglish_(lang, osis, en); } catch(e3){ text=''; }
    }
    if (text) sb.getRange(rowIndex, langCol, 1, 1).setValue(text);
    if ((t+1) % 20 === 0){ try{ SpreadsheetApp.getActive().toast('['+lang+'] '+(t+1)+' / '+refs.length); }catch(e){} }
    Utilities.sleep(RATE_LIMIT_MS);
  }
  SpreadsheetApp.getUi().alert('✅ 已完成：僅抓取 '+lang+'，並寫入 bible_bank。');
}

// 只抓取選取語言，並「從當前游標（bible_refs 的選取起點）續跑」
function bible_fetchSelectedLanguageFromCursor(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  // 語言由 bible_bank 表頭選取決定
  var selLang = sb.getActiveRange();
  if (!selLang || selLang.getRow()!==1){ SpreadsheetApp.getUi().alert('請先在 bible_bank 第1列選取語言欄'); return; }
  var lang = String(sb.getRange(1, selLang.getColumn(), 1, 1).getValue()||'').trim();
  if (!lang || lang==='id' || lang==='type' || lang==='grade_min' || lang==='grade_max' || lang==='tags'){ SpreadsheetApp.getUi().alert('請選取語言欄位'); return; }

  // 開始行由 bible_refs 的當前選取決定
  if (sr.getActiveSheet().getName() !== SHEET_BREFS){ ss.setActiveSheet(sr); }
  var selRefs = sr.getActiveRange();
  var startRow = (selRefs && selRefs.getRow()>1) ? selRefs.getRow() : 2;

  // 讀 config
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0];
  var cidx = {}; for (var i=0;i<hc.length;i++) cidx[String(hc[i]).trim()] = i+1;
  var confs = sc.getRange(2,1,Math.max(0, sc.getLastRow()-1), sc.getLastColumn()).getValues();
  var bibleId = '';
  for (var c=0;c<confs.length;c++) if (String(confs[c][cidx['lang']-1]||'').trim()===lang){ bibleId = String(confs[c][cidx['bibleId']-1]||'').trim(); break; }
  if (!bibleId){ SpreadsheetApp.getUi().alert('config 未設定 '+lang+' 的 bibleId'); return; }

  // 讀 refs 從 startRow 到表尾
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  var total = Math.max(0, sr.getLastRow()-startRow+1);
  if (total<=0){ SpreadsheetApp.getUi().alert('選取起點之後無資料'); return; }
  var refs = sr.getRange(startRow,1,total, sr.getLastColumn()).getValues();

  // bank 表頭
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var k=0;k<hb.length;k++) bmap[String(hb[k]).trim()] = k+1;
  var langCol = bmap[lang] || ensureLangColumn_(sb, lang);

  var writeStart = sb.getLastRow()+1;
  for (var t=0;t<refs.length;t++){
    var id = String(refs[t][ridx['id']-1]||'');
    var osis = String(refs[t][ridx['ref_osis']-1]||''); if (!osis) continue;
    var gmin = String(refs[t][ridx['grade_min']-1]||'1');
    var gmax = String(refs[t][ridx['grade_max']-1]||gmin);
    var tags = String(refs[t][ridx['tags']-1]||'');

    var rowIndex = writeStart + (startRow-2) + t; // 與 refs 行對齊
    if (rowIndex > sb.getLastRow()){
      var row = new Array(sb.getLastColumn()).fill('');
      row[bmap['id']-1]=id; row[bmap['type']-1]='bible'; row[bmap['grade_min']-1]=gmin; row[bmap['grade_max']-1]=gmax; row[bmap['tags']-1]=tags;
      sb.getRange(rowIndex,1,1,row.length).setValues([row]);
    }

    var text='';
    try { text = fetchPassageText_(bibleId, osis); } catch(e){ text=''; }
    if (!text && /^cdn:/.test(bibleId)){
      try { text = fetchPassageTextFallback_(bibleId, osis); } catch(e2){ text=''; }
    }
    if (!text && getOpenAIKey_()){
      try { var en = fetchPassageTextFallback_(EN_FALLBACK_CDN, osis); if (en) text = aiTranslateFromEnglish_(lang, osis, en); } catch(e3){ text=''; }
    }
    if (text) sb.getRange(rowIndex, langCol, 1, 1).setValue(text);
    if ((t+1)%20===0){ try{ SpreadsheetApp.getActive().toast('['+lang+'] '+(t+1)+' / '+refs.length+'（從第 '+startRow+' 行續跑）'); }catch(e){} }
    Utilities.sleep(RATE_LIMIT_MS);
  }
  SpreadsheetApp.getUi().alert('✅ '+lang+' 已自第 '+startRow+' 行續跑完成。');
}

// 直接在 bible_bank 選取任意區塊（建議選一個語言欄的一段範圍），
// 自動從第1列讀取語言標題，僅對該語言、該行段填寫。
function bible_fetchBySelectionRange(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要處理的區塊'); return; }
  var colStart = sel.getColumn();
  var colEnd   = colStart + sel.getNumColumns() - 1;
  // 目前只支援單一語言欄，若選到多欄，取第一欄並提示
  if (sel.getNumColumns() > 1){ try{ SpreadsheetApp.getActive().toast('目前僅處理第一個選取欄'); }catch(e){} }
  var lang = String(sb.getRange(1, colStart, 1, 1).getValue()||'').trim();
  if (!lang || lang==='id' || lang==='type' || lang==='grade_min' || lang==='grade_max' || lang==='tags'){
    SpreadsheetApp.getUi().alert('請將選取區塊放在語言欄（標題在第1列），而非 meta 欄'); return; }

  // 讀 config
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0];
  var cidx = {}; for (var i=0;i<hc.length;i++) cidx[String(hc[i]).trim()] = i+1;
  var confs = sc.getRange(2,1,Math.max(0, sc.getLastRow()-1), sc.getLastColumn()).getValues();
  var bibleId = '';
  for (var c=0;c<confs.length;c++) if (String(confs[c][cidx['lang']-1]||'').trim()===lang){ bibleId = String(confs[c][cidx['bibleId']-1]||'').trim(); break; }
  if (!bibleId){ SpreadsheetApp.getUi().alert('config 未設定 '+lang+' 的 bibleId'); return; }

  // 目標範圍的行
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd   = rowStart + sel.getNumRows() - 1;
  var lastRef  = sr.getLastRow();

  // bank 表頭 & 欄位映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var k=0;k<hb.length;k++) bmap[String(hb[k]).trim()] = k+1;
  var langCol = bmap[lang] || ensureLangColumn_(sb, lang);

  // refs 表頭
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;

  for (var r=rowStart; r<=rowEnd; r++){
    if (r > lastRef) break; // 超出 refs 範圍就停止
    var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
    var id   = String(refRow[ridx['id']-1]||'');
    var osis = String(refRow[ridx['ref_osis']-1]||'');
    if (!osis) continue;
    var gmin = String(refRow[ridx['grade_min']-1]||'1');
    var gmax = String(refRow[ridx['grade_max']-1]||gmin);
    var tags = String(refRow[ridx['tags']-1]||'');

    // 確保 bank 有該行，若 meta 空白才補（符合你「有就不動」的要求）
    if (r > sb.getLastRow()){
      var newRow = new Array(sb.getLastColumn()).fill('');
      newRow[bmap['id']-1]=id; newRow[bmap['type']-1]='bible'; newRow[bmap['grade_min']-1]=gmin; newRow[bmap['grade_max']-1]=gmax; newRow[bmap['tags']-1]=tags;
      sb.getRange(r,1,1,newRow.length).setValues([newRow]);
    } else {
      if (!String(sb.getRange(r, bmap['id']      ,1,1).getValue()||'').trim() && id)   sb.getRange(r,bmap['id']      ,1,1).setValue(id);
      if (!String(sb.getRange(r, bmap['type']    ,1,1).getValue()||'').trim())         sb.getRange(r,bmap['type']    ,1,1).setValue('bible');
      if (!String(sb.getRange(r, bmap['grade_min'],1,1).getValue()||'').trim())        sb.getRange(r,bmap['grade_min'],1,1).setValue(gmin);
      if (!String(sb.getRange(r, bmap['grade_max'],1,1).getValue()||'').trim())        sb.getRange(r,bmap['grade_max'],1,1).setValue(gmax);
      if (!String(sb.getRange(r, bmap['tags']    ,1,1).getValue()||'').trim() && tags) sb.getRange(r,bmap['tags']    ,1,1).setValue(tags);
    }

    var text='';
    try { text = fetchPassageText_(bibleId, osis); } catch(e){ text=''; }
    if (!text && /^cdn:/.test(bibleId)){
      try { text = fetchPassageTextFallback_(bibleId, osis); } catch(e2){ text=''; }
    }
    if (!text && getOpenAIKey_()){
      try { var en = fetchPassageTextFallback_(EN_FALLBACK_CDN, osis); if (en) text = aiTranslateFromEnglish_(lang, osis, en); } catch(e3){ text=''; }
    }
    if (text) sb.getRange(r, langCol, 1, 1).setValue(text);
    if (((r-rowStart+1)%20)===0){ try{ SpreadsheetApp.getActive().toast('['+lang+'] '+(r-rowStart+1)+' / '+(rowEnd-rowStart+1)); }catch(e){} }
    Utilities.sleep(RATE_LIMIT_MS);
  }
  SpreadsheetApp.getUi().alert('✅ 已依選取區塊處理 '+lang+'（行 '+rowStart+' ~ '+rowEnd+'）。');
}

function bible_fetchBySelectionRangeEmptyOnly(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表'); return; }
  var sel = sb.getActiveRange(); if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取區塊'); return; }
  var lang = String(sb.getRange(1, sel.getColumn(), 1, 1).getValue()||'').trim();
  if (!lang || lang==='id' || lang==='type' || lang==='grade_min' || lang==='grade_max' || lang==='tags'){ SpreadsheetApp.getUi().alert('請將選取區塊放在語言欄'); return; }

  // config
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0]; var cidx={}; for (var i=0;i<hc.length;i++) cidx[String(hc[i]).trim()]=i+1;
  var confs = sc.getRange(2,1,Math.max(0, sc.getLastRow()-1), sc.getLastColumn()).getValues(); var bibleId='';
  for (var c=0;c<confs.length;c++) if (String(confs[c][cidx['lang']-1]||'').trim()===lang){ bibleId = String(confs[c][cidx['bibleId']-1]||'').trim(); break; }
  if (!bibleId){ SpreadsheetApp.getUi().alert('config 未設定 '+lang+' 的 bibleId'); return; }

  // 範圍/對齊
  var rowStart=Math.max(2, sel.getRow()); var rowEnd=rowStart+sel.getNumRows()-1; var lastRef=sr.getLastRow();
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0]; var bmap={}; for (var k=0;k<hb.length;k++) bmap[String(hb[k]).trim()]=k+1; var langCol=bmap[lang];
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0]; var ridx={}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()]=j+1;

  var processed=0, skipped=0;
  for (var r=rowStart; r<=rowEnd; r++){
    if (r>lastRef) break;
    // 只覆寫空白
    var existing = String(sb.getRange(r, langCol,1,1).getValue()||'').trim();
    if (existing){ skipped++; continue; }
    var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
    var id=String(refRow[ridx['id']-1]||''); var osis=String(refRow[ridx['ref_osis']-1]||''); if(!osis){ skipped++; continue; }
    var gmin=String(refRow[ridx['grade_min']-1]||'1'); var gmax=String(refRow[ridx['grade_max']-1]||gmin); var tags=String(refRow[ridx['tags']-1]||'');
    if (r>sb.getLastRow()){
      var row=new Array(sb.getLastColumn()).fill(''); row[bmap['id']-1]=id; row[bmap['type']-1]='bible'; row[bmap['grade_min']-1]=gmin; row[bmap['grade_max']-1]=gmax; row[bmap['tags']-1]=tags; sb.getRange(r,1,1,row.length).setValues([row]);
    }
    var text='';
    try{ text=fetchPassageText_(bibleId, osis);}catch(e){ text=''; }
    if(!text && /^cdn:/.test(bibleId)){ try{ text=fetchPassageTextFallback_(bibleId, osis);}catch(e2){ text=''; } }
    if(!text && getOpenAIKey_()){ try{ var en=fetchPassageTextFallback_(EN_FALLBACK_CDN, osis); if(en) text=aiTranslateFromEnglish_(lang, osis, en);}catch(e3){ text=''; } }
    if(text){ sb.getRange(r, langCol,1,1).setValue(text); processed++; }
    if (((r-rowStart+1)%20)===0){ try{ SpreadsheetApp.getActive().toast('['+lang+'] 進度 '+(r-rowStart+1)+' / '+(rowEnd-rowStart+1)); }catch(e){} }
    Utilities.sleep(RATE_LIMIT_MS);
  }
  SpreadsheetApp.getUi().alert('✅ 完成：寫入 '+processed+' 行；跳過（已有內容或無 OSIS）'+skipped+' 行。');
}

/* =================== Catalog helpers =================== */
function bible_listBiblesCatalogPrompt(){
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('列出語言可用版本', '輸入語言碼（例如 zh-Hant / zh-Hans / en / es）：', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var lang = String(resp.getResponseText()||'').trim(); if (!lang){ ui.alert('請輸入語言碼'); return; }
  var js = listBiblesByLanguage_(lang);
  if (!js || !js.data){ ui.alert('查無資料，請確認語言碼或金鑰'); return; }
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_BCATA) || ss.insertSheet(SHEET_BCATA);
  var headers = ['lang','bibleId','name','abbreviation','copyright','dblId'];
  if (sh.getLastRow() < 1){ sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold'); sh.setFrozenRows(1); }
  // 讀取現有 (lang,bibleId) 做為去重鍵
  var last = sh.getLastRow();
  var exist = {};
  if (last>1){
    var vals = sh.getRange(2,1,last-1,headers.length).getValues();
    for (var r=0;r<vals.length;r++){
      var key = String(vals[r][0]||'').trim()+'||'+String(vals[r][1]||'').trim();
      if (key!=='||') exist[key] = true;
    }
  }
  var toAppend = [];
  for (var i=0;i<js.data.length;i++){
    var b = js.data[i]||{}; var bid = String(b.id||'');
    var key2 = lang+'||'+bid;
    if (!exist[key2]){
      toAppend.push([ lang, bid, b.name||'', b.abbreviation||'', (b.copyright||'').replace(/\s+/g,' ').trim(), b.dblId||'' ]);
      exist[key2] = true;
    }
  }
  if (toAppend.length){ sh.getRange(sh.getLastRow()+1,1,toAppend.length,headers.length).setValues(toAppend); }
  ui.alert('✅ 已追加 '+toAppend.length+' 筆到 '+SHEET_BCATA+'（保留既有資料不覆蓋）。請在該表選取要使用的版本行，再執行「將選取版本套用到 config」。');
}

function bible_applyCatalogSelectionToConfig(){
  var ss = SpreadsheetApp.getActive();
  var cat = ss.getSheetByName(SHEET_BCATA);
  var cfg = ss.getSheetByName(SHEET_BCONF);
  if (!cat || !cfg){ SpreadsheetApp.getUi().alert('缺少 '+SHEET_BCATA+' 或 '+SHEET_BCONF+''); return; }
  var sel = cat.getActiveRange(); if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請在 '+SHEET_BCATA+' 選取資料行'); return; }
  var row = cat.getRange(sel.getRow(),1,1,cat.getLastColumn()).getValues()[0];
  var lang = String(row[0]||'').trim(); var bibleId = String(row[1]||'').trim(); var version = String(row[3]||'').trim();
  if (!lang || !bibleId){ SpreadsheetApp.getUi().alert('選取的行缺少 lang 或 bibleId'); return; }

  var hc = cfg.getRange(1,1,1,cfg.getLastColumn()).getValues()[0];
  var map = {}; for (var i=0;i<hc.length;i++) map[String(hc[i]).trim()] = i+1;
  var last = cfg.getLastRow();
  // 嘗試覆蓋既有 lang，否則新增一列
  var rows = last>1 ? cfg.getRange(2,1,last-1,cfg.getLastColumn()).getValues() : [];
  var hit = -1;
  for (var r=0;r<rows.length;r++){ if (String(rows[r][map['lang']-1]).trim()===lang){ hit = r; break; } }
  if (hit>=0){
    cfg.getRange(2+hit, map['bibleId']).setValue(bibleId);
    if (map['version']) cfg.getRange(2+hit, map['version']).setValue(version);
  } else {
    var arr = new Array(hc.length).fill('');
    arr[map['lang']-1] = lang; arr[map['bibleId']-1] = bibleId; if (map['version']) arr[map['version']-1] = version;
    cfg.getRange(last+1,1,1,hc.length).setValues([arr]);
  }
  SpreadsheetApp.getUi().alert('✅ 已套用：'+lang+' → '+bibleId+'（version='+version+'）');
}

/* =================== Write to bible_bank =================== */
function ensureLangColumn_(sh, lang){
  var lastCol = sh.getLastColumn(); if (lastCol<1) return 0;
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  for (var i=0;i<headers.length;i++){ if (String(headers[i]).trim()===lang) return i+1; }
  sh.insertColumnAfter(lastCol);
  sh.getRange(1,lastCol+1,1,1).setValue(lang).setFontWeight('bold');
  return lastCol+1;
}

function bible_fillConfigFromBankHeader(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK); var sc = ss.getSheetByName(SHEET_BCONF);
  if (!sb || !sc){ SpreadsheetApp.getUi().alert('缺少 bible_bank 或 config'); return; }
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var langs = [];
  for (var i=0;i<hb.length;i++){
    var nm = String(hb[i]||'').trim();
    if (!nm || nm==='id' || nm==='type' || nm==='grade_min' || nm==='grade_max' || nm==='tags') continue;
    langs.push(nm);
  }
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0];
  var map = {}; for (var j=0;j<hc.length;j++) map[String(hc[j]).trim()] = j+1;
  var rows = Math.max(0, sc.getLastRow()-1);
  var data = rows>0 ? sc.getRange(2,1,rows,sc.getLastColumn()).getValues() : [];
  var exist = {}; for (var r=0;r<data.length;r++){ exist[String(data[r][map['lang']-1]||'').trim()] = true; }
  var add = [];
  for (var k=0;k<langs.length;k++){ if (!exist[langs[k]]) add.push([langs[k],'','', '', '']); }
  if (add.length){ sc.getRange(sc.getLastRow()+1,1,add.length, hc.length).setValues(add); }
  SpreadsheetApp.getUi().alert('✅ 已補齊 '+add.length+' 個語言到 config（bibleId 需稍後從 catalog 套用）');
}

function bible_batchListByBankHeader(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  if (!sb){ SpreadsheetApp.getUi().alert('缺少 bible_bank'); return; }
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var langs = [];
  for (var i=0;i<hb.length;i++){
    var nm = String(hb[i]||'').trim();
    if (!nm || nm==='id' || nm==='type' || nm==='grade_min' || nm==='grade_max' || nm==='tags') continue;
    langs.push(nm);
  }
  // 建/取 catalog 表頭（不清空，改為合併追加）
  var cat = ss.getSheetByName(SHEET_BCATA) || ss.insertSheet(SHEET_BCATA);
  var headers = ['lang','bibleId','name','abbreviation','copyright','dblId'];
  if (cat.getLastRow() < 1){ cat.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold'); cat.setFrozenRows(1); }

  // 讀取現有鍵
  var existing = {};
  if (cat.getLastRow()>1){
    var vals0 = cat.getRange(2,1,cat.getLastRow()-1,headers.length).getValues();
    for (var v=0; v<vals0.length; v++){
      var key0 = String(vals0[v][0]||'').trim()+'||'+String(vals0[v][1]||'').trim();
      if (key0!=='||') existing[key0] = true;
    }
  }

  var out = []; var MAX_PER_LANG = 100; // 擴大一點
  for (var l=0;l<langs.length;l++){
    var code = langs[l];
    var js = listBiblesByLanguage_(code.replace('_','-')) || { data: [] };
    var list = js.data || [];
    if (!list.length){
      // open CDN fallback catalog
      try {
        list = fetchFallbackCatalog_(code) || [];
      } catch(e){}
    }
    if (!list.length){
      var kNone = code+'||(none)';
      if (!existing[kNone]){ out.push([code,'(none)','(no data)','', '', '' ]); existing[kNone]=true; }
      continue;
    }
    for (var t=0; t<Math.min(MAX_PER_LANG, list.length); t++){
      var b = list[t] || {};
      var bid = String(b.id||''); var key = code+'||'+bid;
      if (existing[key]) continue;
      out.push([ code, bid, b.name||'', b.abbreviation||'', (b.copyright||b.license||'').toString().replace(/\s+/g,' ').trim(), b.dblId||'' ]);
      existing[key] = true;
    }
    Utilities.sleep(200);
  }
  if (out.length) cat.getRange(cat.getLastRow()+1,1,out.length,headers.length).setValues(out);
  SpreadsheetApp.getUi().alert('✅ 已合併追加 '+out.length+' 筆到 '+SHEET_BCATA+'；未清除既有資料。若顯示 (none) 代表該語言找不到版本或需改用其他代碼。');
}

function bible_fetchAndBuildBank(){
  var ss = SpreadsheetApp.getActive();
  var sc = ss.getSheetByName(SHEET_BCONF); var sr = ss.getSheetByName(SHEET_BREFS); var sb = ss.getSheetByName(SHEET_BBANK);
  if (!sc || !sr || !sb){ SpreadsheetApp.getUi().alert('請先執行 ① 建表'); return; }

  // read configs
  var hc = sc.getRange(1,1,1,sc.getLastColumn()).getValues()[0];
  var idxC = {}; for (var i=0;i<hc.length;i++) idxC[String(hc[i]).trim()] = i+1;
  var rowsC = Math.max(0, sc.getLastRow()-1);
  if (rowsC<=0){ SpreadsheetApp.getUi().alert('config 無資料'); return; }
  var confs = sc.getRange(2,1,rowsC, sc.getLastColumn()).getValues();
  var langToBible = {}; var langToVersion = {}; var langList = [];
  for (var r=0;r<confs.length;r++){
    var lang = String(confs[r][idxC['lang']-1]||'').trim();
    var bid  = String(confs[r][idxC['bibleId']-1]||'').trim();
    var ver  = String(confs[r][idxC['version']-1]||'').trim();
    if (!lang || !bid) continue;
    langToBible[lang] = bid; langToVersion[lang] = ver; langList.push(lang);
  }
  if (!langList.length){ SpreadsheetApp.getUi().alert('config 未填 bibleId'); return; }

  // ensure language columns
  for (var li=0; li<langList.length; li++){ ensureLangColumn_(sb, langList[li]); }

  // refs
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var idxR = {}; for (var j=0;j<hr.length;j++) idxR[String(hr[j]).trim()] = j+1;
  var rowsR = Math.max(0, sr.getLastRow()-1);
  if (rowsR<=0){ SpreadsheetApp.getUi().alert('bible_refs 無資料'); return; }
  var refs = sr.getRange(2,1,rowsR, sr.getLastColumn()).getValues();

  // bank headers
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var colMap = {}; for (var k=0;k<hb.length;k++) colMap[String(hb[k]).trim()] = k+1;

  // append at tail
  var startRow = sb.getLastRow() + 1;
  var outRows = [];

  for (var x=0; x<refs.length; x++){
    var id = String(refs[x][idxR['id']-1]||'').trim();
    var ref_osis = String(refs[x][idxR['ref_osis']-1]||'').trim();
    var tags = String(refs[x][idxR['tags']-1]||'').trim();
    var gmin = String(refs[x][idxR['grade_min']-1]||'');
    var gmax = String(refs[x][idxR['grade_max']-1]||'');
    if (!id || !ref_osis) continue;

    // base row with meta
    var row = new Array(hb.length).fill('');
    row[colMap['id']-1] = id;
    row[colMap['type']-1] = 'bible';
    if (colMap['grade_min']) row[colMap['grade_min']-1] = gmin;
    if (colMap['grade_max']) row[colMap['grade_max']-1] = gmax;
    if (colMap['tags']) row[colMap['tags']-1] = tags;

    // fetch each language
    for (var li2=0; li2<langList.length; li2++){
      var lang = langList[li2];
      var bid = langToBible[lang];
      var text = '';
      try { text = fetchPassageText_(bid, ref_osis); } catch(e) { text = ''; }
      if (!text && /^cdn:/.test(bid)){
        try { text = fetchPassageTextFallback_(bid, ref_osis); } catch(e2) { text = ''; }
      }
      // AI fallback: translate from English KJV (cdn) if still empty
      if (!text && getOpenAIKey_()){
        try {
          var en = fetchPassageTextFallback_(EN_FALLBACK_CDN, ref_osis);
          if (en) text = aiTranslateFromEnglish_(lang, ref_osis, en);
        } catch(e3){ text=''; }
      }
      // create column if missing (safety)
      var colIdx = colMap[lang];
      if (!colIdx){ colIdx = ensureLangColumn_(sb, lang); hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0]; colMap[lang] = colIdx; row.length = hb.length; }
      row[colIdx-1] = text;
      Utilities.sleep(200); // be gentle to API & quota
    }
    outRows.push(row);
    // batch write every 50，並提示進度
    if (outRows.length >= 50){
      sb.getRange(startRow,1,outRows.length, outRows[0].length).setValues(outRows); startRow += outRows.length; outRows = []; SpreadsheetApp.flush();
      if ((x+1) % PROGRESS_EVERY === 0){ try{ SpreadsheetApp.getActive().toast('已處理 '+(x+1)+' / '+refs.length+' 行'); }catch(e){} }
    }
  }
  if (outRows.length){ sb.getRange(startRow,1,outRows.length, outRows[0].length).setValues(outRows); }
  SpreadsheetApp.getUi().alert('✅ 抓取完成並寫入 bible_bank');
}

/* =================== Export (paged JSON) =================== */
function bible_exportBankPrompt(){
  var ui = SpreadsheetApp.getUi();
  var lang = ui.prompt('導出語言', '輸入語言（如 zh-TW / en-US / ALL）', ui.ButtonSet.OK_CANCEL); if (lang.getSelectedButton()!==ui.Button.OK) return;
  var page = ui.prompt('每頁筆數', '建議 1000（行動 500）', ui.ButtonSet.OK_CANCEL); if (page.getSelectedButton()!==ui.Button.OK) return;
  var out = bible_exportBank(String(lang.getResponseText()||'ALL').trim(), Math.max(1, Math.min(5000, parseInt(page.getResponseText(),10)||1000)));
  ui.alert('✅ 導出完成：資料夾 '+out.folder);
}

function bible_exportBank(lang, pageSize){
  var ss = SpreadsheetApp.getActive(); var sh = ss.getSheetByName(SHEET_BBANK);
  if (!sh) throw new Error('缺少 bible_bank');
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var map = {}; for (var i=0;i<headers.length;i++) map[String(headers[i]).trim()] = i+1;
  var totalRows = Math.max(0, sh.getLastRow()-1);
  if (totalRows<=0) return { folder:'(empty)', files:0 };

  // language set
  var langs = [];
  if (String(lang||'ALL').toUpperCase()==='ALL'){
    for (var h=0; h<headers.length; h++){
      var nm = String(headers[h]||'').trim();
      if (!nm || nm==='id' || nm==='type' || nm==='grade_min' || nm==='grade_max' || nm==='tags') continue;
      langs.push(nm);
    }
  } else {
    if (!map[lang]) throw new Error('找不到語言欄：'+lang);
    langs.push(lang);
  }

  function nowStr(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'); }
  var folder = DriveApp.createFolder('TypeSprout-BibleExport-'+(langs.length>1?'ALL':langs[0])+'-'+nowStr());
  var files = 0; var filesPerLang = {};

  for (var li=0; li<langs.length; li++){
    var langName = langs[li]; var lc = map[langName];
    var sub = (langs.length>1) ? folder.createFolder(langName) : folder;
    var page = 1; var offset = 0;
    while (offset < totalRows){
      var size = Math.min(pageSize, totalRows - offset);
      var rows = sh.getRange(2+offset, 1, size, sh.getLastColumn()).getValues();
      var items = [];
      for (var r=0; r<rows.length; r++){
        var row = rows[r];
        items.push({
          id: String(row[map['id']-1]||''),
          type: String(row[map['type']-1]||''),
          grade_min: String(row[map['grade_min']-1]||''),
          grade_max: String(row[map['grade_max']-1]||''),
          tags: String(row[map['tags']-1]||''),
          lang: langName,
          text: String(row[lc-1]||'')
        });
      }
      var body = { items: items, page: page, next: (offset+size<totalRows)?(page+1):null };
      sub.createFile('page-'+pad4_(page)+'.json', JSON.stringify(body), 'application/json');
      files++; filesPerLang[langName]=(filesPerLang[langName]||0)+1; offset+=size; page++;
    }
  }
  folder.createFile('index.json', JSON.stringify({ version:1, totalRows: totalRows, pageSize: pageSize, langs: langs, filesPerLang: filesPerLang, generatedAt: new Date().toISOString() }), 'application/json');
  return { folder: folder.getName(), files: files+1 };
}

function pad4_(n){ var s=String(n); while(s.length<4) s='0'+s; return s; }


// 刪除：bible_bank 的空白行（id、type、tags 與所有語言欄皆空），並同步刪除 bible_refs 對應 id
function bible_deleteEmptyRowsBankAndRefs(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK); var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sr){ SpreadsheetApp.getUi().alert('缺少 bible_bank 或 bible_refs'); return; }

  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var rows = Math.max(0, sb.getLastRow()-1);
  if (rows<=0){ SpreadsheetApp.getUi().alert('bible_bank 無資料'); return; }
  var data = sb.getRange(2,1,rows, sb.getLastColumn()).getValues();

  // refs 索引
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var rmap = {}; for (var k=0;k<hr.length;k++) rmap[String(hr[k]).trim()] = k+1;
  var rrows = Math.max(0, sr.getLastRow()-1);
  var rdata = rrows>0 ? sr.getRange(2,1,rrows, sr.getLastColumn()).getValues() : [];
  var idToRefRow = {};
  for (var r=0;r<rdata.length;r++){
    var id = String(rdata[r][rmap['id']-1]||'').trim(); if (id) idToRefRow[id] = r+2;
  }

  function isBlank(val){ return String(val||'').trim()===''; }

  var toDelBank = []; var toDelRefs = [];
  for (var i2=0;i2<data.length;i2++){
    var row = data[i2];
    var allEmpty = true;
    for (var c=1;c<=sb.getLastColumn();c++){
      // 忽略表頭此處，僅檢查資料列
      if (!isBlank(row[c-1])) { allEmpty = false; break; }
    }
    if (allEmpty){
      var rowIdx = i2+2;
      toDelBank.push(rowIdx);
      var idv = String(row[bmap['id']-1]||'').trim();
      var refRow = idToRefRow[idv]; if (refRow) toDelRefs.push(refRow);
    }
  }

  if (!toDelBank.length){ SpreadsheetApp.getUi().alert('未發現空白行'); return; }
  toDelBank.sort(function(a,b){ return b-a; });
  toDelRefs = Array.from(new Set(toDelRefs)).sort(function(a,b){ return b-a; });
  for (var x=0;x<toDelBank.length;x++){ sb.deleteRow(toDelBank[x]); }
  for (var y=0;y<toDelRefs.length;y++){ if (toDelRefs[y] <= sr.getLastRow()) sr.deleteRow(toDelRefs[y]); }
  SpreadsheetApp.getUi().alert('✅ 已刪除空白行：bible_bank '+toDelBank.length+'；bible_refs '+toDelRefs.length+'。');
}

// 刪除：bible_bank 行若任何中文語言欄（zh-*）文字長度>100（含全形標點），則
// 1) 依該行的 id 找到 bible_refs 中對應行，一起刪除
// 2) 最後從底部往上刪，避免位移
function bible_deleteRowsEnglishOver180(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK); var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sr){ SpreadsheetApp.getUi().alert('缺少 bible_bank 或 bible_refs'); return; }

  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  // 目標：英語欄（en-*），預設 en-US
  var enCols = [];
  for (var j=0;j<hb.length;j++){
    var name = String(hb[j]||'').trim();
    if (/^en(?:-|$)/.test(name)) enCols.push(j+1);
  }
  if (!enCols.length){ SpreadsheetApp.getUi().alert('bible_bank 未找到 en-* 欄'); return; }

  var rows = Math.max(0, sb.getLastRow()-1);
  if (rows<=0){ SpreadsheetApp.getUi().alert('bible_bank 無資料'); return; }
  var data = sb.getRange(2,1,rows, sb.getLastColumn()).getValues();

  // 建立 refs 的 id 索引
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var rmap = {}; for (var k=0;k<hr.length;k++) rmap[String(hr[k]).trim()] = k+1;
  var rrows = Math.max(0, sr.getLastRow()-1);
  var rdata = rrows>0 ? sr.getRange(2,1,rrows, sr.getLastColumn()).getValues() : [];
  var idToRefRow = {};
  for (var r=0;r<rdata.length;r++){
    var id = String(rdata[r][rmap['id']-1]||'').trim(); if (id) idToRefRow[id] = r+2; // actual row
  }

  function lengthOver(txt, n){ return String(txt||'').length > n }

  var toDelBank = []; var toDelRefs = [];
  for (var i2=0;i2<data.length;i2++){
    var rowIdx = i2+2; // actual row in bank
    var over = false;
    for (var c=0;c<enCols.length;c++){
      var v = data[i2][enCols[c]-1];
      if (lengthOver(v, 180)){ over = true; break; }
    }
    if (over){
      toDelBank.push(rowIdx);
      var idv = String(data[i2][bmap['id']-1]||'').trim();
      var refRow = idToRefRow[idv]; if (refRow) toDelRefs.push(refRow);
    }
  }

  if (!toDelBank.length){ SpreadsheetApp.getUi().alert('未發現超過 180 英文字元的行'); return; }
  toDelBank.sort(function(a,b){ return b-a; });
  toDelRefs = Array.from(new Set(toDelRefs)).sort(function(a,b){ return b-a; });

  for (var x=0;x<toDelBank.length;x++){ sb.deleteRow(toDelBank[x]); }
  for (var y=0;y<toDelRefs.length;y++){ if (toDelRefs[y] <= sr.getLastRow()) sr.deleteRow(toDelRefs[y]); }

  SpreadsheetApp.getUi().alert('✅ 已刪除（英文>180）bible_bank '+toDelBank.length+' 行，bible_refs '+toDelRefs.length+' 行。');
}

/* =================== 英文轉目標語言聖經版本 =================== */
function bible_translateEnglishToTargetLanguage(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 如果選取多個語言，提示用戶
  if (langs.length > 1){
    var confirm = SpreadsheetApp.getUi().alert('多語言轉換', 
      '檢測到 '+langs.length+' 個語言欄位：'+langs.join(', ')+'\n\n是否要轉換所有選取的語言？', 
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (confirm !== SpreadsheetApp.getUi().Button.YES) return;
  }
  
  // 直接開始轉換，無需確認
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 預先讀取所有需要的數據，提高效率
  var allData = [];
  for (var r = rowStart; r <= rowEnd; r++){
    if (r > sr.getLastRow()) break;
    
    var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
    if (!enText) continue;
    
    var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
    var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
    if (!osis) continue;
    
    allData.push({row: r, enText: enText, osis: osis});
  }
  
  if (allData.length === 0){
    SpreadsheetApp.getUi().alert('選取範圍內沒有有效的英文文本或 OSIS 參考');
    return;
  }
  
  // 處理每個語言
  for (var l = 0; l < langs.length; l++){
    var lang = langs[l];
    var targetCol = bmap[lang];
    
    if (!targetCol){ 
      Logger.log('找不到 '+lang+' 欄位，跳過');
      continue; 
    }
    
    var processed = 0; var errors = 0; var unknownVersions = 0;
    var startTime = new Date().getTime();
    
    Logger.log('開始處理語言: ' + lang + ', 共 ' + allData.length + ' 行');
    
    // 處理該語言的每一行
    for (var d = 0; d < allData.length; d++){
      var data = allData[d];
      var r = data.row;
      var enText = data.enText;
      var osis = data.osis;
      
      try {
        // 使用 OpenAI 轉換為目標語言的聖經版本
        var translatedText = translateToTargetBibleVersion_(lang, osis, enText);
        
        if (translatedText && translatedText !== '' && !translatedText.includes('UNKNOWN_VERSION')){
          sb.getRange(r, targetCol, 1, 1).setValue(translatedText);
          processed++;
        } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
          // 記錄詳細的調試信息
          Logger.log('未知版本錯誤 - 語言: ' + lang + ', OSIS: ' + osis + ', 版本: ' + BIBLE_VERSIONS[lang]);
          // 高亮該欄位並標記為未知版本
          highlightUnknownVersionCell_(sb, r, targetCol, lang, osis);
          unknownVersions++;
        } else {
          // 其他錯誤（API 錯誤、空回應等）
          Logger.log('轉換失敗 - 語言: ' + lang + ', OSIS: ' + osis + ', 回應: ' + translatedText);
          errors++;
        }
        
        // 高亮當前處理的行
        try {
          sb.getRange(r, targetCol, 1, 1).setBackground('#fff3cd'); // 淺黃色高亮
          SpreadsheetApp.flush(); // 強制刷新顯示
        } catch(e){}
        
        // 進度提示（每 2 行提示一次，更頻繁）
        if ((d+1) % 2 === 0){
          var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
          var remaining = Math.round((allData.length - d - 1) * 1.5); // 優化時間估算
          try{ 
            SpreadsheetApp.getActive().toast('['+lang+'] '+(d+1)+'/'+allData.length+' (成功:'+processed+', 未知:'+unknownVersions+', 錯誤:'+errors+') 剩餘:'+remaining+'秒'); 
          }catch(e){}
        }
        
        // API 限制：每 1.5 秒一個請求（優化速度）
        Utilities.sleep(1500);
        
      } catch(e){
        Logger.log('轉換錯誤 行'+r+', 語言'+lang+': '+e);
        errors++;
      }
    }
    
    var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
    Logger.log('語言 ' + lang + ' 完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
    
    totalProcessed += processed;
    totalErrors += errors;
    totalUnknownVersions += unknownVersions;
    
    // 語言間暫停（減少到 500ms）
    if (l < langs.length - 1){
      Utilities.sleep(500);
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '🎉 批量轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 總行數：' + allData.length + ' 行\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行 (' + Math.round(totalProcessed/allData.length*100) + '%)\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行 (' + Math.round(totalUnknownVersions/allData.length*100) + '%)\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行 (' + Math.round(totalErrors/allData.length*100) + '%)\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n';
    resultMsg += '   請檢查 Google Apps Script 執行記錄了解詳情\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  if (langs.length > 1){
    resultMsg += '✅ 已將英文來源轉換為 ' + langs.length + ' 個語言的聖經版本';
  } else {
    resultMsg += '✅ 已將英文來源轉換為 ' + langs[0] + ' 的聖經版本';
  }
  
  // 顯示結果並提供後續建議
  SpreadsheetApp.getUi().alert(resultMsg);
  
  // 如果有未知版本，提供額外建議
  if (totalUnknownVersions > 0){
    var suggestion = SpreadsheetApp.getUi().alert('後續建議', 
      '檢測到 ' + totalUnknownVersions + ' 個未知版本錯誤。\n\n' +
      '建議：\n' +
      '1. 檢查 Google Apps Script 執行記錄\n' +
      '2. 確認該語言的聖經版本設定是否正確\n' +
      '3. 考慮手動檢查或使用其他翻譯工具\n\n' +
      '是否要查看執行記錄？', 
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    
    if (suggestion === SpreadsheetApp.getUi().Button.YES){
      // 這裡可以添加查看日誌的功能
      Logger.log('用戶要求查看執行記錄');
    }
  }
}

// 快速批量轉換（優化版）
function bible_fastBatchTranslate(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 如果選取多個語言，提示用戶
  if (langs.length > 1){
    var confirm = SpreadsheetApp.getUi().alert('快速批量轉換', 
      '檢測到 '+langs.length+' 個語言欄位：'+langs.join(', ')+'\n\n' +
      '快速模式特點：\n' +
      '• API 間隔：1 秒（比標準版快 33%）\n' +
      '• 實時高亮：當前處理行會高亮顯示\n' +
      '• 進度追蹤：每行都顯示進度\n' +
      '• 批量寫入：每 10 行批量寫入一次\n\n' +
      '是否要開始快速轉換？', 
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (confirm !== SpreadsheetApp.getUi().Button.YES) return;
  }
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 預先讀取所有需要的數據，提高效率
  var allData = [];
  for (var r = rowStart; r <= rowEnd; r++){
    if (r > sr.getLastRow()) break;
    
    var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
    if (!enText) continue;
    
    var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
    var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
    if (!osis) continue;
    
    allData.push({row: r, enText: enText, osis: osis});
  }
  
  if (allData.length === 0){
    SpreadsheetApp.getUi().alert('選取範圍內沒有有效的英文文本或 OSIS 參考');
    return;
  }
  
  // 處理每個語言
  for (var l = 0; l < langs.length; l++){
    var lang = langs[l];
    var targetCol = bmap[lang];
    
    if (!targetCol){ 
      Logger.log('找不到 '+lang+' 欄位，跳過');
      continue; 
    }
    
    var processed = 0; var errors = 0; var unknownVersions = 0;
    var langStartTime = new Date().getTime();
    var batchData = []; // 批量寫入數據
    
    Logger.log('開始快速處理語言: ' + lang + ', 共 ' + allData.length + ' 行');
    
    // 處理該語言的每一行
    for (var d = 0; d < allData.length; d++){
      var data = allData[d];
      var r = data.row;
      var enText = data.enText;
      var osis = data.osis;
      
      try {
        // 高亮當前處理的行
        try {
          sb.getRange(r, targetCol, 1, 1).setBackground('#e3f2fd'); // 淺藍色高亮
          SpreadsheetApp.flush(); // 強制刷新顯示
        } catch(e){}
        
        // 使用 OpenAI 轉換為目標語言的聖經版本
        var translatedText = translateToTargetBibleVersion_(lang, osis, enText);
        
        if (translatedText && translatedText !== '' && !translatedText.includes('UNKNOWN_VERSION')){
          batchData.push({row: r, col: targetCol, text: translatedText});
          processed++;
        } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
          // 記錄詳細的調試信息
          Logger.log('未知版本錯誤 - 語言: ' + lang + ', OSIS: ' + osis + ', 版本: ' + BIBLE_VERSIONS[lang]);
          // 高亮該欄位並標記為未知版本
          highlightUnknownVersionCell_(sb, r, targetCol, lang, osis);
          unknownVersions++;
        } else {
          // 其他錯誤（API 錯誤、空回應等）
          Logger.log('轉換失敗 - 語言: ' + lang + ', OSIS: ' + osis + ', 回應: ' + translatedText);
          errors++;
        }
        
        // 每 10 行批量寫入一次
        if (batchData.length >= 10 || d === allData.length - 1){
          for (var b = 0; b < batchData.length; b++){
            sb.getRange(batchData[b].row, batchData[b].col, 1, 1).setValue(batchData[b].text);
          }
          batchData = []; // 清空批量數據
          SpreadsheetApp.flush(); // 強制刷新
        }
        
        // 進度提示（每行都提示）
        var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
        var remaining = Math.round((allData.length - d - 1) * 1.0); // 優化時間估算
        try{ 
          SpreadsheetApp.getActive().toast('['+lang+'] '+(d+1)+'/'+allData.length+' (成功:'+processed+', 未知:'+unknownVersions+', 錯誤:'+errors+') 剩餘:'+remaining+'秒'); 
        }catch(e){}
        
        // API 限制：每 1 秒一個請求（快速模式）
        Utilities.sleep(1000);
        
      } catch(e){
        Logger.log('轉換錯誤 行'+r+', 語言'+lang+': '+e);
        errors++;
      }
    }
    
    var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
    Logger.log('語言 ' + lang + ' 快速完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
    
    totalProcessed += processed;
    totalErrors += errors;
    totalUnknownVersions += unknownVersions;
    
    // 語言間暫停（減少到 200ms）
    if (l < langs.length - 1){
      Utilities.sleep(200);
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '⚡ 快速批量轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 總行數：' + allData.length + ' 行\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行 (' + Math.round(totalProcessed/allData.length*100) + '%)\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行 (' + Math.round(totalUnknownVersions/allData.length*100) + '%)\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行 (' + Math.round(totalErrors/allData.length*100) + '%)\n';
  resultMsg += '• 總耗時：' + totalTime + ' 秒\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n';
    resultMsg += '   請檢查 Google Apps Script 執行記錄了解詳情\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  if (langs.length > 1){
    resultMsg += '✅ 已將英文來源快速轉換為 ' + langs.length + ' 個語言的聖經版本';
  } else {
    resultMsg += '✅ 已將英文來源快速轉換為 ' + langs[0] + ' 的聖經版本';
  }
  
  // 顯示結果
  SpreadsheetApp.getUi().alert(resultMsg);
}

// 智能分批轉換（大數據專用）
function bible_smartBatchTranslate(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 計算總行數
  var totalRows = rowEnd - rowStart + 1;
  var estimatedTime = Math.round(totalRows * langs.length * 1.5 / 60); // 估算分鐘數
  
  // 智能分批設定
  var BATCH_SIZE = 200; // 每批處理 200 行
  var MAX_EXECUTION_TIME = 4.5 * 60 * 1000; // 4.5 分鐘（Google Apps Script 限制 5 分鐘）
  var batches = Math.ceil(totalRows / BATCH_SIZE);
  
  if (totalRows > 500){
    var confirm = SpreadsheetApp.getUi().alert('智能分批轉換', 
      '檢測到大量數據：\n' +
      '• 總行數：' + totalRows + ' 行\n' +
      '• 語言數：' + langs.length + ' 個\n' +
      '• 預估時間：' + estimatedTime + ' 分鐘\n' +
      '• 分批數量：' + batches + ' 批（每批 ' + BATCH_SIZE + ' 行）\n\n' +
      '智能分批特點：\n' +
      '• 自動分批：避免執行超時\n' +
      '• 進度保存：每批完成後保存進度\n' +
      '• 斷點續傳：可從任意批次開始\n' +
      '• 實時監控：每批顯示詳細進度\n\n' +
      '是否要開始智能分批轉換？', 
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (confirm !== SpreadsheetApp.getUi().Button.YES) return;
  }
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 處理每個批次
  for (var batch = 0; batch < batches; batch++){
    var batchStartTime = new Date().getTime();
    var batchStartRow = rowStart + (batch * BATCH_SIZE);
    var batchEndRow = Math.min(batchStartRow + BATCH_SIZE - 1, rowEnd);
    var currentBatchSize = batchEndRow - batchStartRow + 1;
    
    Logger.log('開始處理批次 ' + (batch + 1) + '/' + batches + ': 行 ' + batchStartRow + '-' + batchEndRow);
    
    // 預先讀取當前批次的數據
    var batchData = [];
    for (var r = batchStartRow; r <= batchEndRow; r++){
      if (r > sr.getLastRow()) break;
      
      var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
      if (!enText) continue;
      
      var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
      var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
      if (!osis) continue;
      
      batchData.push({row: r, enText: enText, osis: osis});
    }
    
    if (batchData.length === 0){
      Logger.log('批次 ' + (batch + 1) + ' 沒有有效數據，跳過');
      continue;
    }
    
    // 處理每個語言
    for (var l = 0; l < langs.length; l++){
      var lang = langs[l];
      var targetCol = bmap[lang];
      
      if (!targetCol){ 
        Logger.log('找不到 '+lang+' 欄位，跳過');
        continue; 
      }
      
      var processed = 0; var errors = 0; var unknownVersions = 0;
      var langStartTime = new Date().getTime();
      
      Logger.log('批次 ' + (batch + 1) + ' - 處理語言: ' + lang + ', 共 ' + batchData.length + ' 行');
      
      // 處理該語言的每一行
      for (var d = 0; d < batchData.length; d++){
        var data = batchData[d];
        var r = data.row;
        var enText = data.enText;
        var osis = data.osis;
        
        try {
          // 高亮當前處理的行
          try {
            sb.getRange(r, targetCol, 1, 1).setBackground('#e8f5e8'); // 淺綠色高亮
            SpreadsheetApp.flush(); // 強制刷新顯示
          } catch(e){}
          
          // 使用 OpenAI 轉換為目標語言的聖經版本
          var translatedText = translateToTargetBibleVersion_(lang, osis, enText);
          
          if (translatedText && translatedText !== '' && !translatedText.includes('UNKNOWN_VERSION')){
            sb.getRange(r, targetCol, 1, 1).setValue(translatedText);
            processed++;
          } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
            // 記錄詳細的調試信息
            Logger.log('未知版本錯誤 - 語言: ' + lang + ', OSIS: ' + osis + ', 版本: ' + BIBLE_VERSIONS[lang]);
            // 高亮該欄位並標記為未知版本
            highlightUnknownVersionCell_(sb, r, targetCol, lang, osis);
            unknownVersions++;
          } else {
            // 其他錯誤（API 錯誤、空回應等）
            Logger.log('轉換失敗 - 語言: ' + lang + ', OSIS: ' + osis + ', 回應: ' + translatedText);
            errors++;
          }
          
          // 進度提示（每 5 行提示一次）
          if ((d+1) % 5 === 0){
            var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
            var remaining = Math.round((batchData.length - d - 1) * 1.0);
            try{ 
              SpreadsheetApp.getActive().toast('批次'+(batch+1)+'/'+batches+' ['+lang+'] '+(d+1)+'/'+batchData.length+' (成功:'+processed+', 未知:'+unknownVersions+', 錯誤:'+errors+') 剩餘:'+remaining+'秒'); 
            }catch(e){}
          }
          
          // API 限制：每 1 秒一個請求
          Utilities.sleep(1000);
          
          // 檢查執行時間，避免超時
          var currentTime = new Date().getTime();
          if (currentTime - startTime > MAX_EXECUTION_TIME){
            Logger.log('執行時間接近限制，停止當前批次');
            break;
          }
          
        } catch(e){
          Logger.log('轉換錯誤 行'+r+', 語言'+lang+': '+e);
          errors++;
        }
      }
      
      var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
      Logger.log('批次 ' + (batch + 1) + ' - 語言 ' + lang + ' 完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
      
      totalProcessed += processed;
      totalErrors += errors;
      totalUnknownVersions += unknownVersions;
      
      // 語言間暫停
      if (l < langs.length - 1){
        Utilities.sleep(200);
      }
    }
    
    var batchElapsed = Math.round((new Date().getTime() - batchStartTime) / 1000);
    Logger.log('批次 ' + (batch + 1) + ' 完成，耗時: ' + batchElapsed + ' 秒');
    
    // 批次間暫停
    if (batch < batches - 1){
      Utilities.sleep(1000);
    }
    
    // 檢查執行時間，避免超時
    var currentTime = new Date().getTime();
    if (currentTime - startTime > MAX_EXECUTION_TIME){
      Logger.log('執行時間接近限制，停止處理');
      break;
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '🚀 智能分批轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 總行數：' + totalRows + ' 行\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行 (' + Math.round(totalProcessed/totalRows*100) + '%)\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行 (' + Math.round(totalUnknownVersions/totalRows*100) + '%)\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行 (' + Math.round(totalErrors/totalRows*100) + '%)\n';
  resultMsg += '• 總耗時：' + totalTime + ' 秒\n';
  resultMsg += '• 處理批次：' + batches + ' 批\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n';
    resultMsg += '   請檢查 Google Apps Script 執行記錄了解詳情\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  if (langs.length > 1){
    resultMsg += '✅ 已將英文來源智能分批轉換為 ' + langs.length + ' 個語言的聖經版本';
  } else {
    resultMsg += '✅ 已將英文來源智能分批轉換為 ' + langs[0] + ' 的聖經版本';
  }
  
  // 顯示結果
  SpreadsheetApp.getUi().alert(resultMsg);
}

// 超高速併發轉換（基於舊版優化）
function bible_ultraFastTranslate(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 計算總行數
  var totalRows = rowEnd - rowStart + 1;
  var estimatedTime = Math.round(totalRows * langs.length * 0.3 / 60); // 併發模式估算分鐘數
  
  // 超高速併發設定（優化版）
  var BATCH_SIZE = Math.min(30, Math.max(10, Math.floor(totalRows / 10))); // 動態調整批次大小
  var CONCURRENT_REQUESTS = Math.min(6, Math.max(2, Math.floor(totalRows / 50))); // 動態調整併發數
  var batches = Math.ceil(totalRows / BATCH_SIZE);
  
  // 添加調試信息
  Logger.log('超高速併發設定: 總行數=' + totalRows + ', 批次大小=' + BATCH_SIZE + ', 併發數=' + CONCURRENT_REQUESTS + ', 批次數=' + batches);
  
  if (totalRows > 100){
    var confirm = SpreadsheetApp.getUi().alert('超高速併發轉換', 
      '檢測到數據：\n' +
      '• 總行數：' + totalRows + ' 行\n' +
      '• 語言數：' + langs.length + ' 個\n' +
      '• 預估時間：' + estimatedTime + ' 分鐘\n' +
      '• 併發批次：' + batches + ' 批（每批 ' + BATCH_SIZE + ' 行）\n' +
      '• 併發請求：' + CONCURRENT_REQUESTS + ' 個同時處理\n\n' +
      '超高速併發特點：\n' +
      '• 併發處理：同時發送多個 API 請求\n' +
      '• 批量翻譯：一次處理多行文本\n' +
      '• 速度提升：比單個請求快 8-10 倍\n' +
      '• 實時監控：每批顯示詳細進度\n\n' +
      '是否要開始超高速併發轉換？', 
      SpreadsheetApp.getUi().ButtonSet.YES_NO);
    if (confirm !== SpreadsheetApp.getUi().Button.YES) return;
  }
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 處理每個語言
  for (var l = 0; l < langs.length; l++){
    var lang = langs[l];
    var targetCol = bmap[lang];
    
    if (!targetCol){ 
      Logger.log('找不到 '+lang+' 欄位，跳過');
      continue; 
    }
    
    var processed = 0; var errors = 0; var unknownVersions = 0;
    var langStartTime = new Date().getTime();
    
    Logger.log('開始超高速併發處理語言: ' + lang + ', 共 ' + totalRows + ' 行');
    
    // 顯示開始提示
    try{ 
      SpreadsheetApp.getActive().toast('開始處理語言: ' + lang + ' (' + totalRows + ' 行)'); 
    }catch(e){}
    
    // 預先讀取所有數據
    var allData = [];
    for (var r = rowStart; r <= rowEnd; r++){
      if (r > sr.getLastRow()) break;
      
      var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
      if (!enText) continue;
      
      var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
      var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
      if (!osis) continue;
      
      allData.push({row: r, enText: enText, osis: osis});
    }
    
    if (allData.length === 0){
      Logger.log('語言 ' + lang + ' 沒有有效數據，跳過');
      try{ 
        SpreadsheetApp.getActive().toast('語言 ' + lang + ' 沒有有效數據，跳過'); 
      }catch(e){}
      continue;
    }
    
    Logger.log('語言 ' + lang + ' 有效數據: ' + allData.length + ' 行');
    
    // 併發處理每個批次
    for (var batch = 0; batch < batches; batch++){
      var batchStartTime = new Date().getTime();
      var batchStart = batch * BATCH_SIZE;
      var batchEnd = Math.min(batchStart + BATCH_SIZE, allData.length);
      var currentBatchData = allData.slice(batchStart, batchEnd);
      
      if (currentBatchData.length === 0) break;
      
      Logger.log('批次 ' + (batch + 1) + '/' + batches + ' - 處理 ' + currentBatchData.length + ' 行');
      
      // 顯示批次進度
      try{ 
        SpreadsheetApp.getActive().toast('批次 ' + (batch + 1) + '/' + batches + ' [' + lang + '] 準備中...'); 
      }catch(e){}
      
      // 準備併發請求
      var requests = [];
      var requestData = [];
      
      // 將當前批次分成多個併發請求
      var chunkSize = Math.ceil(currentBatchData.length / CONCURRENT_REQUESTS);
      for (var c = 0; c < CONCURRENT_REQUESTS && c * chunkSize < currentBatchData.length; c++){
        var chunkStart = c * chunkSize;
        var chunkEnd = Math.min(chunkStart + chunkSize, currentBatchData.length);
        var chunk = currentBatchData.slice(chunkStart, chunkEnd);
        
        if (chunk.length === 0) continue;
        
        // 準備批量翻譯數據
        var items = [];
        for (var i = 0; i < chunk.length; i++){
          items.push({
            question: chunk[i].enText,
            osis: chunk[i].osis,
            row: chunk[i].row
          });
        }
        
        requestData.push({chunk: chunk, items: items});
        
        // 創建併發請求
        var targetVersion = BIBLE_VERSIONS[lang] || '該語言的標準聖經譯本';
        var versionDescription = getVersionDescription_(lang, targetVersion);
        
        var systemPrompt = 'You are a biblical translation expert specializing in canonical Bible translations. Your task is to translate English Bible text into the target language using ONLY the specified authoritative Bible version. You MUST use the exact wording, style, and terminology of the specified Bible version. Do not create your own translation, modernize, or use any other version. Each language has a specific canonical translation that you must follow precisely.';
        
        var userPrompt = 'CRITICAL: You MUST translate using ONLY this specific Bible version:\n' +
          'Target Language: ' + lang + '\n' +
          'MANDATORY Bible Version: ' + targetVersion + '\n' +
          'VERSION CONTEXT: ' + versionDescription + '\n\n' +
          'INSTRUCTIONS:\n' +
          '1. Translate each English Bible text into ' + lang + ' using EXACTLY the wording and style of ' + targetVersion + '\n' +
          '2. Do NOT paraphrase, modernize, or create your own translation\n' +
          '3. Use the traditional, authoritative translation that is most widely used in ' + lang + ' speaking communities\n' +
          '4. Maintain the same verse structure and biblical terminology as the original ' + targetVersion + '\n' +
          '5. This is a typing game - accuracy is critical, users will type the exact text you provide\n' +
          '6. If you do not know the exact translation from ' + targetVersion + ', respond with "UNKNOWN_VERSION" instead of guessing\n' +
          '7. Return JSON format: {"translations":["translated_text1","translated_text2",...]}\n\n' +
          'Items to translate: ' + JSON.stringify(items.map(item => item.question));
        
        var payload = {
          model: 'gpt-4o-mini',
          messages: [
            {role: 'system', content: systemPrompt},
            {role: 'user', content: userPrompt}
          ],
          temperature: 0.1,
          max_tokens: 2000
        };
        
        requests.push({
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + openaiKey,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
      }
      
      // 顯示發送請求提示
      try{ 
        SpreadsheetApp.getActive().toast('批次 ' + (batch + 1) + '/' + batches + ' [' + lang + '] 發送 ' + requests.length + ' 個併發請求...'); 
      }catch(e){}
      
      // 併發發送所有請求
      try {
        var responses = UrlFetchApp.fetchAll(requests);
        Logger.log('批次 ' + (batch + 1) + ' 收到 ' + responses.length + ' 個回應');
        
        // 處理每個回應
        for (var r = 0; r < responses.length; r++){
          var response = responses[r];
          var code = response.getResponseCode();
          var text = response.getContentText();
          
          if (code >= 200 && code < 300){
            try {
              var result = JSON.parse(text);
              var content = result.choices && result.choices[0] && result.choices[0].message ? result.choices[0].message.content : '';
              var translations = [];
              
              if (content){
                var jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch){
                  var jsonResult = JSON.parse(jsonMatch[0]);
                  translations = jsonResult.translations || [];
                }
              }
              
              // 寫入翻譯結果
              var data = requestData[r];
              for (var t = 0; t < translations.length && t < data.chunk.length; t++){
                var translatedText = String(translations[t] || '').trim();
                var row = data.chunk[t].row;
                
                if (translatedText && !translatedText.includes('UNKNOWN_VERSION')){
                  sb.getRange(row, targetCol, 1, 1).setValue(translatedText);
                  processed++;
                } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
                  highlightUnknownVersionCell_(sb, row, targetCol, lang, data.chunk[t].osis);
                  unknownVersions++;
                } else {
                  errors++;
                }
              }
            } catch(e){
              Logger.log('解析回應錯誤: ' + e);
              errors += data.chunk.length;
            }
          } else {
            Logger.log('API 錯誤: ' + code + ' ' + text);
            errors += requestData[r].chunk.length;
          }
        }
        
        var batchElapsed = Math.round((new Date().getTime() - batchStartTime) / 1000);
        Logger.log('批次 ' + (batch + 1) + ' 完成，耗時: ' + batchElapsed + ' 秒');
        
        // 進度提示
        try{ 
          SpreadsheetApp.getActive().toast('批次'+(batch+1)+'/'+batches+' ['+lang+'] 成功:'+processed+', 未知:'+unknownVersions+', 錯誤:'+errors); 
        }catch(e){}
        
        // 批次間暫停（併發模式間隔較短）
        if (batch < batches - 1){
          Utilities.sleep(500);
        }
        
      } catch(e){
        Logger.log('併發請求錯誤: ' + e);
        errors += currentBatchData.length;
      }
    }
    
    var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
    Logger.log('語言 ' + lang + ' 超高速完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
    
    totalProcessed += processed;
    totalErrors += errors;
    totalUnknownVersions += unknownVersions;
    
    // 語言間暫停
    if (l < langs.length - 1){
      Utilities.sleep(1000);
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '⚡ 超高速併發轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 總行數：' + totalRows + ' 行\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行 (' + Math.round(totalProcessed/totalRows*100) + '%)\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行 (' + Math.round(totalUnknownVersions/totalRows*100) + '%)\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行 (' + Math.round(totalErrors/totalRows*100) + '%)\n';
  resultMsg += '• 總耗時：' + totalTime + ' 秒\n';
  resultMsg += '• 併發批次：' + batches + ' 批\n';
  resultMsg += '• 速度提升：比單個請求快 8-10 倍\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n';
    resultMsg += '   請檢查 Google Apps Script 執行記錄了解詳情\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  if (langs.length > 1){
    resultMsg += '✅ 已將英文來源超高速併發轉換為 ' + langs.length + ' 個語言的聖經版本';
  } else {
    resultMsg += '✅ 已將英文來源超高速併發轉換為 ' + langs[0] + ' 的聖經版本';
  }
  
  // 顯示結果
  SpreadsheetApp.getUi().alert(resultMsg);
}

// 極簡超高速轉換（大數據專用）
function bible_simpleUltraFast(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 極簡設定
  var BATCH_SIZE = 20; // 每批處理 20 行
  var CONCURRENT_REQUESTS = 3; // 同時發送 3 個請求
  
  // 處理每個語言
  for (var l = 0; l < langs.length; l++){
    var lang = langs[l];
    var targetCol = bmap[lang];
    
    if (!targetCol){ 
      Logger.log('找不到 '+lang+' 欄位，跳過');
      continue; 
    }
    
    var processed = 0; var errors = 0; var unknownVersions = 0;
    var langStartTime = new Date().getTime();
    
    Logger.log('開始極簡超高速處理語言: ' + lang);
    
    // 顯示開始提示
    try{ 
      SpreadsheetApp.getActive().toast('開始處理語言: ' + lang); 
    }catch(e){}
    
    // 預先讀取所有數據
    var allData = [];
    for (var r = rowStart; r <= rowEnd; r++){
      if (r > sr.getLastRow()) break;
      
      var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
      if (!enText) continue;
      
      var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
      var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
      if (!osis) continue;
      
      allData.push({row: r, enText: enText, osis: osis});
    }
    
    if (allData.length === 0){
      Logger.log('語言 ' + lang + ' 沒有有效數據，跳過');
      continue;
    }
    
    var batches = Math.ceil(allData.length / BATCH_SIZE);
    Logger.log('語言 ' + lang + ' 有效數據: ' + allData.length + ' 行，分 ' + batches + ' 批處理');
    
    // 處理每個批次
    for (var batch = 0; batch < batches; batch++){
      var batchStart = batch * BATCH_SIZE;
      var batchEnd = Math.min(batchStart + BATCH_SIZE, allData.length);
      var currentBatchData = allData.slice(batchStart, batchEnd);
      
      if (currentBatchData.length === 0) break;
      
      Logger.log('批次 ' + (batch + 1) + '/' + batches + ' - 處理 ' + currentBatchData.length + ' 行');
      
      // 顯示批次進度
      try{ 
        SpreadsheetApp.getActive().toast('批次 ' + (batch + 1) + '/' + batches + ' [' + lang + ']'); 
      }catch(e){}
      
      // 準備併發請求
      var requests = [];
      var requestData = [];
      
      // 將當前批次分成多個併發請求
      var chunkSize = Math.ceil(currentBatchData.length / CONCURRENT_REQUESTS);
      for (var c = 0; c < CONCURRENT_REQUESTS && c * chunkSize < currentBatchData.length; c++){
        var chunkStart = c * chunkSize;
        var chunkEnd = Math.min(chunkStart + chunkSize, currentBatchData.length);
        var chunk = currentBatchData.slice(chunkStart, chunkEnd);
        
        if (chunk.length === 0) continue;
        
        // 準備批量翻譯數據
        var items = [];
        for (var i = 0; i < chunk.length; i++){
          items.push({
            question: chunk[i].enText,
            osis: chunk[i].osis,
            row: chunk[i].row
          });
        }
        
        requestData.push({chunk: chunk, items: items});
        
        // 創建併發請求
        var targetVersion = BIBLE_VERSIONS[lang] || '該語言的標準聖經譯本';
        var systemPrompt = 'You are a biblical translation expert. Translate English Bible text into ' + lang + ' using ONLY ' + targetVersion + '. Return JSON: {"translations":["text1","text2",...]}.';
        
        var userPrompt = 'Translate these Bible texts to ' + lang + ' using ' + targetVersion + ':\n' + 
          JSON.stringify(items.map(item => item.question));
        
        var payload = {
          model: 'gpt-4o-mini',
          messages: [
            {role: 'system', content: systemPrompt},
            {role: 'user', content: userPrompt}
          ],
          temperature: 0.1,
          max_tokens: 1000
        };
        
        requests.push({
          url: 'https://api.openai.com/v1/chat/completions',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + openaiKey,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
      }
      
      // 併發發送所有請求
      try {
        var responses = UrlFetchApp.fetchAll(requests);
        Logger.log('批次 ' + (batch + 1) + ' 收到 ' + responses.length + ' 個回應');
        
        // 處理每個回應
        for (var r = 0; r < responses.length; r++){
          var response = responses[r];
          var code = response.getResponseCode();
          var text = response.getContentText();
          
          if (code >= 200 && code < 300){
            try {
              var result = JSON.parse(text);
              var content = result.choices && result.choices[0] && result.choices[0].message ? result.choices[0].message.content : '';
              var translations = [];
              
              if (content){
                var jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch){
                  var jsonResult = JSON.parse(jsonMatch[0]);
                  translations = jsonResult.translations || [];
                }
              }
              
              // 寫入翻譯結果
              var data = requestData[r];
              for (var t = 0; t < translations.length && t < data.chunk.length; t++){
                var translatedText = String(translations[t] || '').trim();
                var row = data.chunk[t].row;
                
                if (translatedText && !translatedText.includes('UNKNOWN_VERSION')){
                  sb.getRange(row, targetCol, 1, 1).setValue(translatedText);
                  processed++;
                } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
                  highlightUnknownVersionCell_(sb, row, targetCol, lang, data.chunk[t].osis);
                  unknownVersions++;
                } else {
                  errors++;
                }
              }
            } catch(e){
              Logger.log('解析回應錯誤: ' + e);
              errors += data.chunk.length;
            }
          } else {
            Logger.log('API 錯誤: ' + code + ' ' + text);
            errors += requestData[r].chunk.length;
          }
        }
        
        var batchElapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
        Logger.log('批次 ' + (batch + 1) + ' 完成，耗時: ' + batchElapsed + ' 秒');
        
        // 進度提示
        try{ 
          SpreadsheetApp.getActive().toast('批次'+(batch+1)+'/'+batches+' ['+lang+'] 成功:'+processed+', 錯誤:'+errors); 
        }catch(e){}
        
        // 批次間暫停
        if (batch < batches - 1){
          Utilities.sleep(1000);
        }
        
      } catch(e){
        Logger.log('併發請求錯誤: ' + e);
        errors += currentBatchData.length;
      }
    }
    
    var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
    Logger.log('語言 ' + lang + ' 極簡完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
    
    totalProcessed += processed;
    totalErrors += errors;
    totalUnknownVersions += unknownVersions;
    
    // 語言間暫停
    if (l < langs.length - 1){
      Utilities.sleep(2000);
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '🚀 極簡超高速轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行\n';
  resultMsg += '• 總耗時：' + totalTime + ' 秒\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  resultMsg += '✅ 極簡超高速轉換完成！';
  
  // 顯示結果
  SpreadsheetApp.getUi().alert(resultMsg);
}

// 超穩定轉換（小批次版）
function bible_ultraStable(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sc = ss.getSheetByName(SHEET_BCONF);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sc || !sr){ SpreadsheetApp.getUi().alert('缺少必要工作表（bible_bank/config/bible_refs）'); return; }
  
  // 檢查 OpenAI API Key
  var openaiKey = getOpenAIKey_();
  if (!openaiKey){ SpreadsheetApp.getUi().alert('缺少 OPENAI_API_KEY。請到「專案設定 → 腳本屬性」新增。'); return; }
  
  // 獲取選取範圍
  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }
  
  var colStart = sel.getColumn();
  var colEnd = colStart + sel.getNumColumns() - 1;
  var rowStart = Math.max(2, sel.getRow());
  var rowEnd = rowStart + sel.getNumRows() - 1;
  
  // 檢查選取的欄位是否為語言欄位
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push(lang);
    }
  }
  
  if (langs.length === 0){
    SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return;
  }
  
  // 讀取表頭映射
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄位'); return; }
  
  // 讀取 refs 以獲取 OSIS 參考
  var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
  var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
  
  var totalProcessed = 0; var totalErrors = 0; var totalUnknownVersions = 0;
  var startTime = new Date().getTime();
  
  // 超穩定設定
  var BATCH_SIZE = 5; // 每批只處理 5 行
  var API_DELAY = 2000; // 2 秒間隔
  
  // 處理每個語言
  for (var l = 0; l < langs.length; l++){
    var lang = langs[l];
    var targetCol = bmap[lang];
    
    if (!targetCol){ 
      Logger.log('找不到 '+lang+' 欄位，跳過');
      continue; 
    }
    
    var processed = 0; var errors = 0; var unknownVersions = 0;
    var langStartTime = new Date().getTime();
    
    Logger.log('開始超穩定處理語言: ' + lang);
    
    // 顯示開始提示
    try{ 
      SpreadsheetApp.getActive().toast('開始處理語言: ' + lang + ' (超穩定模式)'); 
    }catch(e){}
    
    // 預先讀取所有數據
    var allData = [];
    for (var r = rowStart; r <= rowEnd; r++){
      if (r > sr.getLastRow()) break;
      
      var enText = String(sb.getRange(r, enCol, 1, 1).getValue()||'').trim();
      if (!enText) continue;
      
      var refRow = sr.getRange(r,1,1,sr.getLastColumn()).getValues()[0];
      var osis = String(refRow[ridx['ref_osis']-1]||'').trim();
      if (!osis) continue;
      
      allData.push({row: r, enText: enText, osis: osis});
    }
    
    if (allData.length === 0){
      Logger.log('語言 ' + lang + ' 沒有有效數據，跳過');
      try{ 
        SpreadsheetApp.getActive().toast('語言 ' + lang + ' 沒有有效數據，跳過'); 
      }catch(e){}
      continue;
    }
    
    var batches = Math.ceil(allData.length / BATCH_SIZE);
    Logger.log('語言 ' + lang + ' 有效數據: ' + allData.length + ' 行，分 ' + batches + ' 批處理');
    
    // 處理每個批次
    for (var batch = 0; batch < batches; batch++){
      var batchStart = batch * BATCH_SIZE;
      var batchEnd = Math.min(batchStart + BATCH_SIZE, allData.length);
      var currentBatchData = allData.slice(batchStart, batchEnd);
      
      if (currentBatchData.length === 0) break;
      
      Logger.log('批次 ' + (batch + 1) + '/' + batches + ' - 處理 ' + currentBatchData.length + ' 行');
      
      // 顯示批次進度
      try{ 
        SpreadsheetApp.getActive().toast('批次 ' + (batch + 1) + '/' + batches + ' [' + lang + '] 處理中...'); 
      }catch(e){}
      
      // 逐行處理（最穩定）
      for (var i = 0; i < currentBatchData.length; i++){
        var data = currentBatchData[i];
        var row = data.row;
        var enText = data.enText;
        var osis = data.osis;
        
        try {
          // 高亮當前處理的行
          try {
            sb.getRange(row, targetCol, 1, 1).setBackground('#e8f5e8'); // 淺綠色高亮
            SpreadsheetApp.flush(); // 強制刷新顯示
          } catch(e){}
          
          // 使用 OpenAI 轉換為目標語言的聖經版本
          var translatedText = translateToTargetBibleVersion_(lang, osis, enText);
          
          if (translatedText && translatedText !== '' && !translatedText.includes('UNKNOWN_VERSION')){
            sb.getRange(row, targetCol, 1, 1).setValue(translatedText);
            processed++;
          } else if (translatedText && translatedText.includes('UNKNOWN_VERSION')){
            highlightUnknownVersionCell_(sb, row, targetCol, lang, osis);
            unknownVersions++;
          } else {
            errors++;
          }
          
          // 每行都顯示進度
          try{ 
            SpreadsheetApp.getActive().toast('批次'+(batch+1)+'/'+batches+' ['+lang+'] 行'+(i+1)+'/'+currentBatchData.length+' 成功:'+processed+', 錯誤:'+errors); 
          }catch(e){}
          
          // API 限制：每 2 秒一個請求（超穩定模式）
          Utilities.sleep(API_DELAY);
          
        } catch(e){
          Logger.log('轉換錯誤 行'+row+', 語言'+lang+': '+e);
          errors++;
        }
      }
      
      var batchElapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
      Logger.log('批次 ' + (batch + 1) + ' 完成，耗時: ' + batchElapsed + ' 秒');
      
      // 批次間暫停
      if (batch < batches - 1){
        Utilities.sleep(3000);
      }
    }
    
    var elapsed = Math.round((new Date().getTime() - langStartTime) / 1000);
    Logger.log('語言 ' + lang + ' 超穩定完成: 成功=' + processed + ', 未知=' + unknownVersions + ', 錯誤=' + errors + ', 耗時=' + elapsed + '秒');
    
    totalProcessed += processed;
    totalErrors += errors;
    totalUnknownVersions += unknownVersions;
    
    // 語言間暫停
    if (l < langs.length - 1){
      Utilities.sleep(5000);
    }
  }
  
  // 計算總處理時間
  var totalTime = Math.round((new Date().getTime() - startTime) / 1000);
  
  // 生成詳細結果報告
  var resultMsg = '🔧 超穩定轉換完成！\n\n';
  resultMsg += '📊 處理統計：\n';
  resultMsg += '• 處理語言：' + langs.join(', ') + '\n';
  resultMsg += '• 成功轉換：' + totalProcessed + ' 行\n';
  resultMsg += '• 未知版本：' + totalUnknownVersions + ' 行\n';
  resultMsg += '• 其他錯誤：' + totalErrors + ' 行\n';
  resultMsg += '• 總耗時：' + totalTime + ' 秒\n\n';
  
  if (totalUnknownVersions > 0){
    resultMsg += '⚠️ 注意：未知版本的欄位已用紅色高亮標記\n\n';
  }
  
  if (totalErrors > 0){
    resultMsg += '❌ 部分轉換失敗，請檢查日誌了解原因\n\n';
  }
  
  resultMsg += '✅ 超穩定轉換完成！';
  
  // 顯示結果
  SpreadsheetApp.getUi().alert(resultMsg);
}

// 高亮未知版本的欄位
function highlightUnknownVersionCell_(sheet, row, col, lang, osis){
  var cell = sheet.getRange(row, col, 1, 1);
  
  // 設置背景色為淺紅色
  cell.setBackground('#ffebee');
  
  // 設置文字顏色為深紅色
  cell.setFontColor('#d32f2f');
  
  // 設置文字為粗體
  cell.setFontWeight('bold');
  
  // 設置邊框
  cell.setBorder(true, true, true, true, true, true, '#f44336', SpreadsheetApp.BorderStyle.SOLID);
  
  // 設置文字內容為標記
  cell.setValue('⚠️ 未知版本 - ' + lang);
  
  // 添加註解說明
  var note = 'AI 無法找到 ' + lang + ' 的標準聖經版本翻譯。\n' +
             'OSIS: ' + osis + '\n' +
             '建議：手動檢查或使用其他翻譯工具。';
  cell.setNote(note);
}

// 根據語言獲取版本說明
function getVersionDescription_(lang, version){
  var descriptions = {
    'es-MX': 'Reina-Valera 1960 is the most widely used Spanish Bible translation in Latin America and Mexico. It is the traditional, authoritative Spanish Bible that most Spanish-speaking Christians use.',
    'pt-BR': 'Almeida Revista e Corrigida is the traditional Portuguese Bible translation, widely used in Brazil and Portuguese-speaking communities worldwide.',
    'zh-TW': 'Chinese Union Version (和合本) is the most authoritative Chinese Bible translation, used by Chinese-speaking Christians worldwide. It uses traditional Chinese characters.',
    'zh-CN': 'Chinese Union Version Simplified (和合本簡體版) is the simplified Chinese version of the authoritative Chinese Union Version Bible.',
    'ja-JP': 'Shin Kaiyaku (新改訳聖書) is the most popular Japanese Bible translation, widely used in Japanese Christian communities.',
    'ko-KR': 'Korean Revised Version (개역개정) is the standard Korean Bible translation, used by Korean-speaking Christians worldwide.',
    'fr-FR': 'Louis Segond 1910 is the classic French Bible translation, widely used in French-speaking Christian communities.',
    'de-DE': 'Lutherbibel 1912 is the traditional German Bible translation, based on Martin Luther\'s original translation.',
    'it-IT': 'Diodati 1885 is the classic Italian Bible translation, widely used in Italian-speaking Christian communities.',
    'ru-RU': 'Synodal Translation (Синодальный перевод) is the standard Russian Bible translation, used by Russian Orthodox and Protestant churches.',
    'ar-SA': 'Arabic Bible (الكتاب المقدس) is the traditional Arabic Bible translation, used by Arabic-speaking Christians.',
    'id-ID': 'Alkitab Terjemahan Baru is the modern Indonesian Bible translation, widely used in Indonesia.',
    'vi-VN': 'Kinh Thánh Việt Nam is the Vietnamese Bible translation, used by Vietnamese-speaking Christians.',
    'th-TH': 'Thai Bible (พระคัมภีร์ไทย) is the Thai Bible translation, used by Thai-speaking Christians.',
    'fil-PH': 'Ang Dating Biblia is the traditional Filipino Bible translation, used by Filipino-speaking Christians.',
    'nl-NL': 'Statenvertaling 1637 is the classic Dutch Bible translation, widely used in Dutch-speaking Christian communities.',
    'pl-PL': 'Biblia Tysiąclecia is the modern Polish Bible translation, widely used in Poland.',
    'sv-SE': 'Bibeln 1917 is the Swedish Bible translation, used by Swedish-speaking Christians.',
    'nb-NO': 'Bibelen 1930 is the Norwegian Bible translation, used by Norwegian-speaking Christians.',
    'da-DK': 'Bibelen 1931 is the Danish Bible translation, used by Danish-speaking Christians.',
    'fi-FI': 'Raamattu 1933 is the Finnish Bible translation, used by Finnish-speaking Christians.',
    'ro-RO': 'Biblia Cornilescu is the Romanian Bible translation, used by Romanian-speaking Christians.',
    'el-GR': 'Greek Bible (Αγία Γραφή) is the Greek Bible translation, used by Greek-speaking Christians.',
    'cs-CZ': 'Bible kralická is the Czech Bible translation, used by Czech-speaking Christians.',
    'hu-HU': 'Károli Gáspár fordítása is the Hungarian Bible translation, used by Hungarian-speaking Christians.',
    'uk-UA': 'Ukrainian Bible (Українська Біблія) is the Ukrainian Bible translation, used by Ukrainian-speaking Christians.',
    'ms-MY': 'Alkitab Bahasa Malaysia is the Malay Bible translation, used by Malay-speaking Christians.',
    'hi-IN': 'Hindi Bible (हिंदी बाइबिल) is the Hindi Bible translation, used by Hindi-speaking Christians.',
    'bn-BD': 'Bengali Bible (বাংলা বাইবেল) is the Bengali Bible translation, used by Bengali-speaking Christians.',
    'he-IL': 'Hebrew Bible (תנ"ך) is the Hebrew Bible, used by Hebrew-speaking Jews and Christians.',
    'fa-IR': 'Persian Bible (کتاب مقدس) is the Persian Bible translation, used by Persian-speaking Christians.',
    'ur-PK': 'Urdu Bible (اردو بائبل) is the Urdu Bible translation, used by Urdu-speaking Christians.',
    'tr-TR': 'Turkish Bible (Türkçe İncil) is the Turkish Bible translation, used by Turkish-speaking Christians.'
  };
  
  return descriptions[lang] || 'This is the canonical Bible translation for ' + lang + ' speaking communities. Use the exact wording and style of ' + version + '.';
}

// 各語言最常用的聖經版本映射（全域定義）
var BIBLE_VERSIONS = {
    'zh-TW': '和合本 (Chinese Union Version)',
    'zh-CN': '和合本簡體版 (Chinese Union Version Simplified)',
    'es-MX': 'Reina-Valera 1960 (Spanish Bible)',
    'pt-BR': 'Almeida Revista e Corrigida',
    'ja-JP': '新改訳聖書 (Shin Kaiyaku)',
    'ko-KR': '개역개정 (Korean Revised Version)',
    'fr-FR': 'Louis Segond 1910',
    'de-DE': 'Lutherbibel 1912',
    'it-IT': 'Diodati 1885',
    'id-ID': 'Alkitab Terjemahan Baru (Indonesian Bible)',
    'vi-VN': 'Kinh Thánh Việt Nam (Vietnamese Bible)',
    'th-TH': 'พระคัมภีร์ไทย (Thai Bible)',
    'ru-RU': 'Синодальный перевод (Synodal Translation)',
    'ar-SA': 'الكتاب المقدس (Arabic Bible)',
    'fil-PH': 'Ang Dating Biblia (Filipino Bible)',
    'nl-NL': 'Statenvertaling 1637 (Dutch Bible)',
    'pl-PL': 'Biblia Tysiąclecia (Polish Bible)',
    'sv-SE': 'Bibeln 1917 (Swedish Bible)',
    'nb-NO': 'Bibelen 1930 (Norwegian Bible)',
    'da-DK': 'Bibelen 1931 (Danish Bible)',
    'fi-FI': 'Raamattu 1933 (Finnish Bible)',
    'ro-RO': 'Biblia Cornilescu (Romanian Bible)',
    'el-GR': 'Αγία Γραφή (Greek Bible)',
    'cs-CZ': 'Bible kralická (Czech Bible)',
    'hu-HU': 'Károli Gáspár fordítása (Hungarian Bible)',
    'uk-UA': 'Українська Біблія (Ukrainian Bible)',
    'ms-MY': 'Alkitab Bahasa Malaysia (Malay Bible)',
    'hi-IN': 'हिंदी बाइबिल (Hindi Bible)',
    'bn-BD': 'বাংলা বাইবেল (Bengali Bible)',
    'he-IL': 'תנ"ך (Hebrew Bible)',
    'fa-IR': 'کتاب مقدس (Persian Bible)',
    'ur-PK': 'اردو بائبل (Urdu Bible)',
    'tr-TR': 'Türkçe İncil (Turkish Bible)'
  };

// 使用 OpenAI 將英文聖經文本轉換為目標語言的聖經版本
function translateToTargetBibleVersion_(targetLang, osis, englishText){
  var key = getOpenAIKey_();
  if (!key || !englishText) return '';
  
  var targetVersion = BIBLE_VERSIONS[targetLang] || '該語言的標準聖經譯本';
  
  // 簡化 prompt，避免超時
  var systemPrompt = 'You are a biblical translation expert. Translate English Bible text into ' + targetLang + ' using ONLY ' + targetVersion + '. Return only the translated text.';
  
  var userPrompt = 'Translate this Bible text to ' + targetLang + ' using ' + targetVersion + ':\n' + englishText;
  
  var payload = {
    model: 'gpt-4o-mini',
    messages: [
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt}
    ],
    temperature: 0.1,
    max_tokens: 500
  };
  
  try {
    var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300){
      var result = JSON.parse(response.getContentText());
      var content = result.choices && result.choices[0] && result.choices[0].message ? result.choices[0].message.content : '';
      var translated = String(content || '').trim();
      
      // 檢查是否為未知版本回應
      if (translated === 'UNKNOWN_VERSION' || translated.includes('UNKNOWN_VERSION')){
        Logger.log('AI 回應未知版本: ' + targetLang + ' - ' + targetVersion);
        return '';
      }
      
      return translated;
    } else {
      Logger.log('OpenAI API 錯誤: ' + response.getResponseCode() + ' ' + response.getContentText());
      return '';
    }
  } catch(e){
    Logger.log('OpenAI 請求錯誤: ' + e);
    return '';
  }
}

/* =========================
   Cursor / Resume helper
   一鍵改善：分段 (chunk) 執行 + 續跑（存到 Properties）
   ========================= */

// 調參（可按需調整）
var CURSOR_DEFAULT_CHUNK = 100;   // 每次處理多少筆
var CURSOR_SLEEP_MS = 500;        // 每次 API 呼叫後暫停（節流）
var CURSOR_PROP_PREFIX = 'BIBLE_CURSOR_'; // 存在 ScriptProperties 的 key 前綴

// 儲存 / 讀取 / 清除 cursor state
function _cursor_saveState(key, obj){
  PropertiesService.getScriptProperties().setProperty(CURSOR_PROP_PREFIX + key, JSON.stringify(obj));
}
function _cursor_getState(key){
  var v = PropertiesService.getScriptProperties().getProperty(CURSOR_PROP_PREFIX + key);
  return v ? JSON.parse(v) : null;
}
function _cursor_clearState(key){
  PropertiesService.getScriptProperties().deleteProperty(CURSOR_PROP_PREFIX + key);
}

// 一鍵開始或繼續（UI 呼叫）
function bible_fastBatchTranslate_cursored(){
  // 如果已有 cursor 就繼續，沒有就建立新 job（基於目前選取）
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sr){ SpreadsheetApp.getUi().alert('缺少 bible_bank 或 bible_refs'); return; }

  var sel = sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取要轉換的目標語言欄位範圍'); return; }

  // key 決定：使用 sheet 名稱 + 選取起訖（避免不同選取互相覆蓋）
  var key = sb.getName() + '::' + sel.getColumn() + '-' + (sel.getColumn()+sel.getNumColumns()-1) + '::' + Math.max(2, sel.getRow()) + '-' + (Math.max(2, sel.getRow())+sel.getNumRows()-1);

  var existing = _cursor_getState(key);
  if (existing && existing.pos < existing.total){
    // 有未完成 job，詢問是否繼續
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert('檢測到尚未完成的工作', '發現已存在進度（pos='+existing.pos+' / '+existing.total+'）。是否要從進度繼續？', ui.ButtonSet.YES_NO);
    if (resp === ui.Button.YES){
      _cursor_processChunk(key);
      return;
    } else {
      _cursor_clearState(key); // 重新開始
    }
  }

  // --- 建立新 job state ---
  // 1) 讀表頭與 en-US 欄
  var hb = sb.getRange(1,1,1,sb.getLastColumn()).getValues()[0];
  var bmap = {}; for (var i=0;i<hb.length;i++) bmap[String(hb[i]).trim()] = i+1;
  var enCol = bmap['en-US'];
  if (!enCol){ SpreadsheetApp.getUi().alert('找不到 en-US 欄'); return; }

  // 2) 決定語言欄（從選取範圍讀取）
  var colStart = sel.getColumn(), colEnd = colStart + sel.getNumColumns() - 1;
  var langs = [];
  for (var c = colStart; c <= colEnd; c++){
    var lang = String(sb.getRange(1, c, 1, 1).getValue()||'').trim();
    if (lang && lang!=='id' && lang!=='type' && lang!=='grade_min' && lang!=='grade_max' && lang!=='tags'){
      langs.push({ name: lang, col: c });
    }
  }
  if (langs.length === 0){ SpreadsheetApp.getUi().alert('請將選取範圍放在語言欄位（標題在第1列）'); return; }

  // 3) 讀取 refs 區間界線
  var rowStart = Math.max(2, sel.getRow()), rowEnd = rowStart + sel.getNumRows() - 1;
  if (rowStart > sr.getLastRow()){ SpreadsheetApp.getUi().alert('選取起點之後無 refs 資料'); return; }
  rowEnd = Math.min(rowEnd, sr.getLastRow());

  // 4) 建立 job meta 並存
  var total = rowEnd - rowStart + 1;
  var job = {
    sheetName: sb.getName(),
    selColStart: colStart,
    selColEnd: colEnd,
    rowStart: rowStart,
    rowEnd: rowEnd,
    enCol: enCol,
    langs: langs,
    pos: 0,              // 已處理的 offset（從 0 開始）
    total: total,
    chunk: CURSOR_DEFAULT_CHUNK,
    sleepMs: CURSOR_SLEEP_MS,
    createdAt: (new Date()).toISOString()
  };
  _cursor_saveState(key, job);

  // 立即執行第一個 chunk（同步）
  _cursor_processChunk(key);
}

// 處理一個 chunk（內部主力）
function _cursor_processChunk(key){
  var job = _cursor_getState(key);
  if (!job){ SpreadsheetApp.getUi().alert('找不到對應的工作進度'); return; }

  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(job.sheetName);
  var sr = ss.getSheetByName(SHEET_BREFS);
  if (!sb || !sr){ SpreadsheetApp.getUi().alert('缺少工作表'); return; }

  // 1) 一次性讀取 refs 區塊 + en 文本塊（提高效能）
  var totalRows = job.total;
  var absRowStart = job.rowStart;
  var absRowEnd = job.rowEnd;
  // refs 範圍
  var refsBlock = sr.getRange(absRowStart,1,totalRows, sr.getLastColumn()).getValues();
  // en 文本塊
  var enBlock = sb.getRange(absRowStart, job.enCol, totalRows, 1).getValues();

  // 2) 處理 chunk 區間
  var startOffset = job.pos;
  var endOffset = Math.min(job.pos + job.chunk - 1, job.total - 1);

  // 準備收集要寫的資料：以 lang.col 為鍵，存陣列 [{row: actualRow, text: ...}, ...]
  var writesByCol = {};
  for (var li=0; li<job.langs.length; li++){ writesByCol[job.langs[li].col] = []; }

  var errors = 0;
  for (var off = startOffset; off <= endOffset; off++){
    var actualRow = absRowStart + off;
    var enText = String(enBlock[off][0] || '').trim();
    if (!enText) { continue; } // 沒英文就跳過
    // 取得 OSIS（假定 ref_osis 在 bible_refs 的某個欄位，以「ref_osis」欄名定位）
    var hr = sr.getRange(1,1,1,sr.getLastColumn()).getValues()[0];
    var ridx = {}; for (var j=0;j<hr.length;j++) ridx[String(hr[j]).trim()] = j+1;
    var osis = String(refsBlock[off][ridx['ref_osis'] - 1] || '').trim();
    if (!osis) { continue; }

    // 逐語言呼叫翻譯（或你自己的 translateToTargetBibleVersion_）
    for (var g=0; g<job.langs.length; g++){
      var langObj = job.langs[g];
      try {
        var translated = translateToTargetBibleVersion_(langObj.name, osis, enText) || '';
        // 如果你希望把 UNKNOWN_VERSION 也寫回，可以直接 push translated
        writesByCol[langObj.col].push({ row: actualRow, text: translated });
      } catch(e){
        Logger.log('Translate error row '+actualRow+' lang '+langObj.name+': '+e);
        errors++;
      }
      // 節流
      Utilities.sleep(job.sleepMs || CURSOR_SLEEP_MS);
    }
  }

  // 3) 批次寫回：對每個語言欄，合併連續區塊一次 setValues
  for (var colKey in writesByCol){
    var arr = writesByCol[colKey];
    if (!arr || !arr.length) continue;
    // 先按 row 排
    arr.sort(function(a,b){ return a.row - b.row; });
    // 合併成連續區塊
    var i = 0;
    while (i < arr.length){
      var startRow = arr[i].row;
      var buffer = [ [ arr[i].text ] ]; // 二維陣列 (N x 1)
      var prevRow = arr[i].row;
      i++;
      while (i < arr.length && arr[i].row === prevRow + 1){
        buffer.push([ arr[i].text ]);
        prevRow = arr[i].row;
        i++;
      }
      // 寫入範圍
      try {
        sb.getRange(startRow, Number(colKey), buffer.length, 1).setValues(buffer);
      } catch(e){
        Logger.log('批次寫入失敗 col '+colKey+' startRow '+startRow+': '+e);
        // 失敗時回退到逐筆寫入（保險）
        for (var z=0; z<buffer.length; z++){
          try{ sb.getRange(startRow + z, Number(colKey)).setValue(buffer[z][0]); } catch(e2){}
        }
      }
    }
  }

  // 4) 更新 job pos 保存
  job.pos = endOffset + 1; // 下一個要處理的 offset
  _cursor_saveState(key, job);

  // 5) 完成檢查
  if (job.pos >= job.total){
    // 完成：清除 cursor，並通知
    _cursor_clearState(key);
    SpreadsheetApp.getUi().alert('✅ 轉換完成 （共處理 '+job.total+' 行，錯誤 '+errors+'）');
  } else {
    // 尚未完成，提示並讓使用者一鍵繼續
    SpreadsheetApp.getUi().alert('已處理到 ' + job.pos + ' / ' + job.total + '（本次處理 ' + (endOffset - startOffset + 1) + ' 行）。\n\n請再次執行「一鍵開始/繼續」以處理下一個 chunk，或在腳本中調整 chunk 大小與 sleep。');
  }
}

// 輔助：手動清除某個 key（若測試時想重置）
function bible_cursor_clearAllForCurrentSelection(){
  var ss = SpreadsheetApp.getActive();
  var sb = ss.getSheetByName(SHEET_BBANK);
  var sel = sb && sb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 bible_bank 選取範圍以決定 key'); return; }
  var key = sb.getName() + '::' + sel.getColumn() + '-' + (sel.getColumn()+sel.getNumColumns()-1) + '::' + Math.max(2, sel.getRow()) + '-' + (Math.max(2, sel.getRow())+sel.getNumRows()-1);
  _cursor_clearState(key);
  SpreadsheetApp.getUi().alert('已清除對應的 cursor 狀態（key='+key+'）');
}

