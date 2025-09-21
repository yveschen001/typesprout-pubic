// ③d：掃描整張 content_bank，僅對「目標語言空白且 zh-TW 有內容」的列進行翻譯補齊
function translateContentBankFillMissingTarget(){
  ensureApiKey_(); ensureSheetsExist_();
  var cfg = readUi_();
  var target = String(cfg.targetLocale||'en-US').trim();
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  if (!cb){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }

  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var zhIdx = getLangCol_(headers, 'zh-TW');
  if (zhIdx < 0){ SpreadsheetApp.getUi().alert('缺少語言欄：zh-TW'); return; }
  var zhCol = zhIdx + 1;

  // 若在 content_bank 有選取語言欄，優先以選取欄位為目標
  var sel = (SpreadsheetApp.getActive().getActiveSheet().getName()===SHEET_CONTENT) ? cb.getActiveRange() : null;
  var tgtCol = null; var tgtName = null;
  if (sel){
    var cStart = sel.getColumn(); var cEnd = cStart + sel.getNumColumns() - 1;
    for (var c=cStart; c<=cEnd; c++){
      var name = String(headers[c-1]||'').trim();
      if (!name || name==='id' || name==='type' || name==='grade_min' || name==='grade_max' || name==='tags' || name==='zh-TW') continue;
      tgtCol = c; tgtName = name; break;
    }
  }
  if (!tgtCol){
    var tIdx = getLangCol_(headers, target);
    if (tIdx < 0){ SpreadsheetApp.getUi().alert('缺少語言欄：'+target); return; }
    tgtCol = tIdx + 1; tgtName = target;
  }

  var last = cb.getLastRow(); if (last<2){ SpreadsheetApp.getUi().alert('content_bank 無資料'); return; }
  var rows = last - 1; var start = 2;

  var CH = Math.max(10, Math.min(100, CHUNK_SIZE||50));
  var CONC = 8;
  var processed = 0, filled = 0, verified = 0, fallbackCalls = 0, remainEmpty = 0;
  var startTs = new Date().getTime(), TIME_BUDGET = 340000;

  while (processed < rows){
    var size = Math.min(200, rows - processed);
    var zhVals = cb.getRange(start+processed, zhCol, size, 1).getValues();
    var tgtVals = cb.getRange(start+processed, tgtCol, size, 1).getValues();

    var idxs = []; var packs = [];
    for (var r=0;r<size;r++){
      var srcRaw = String(zhVals[r][0]||'').trim();
      var src = srcRaw;
      if (srcRaw && srcRaw.charAt(0)==='{'){
        try{ var obj = JSON.parse(srcRaw); if (obj && typeof obj==='object' && obj.q) src = String(obj.q||''); }catch(e){}
      }
      var cur = String(tgtVals[r][0]||'');
      if (src && !cur){ idxs.push(r); packs.push({ question: src }); }
    }
    var cursor = 0;
    while (cursor < packs.length){
      var reqPacks = [], chunkLens = [], chunkStarts = [];
      for (var c=0; c<CONC && cursor<packs.length; c++){
        var thisSize = Math.min(CH, packs.length - cursor);
        reqPacks.push(packs.slice(cursor, cursor+thisSize));
        chunkLens.push(thisSize); chunkStarts.push(cursor); cursor += thisSize;
      }
      var multi = callOpenAI_LocalizeBatchMulti_(reqPacks, 'zh-TW', target);
      for (var m=0;m<reqPacks.length;m++){
        var translated = multi[m] || [];
        var sizeM = chunkLens[m];
        var writeVals = []; var emptyIdxs = []; var t;
        for (t=0;t<sizeM;t++){
          var tr = translated[t]; var text = '';
          if (tr && typeof tr==='object') text = String(tr.q||''); else if (typeof tr==='string') text = tr;
          if (!String(text||'').trim()) emptyIdxs.push(t);
          writeVals.push([text]);
        }
        if (emptyIdxs.length){
          var pack2 = []; for (t=0;t<emptyIdxs.length;t++){ var item=reqPacks[m][emptyIdxs[t]]||{question:''}; pack2.push({question:String(item.question||'')}); }
          var fb = callOpenAI_LocalizeBatch_(pack2, 'zh-TW', target) || []; fallbackCalls++;
          for (t=0;t<emptyIdxs.length;t++){ var fbTr=fb[t]; var fbText=''; if (fbTr&&typeof fbTr==='object') fbText=String(fbTr.q||''); else if (typeof fbTr==='string') fbText=fbTr; if (String(fbText||'').trim()) writeVals[ emptyIdxs[t] ][0]=fbText; else remainEmpty++; }
        }
        for (var w=0; w<sizeM; w++){
          var at = idxs[ chunkStarts[m] + w ];
          var val = String(writeVals[w] && writeVals[w][0] || '').trim();
          if (typeof at === 'number' && val){
            cb.getRange(start+processed+at, tgtCol, 1, 1).setValues([[val]]);
            filled++;
          }
        }
        SpreadsheetApp.flush();
        try{
          for (var v=0; v<sizeM; v++){
            var at2 = idxs[ chunkStarts[m] + v ];
            if (typeof at2==='number'){
              var got = cb.getRange(start+processed+at2, tgtCol, 1, 1).getValue();
              if (String(got||'').trim()) verified++;
            }
          }
        }catch(e){}
      }
      Utilities.sleep(BULK_SLEEP_MS);
      if (new Date().getTime() - startTs > TIME_BUDGET) break;
    }
    processed += size;
    if (new Date().getTime() - startTs > TIME_BUDGET) break;
  }
  SpreadsheetApp.getUi().alert('✅ 補翻譯完成：寫入 '+filled+' 個 '+target+'（僅補空白）。非空驗證 '+verified+'；fallback '+fallbackCalls+'；仍空白 '+remainEmpty+'。');
}
// ⑦d：對 content_bank 選區，從 zh-TW JSON 讀原文，依表頭語言逐一翻譯並填入（選區內一律覆蓋；選區外只填空白）
function contentBankFillMultiLangStructured(){
  ensureSheetsExist_(); ensureApiKey_();
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  var sel = cb.getActiveRange(); if (!sel){ SpreadsheetApp.getUi().alert('請先選取 content_bank 的行區段'); return; }
  var start = sel.getRow(), rows = sel.getNumRows(); if (start===1){ SpreadsheetApp.getUi().alert('不要包含表頭'); return; }
  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var zhCol = findColumnIndex_(headers, 'zh-TW'); if (zhCol<0){ SpreadsheetApp.getUi().alert('缺少 zh-TW 欄'); return; }

  // 解析 zh-TW JSON 作為源
  var srcVals = cb.getRange(start, zhCol+1, rows, 1).getValues();
  var packs = [];
  for (var i=0;i<rows;i++){
    var obj = {}; try { obj = JSON.parse(String(srcVals[i][0]||'{}')); } catch(e) { obj = {}; }
    packs.push({ q:String(obj.q||''), c:String(obj.c||''), a:String(obj.a||''), e:String(obj.e||''), s:String(obj.s||'') });
  }

  // 逐語言處理
  for (var col=0; col<headers.length; col++){
    var lang = String(headers[col]||'');
    if (!lang || lang==='id' || lang==='type' || lang==='grade_min' || lang==='grade_max' || lang==='tags') continue;
    if (lang==='zh-TW') continue;
    var range = cb.getRange(start, col+1, rows, 1);
    var existing = range.getValues();
    // 若在選區內，一律覆蓋；否則僅填空白（本函式僅處理選區）
    var translated = callOpenAI_LocalizeBatch_(packs, 'zh-TW', lang);
    var out = [];
    for (var r=0;r<rows;r++){
      out.push([ JSON.stringify(translated[r]||{q:'',c:'',a:'',e:'',s:''}) ]);
    }
    range.setValues(out);
  }
  SpreadsheetApp.getUi().alert('✅ 多語言填充完成（選區 '+rows+' 行，結構化 JSON 已覆蓋）。');
}
// *********** TypeSprout · IB PYP 小学题库一体化（整合 GAS Web API 版） ***********
/**
 * 端點：
 *  GET  /exec?type=content&lang=zh-TW&grade=3&limit=200&after=<id>
 *  GET  /exec?type=ui&lang=zh-TW
 *  POST /exec  {action:"localize", token:"<ADMIN_TOKEN>", source:"zh-TW", target:"en-US", rows:[{text:"..."}]}
 * 說明：
 *  - content 來源：試算表分頁「content_bank」，欄位含 id/type/grade_min/grade_max/tags + 多語
 *  - ui 來源：分頁「ui_strings」，欄位 key + 多語
 *  - localize 使用 OPENAI_API_KEY，且僅當 body.token == ScriptProperties.ADMIN_TOKEN 時允許
 * 其餘：完整保留你原有的 UI/Index/QuestionBank 建表、出題、在地化、去重與 JSON 容錯流程
 ***************************************************************************/
var OPENAI_MODEL = (PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4o-mini');
var OPENAI_MODEL_FALLBACK = (PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL_FALLBACK') || 'gpt-4o-mini');
var JSON_RESPONSE_FORMAT = { type: 'json_object' };

function buildPayload_(messages, temperature, maxTokens){
  // 仍保留給老呼叫方，但不再設置 token 參數（轉由 tryChatOnce_ 決定欄位名）
  var p = { model: OPENAI_MODEL, messages: messages, temperature: temperature };
  if (supportsJsonResponseFormat_()) p.response_format = JSON_RESPONSE_FORMAT;
  return p;
}

function supportsJsonResponseFormat_(){
  // 已知家族支援：gpt-4o*, gpt-4.1*
  return /gpt-4o|gpt-4\.1/i.test(OPENAI_MODEL);
}

function usesMaxCompletionTokens_(model){
  // o4/o3/gpt-5 系列採用 max_completion_tokens
  return /(\bo4|\bo3|gpt-5)/i.test(model);
}

function supportsTemperature_(model){
  // o4/o3/gpt-5 系列不接受 temperature 參數（僅預設 1；顯式傳送會 400）
  return !(/(\bo4|\bo3|gpt-5)/i.test(model));
}

function tryChatOnce_(model, messages, temperature, maxTokens){
  var payload = { model: model, messages: messages };
  if (supportsTemperature_(model)) payload.temperature = temperature;
  if (usesMaxCompletionTokens_(model)) payload.max_completion_tokens = maxTokens; else payload.max_tokens = maxTokens;
  if (/gpt-4o|gpt-4\.1/i.test(model)) payload.response_format = JSON_RESPONSE_FORMAT;
  var headers = {'Authorization':'Bearer '+getApiKey_(),'Content-Type':'application/json'};
  var res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions',{method:'post',headers:headers,payload:JSON.stringify(payload),muteHttpExceptions:true});
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code>=200 && code<300){
    var data = JSON.parse(text);
    return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }
  Logger.log('OpenAI '+model+' HTTP code='+code+' body(snippet)='+(text||'').slice(0,200));
  return '';
}

function chatContentWithFallback_(messages, temperature, maxTokens){
  // 第一階段：主模型多次嘗試
  for (var t=0; t<MAX_RETRY; t++){
    try{
      var content = tryChatOnce_(OPENAI_MODEL, messages, temperature, maxTokens);
      if (content && String(content).trim()) return { content: content, model: OPENAI_MODEL };
    } catch(e){ Logger.log('primary model error '+e); }
    Utilities.sleep(500*(t+1));
  }
  // 第二階段：後備模型
  for (var t2=0; t2<MAX_RETRY; t2++){
    try{
      var content2 = tryChatOnce_(OPENAI_MODEL_FALLBACK, messages, temperature, maxTokens);
      if (content2 && String(content2).trim()) return { content: content2, model: OPENAI_MODEL_FALLBACK };
    } catch(e2){ Logger.log('fallback model error '+e2); }
    Utilities.sleep(500*(t2+1));
  }
  return { content: '', model: OPENAI_MODEL };
}

/* 分页名称 */
var SHEET_UI       = 'ui';
var SHEET_QB       = 'QuestionBank';
var SHEET_CONTENT  = 'content_bank';
var SHEET_UISTR    = 'ui_strings';
var SHEET_INDEX    = 'index';

/* 默认设置（会写入 ui!A2:G2，可在 ui 内改） */
var CFG_SUBJECT    = 'Math';
var CFG_SKILL      = 'Number Sense';
var CFG_GRADE      = 3;                 // 1..6
var CFG_DIFFICULTY = 'medium';          // easy/medium/hard
var CFG_COUNT      = 100;
var CHUNK_SIZE     = 25;                // 单批建议 20~30
var BULK_SLEEP_MS  = 600;               // 每批间隔
var MAX_RETRY      = 3;

/* QuestionBank 表头（僅 unit_id + 基本欄位；不新增額外欄位） */
var QB_HEADERS = ['unit_id','Grade','Subject','Skill','Difficulty','Language','Text'];

/* IB-PYP 学科/主轴/技能（简化并覆盖核心） */
var IB = {
  math: {
    subject: 'Math',
    strands: [
      {strand:'Number',    skills:['Number Sense','Addition','Subtraction','Multiplication','Division','Fractions','Decimals']},
      {strand:'Pattern & Function', skills:['Patterns','Functions Intro','Number Patterns']},
      {strand:'Measurement', skills:['Length & Time','Mass & Volume','Temperature']},
      {strand:'Shape & Space', skills:['2D Shapes','3D Shapes','Position & Direction','Angles & Area']},
      {strand:'Data Handling', skills:['Charts & Tables','Probability Intro']}
    ]
  },
  language: {
    subject: 'Language',
    strands: [
      {strand:'Reading',   skills:['Main Idea','Details','Sequence','Inference','Vocabulary']},
      {strand:'Writing',   skills:['Narrative Writing','Opinion Writing','Informational Writing']},
      {strand:'Listening & Speaking', skills:['Comprehension','Expression']},
      {strand:'Viewing & Presenting', skills:['Visual Literacy','Posters & Graphs']}
    ]
  },
  science: {
    subject: 'Science',
    strands: [
      {strand:'Living Things',    skills:['Plants','Animals','Life Cycles','Adaptations']},
      {strand:'Earth & Space',    skills:['Weather & Climate','Earth Materials','Space Objects']},
      {strand:'Materials & Matter', skills:['States of Matter','Mixtures & Solutions']},
      {strand:'Forces & Energy',  skills:['Motion & Force','Light & Sound','Electricity Intro']}
    ]
  },
  social: {
    subject: 'Social Studies',
    strands: [
      {strand:'Human Systems & Economic Activities', skills:['Needs & Wants','Trade & Money']},
      {strand:'Social Organization & Culture',       skills:['Communities','Culture']},
      {strand:'Continuity & Change through Time',    skills:['Timelines','History Stories']},
      {strand:'Human & Natural Environments',        skills:['Maps & Landforms','Weather & People']},
      {strand:'Resources & the Environment',         skills:['Conservation','Sustainability Intro']}
    ]
  },
  arts: {
    subject: 'Arts',
    strands: [
      {strand:'Visual Arts', skills:['Elements of Art','Color & Shape']},
      {strand:'Music',       skills:['Rhythm & Melody']},
      {strand:'Drama',       skills:['Role Play','Storytelling']}
    ]
  },
  pspe: {
    subject: 'PSPE',
    strands: [
      {strand:'Active Living', skills:['Fitness Basics','Games & Rules']},
      {strand:'Identity',      skills:['Feelings & Strengths']},
      {strand:'Interactions',  skills:['Teamwork','Friendship']}
    ]
  }
};

/* IB 核心概念（循环填入 index） */
var IB_CONCEPTS = ['Form','Function','Causation','Change','Connection','Perspective','Responsibility'];

/* =================== 公用：JSON/CORS =================== */
function json_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* =================== Web API =================== */
function doGet(e){
  var p = e && e.parameter || {};
  var t = (p.type||'').toLowerCase();
  if (t === 'content') return apiContent_(p);
  if (t === 'ui')      return apiUI_(p);
  return json_({ error:'bad_type', hint:'type=content|ui' });
}

/* content_bank -> JSON {items:[{id,lang,type,grade_min,grade_max,tags,text}], next?} */
function apiContent_(p){
  var lang = String(p.lang||'en-US');
  var grade = p.grade ? Number(p.grade) : null;
  var kind  = (p.kind||p.type2||p.ct||'').toLowerCase();
  var limit = Math.min(500, Math.max(1, Number(p.limit||200)));
  var after = String(p.after||'');

  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh) return json_({ items:[] });

  var headers = sh.getRange(1,1,1, sh.getLastColumn()).getValues()[0];
  var col = {}; for (var i=0;i<headers.length;i++) col[headers[i]]=i+1;
  var langCol = col[lang] || col['en-US'] || col['zh-TW'];

  var last = sh.getLastRow(); if (last<2) return json_({ items:[] });
  var rows = sh.getRange(2,1,last-1, sh.getLastColumn()).getValues();

  var out=[], passed = (after==='');
  for (var r=0; r<rows.length && out.length<limit; r++){
    var row = rows[r];
    var id = String(row[col['id']-1]||'');
    if (!passed){ if (id===after) passed=true; continue; }

    var gm = Number(row[col['grade_min']-1]||1);
    var gx = Number(row[col['grade_max']-1]||6);
    var tp = String(row[col['type']-1]||'');
    if (grade && (gm>grade || gx<grade)) continue;
    if (kind && tp.toLowerCase()!==kind) continue;

    out.push({
      id: id,
      lang: lang,
      type: tp,
      grade_min: gm,
      grade_max: gx,
      tags: String(row[col['tags']-1]||''),
      text: String(row[langCol-1]||'')
    });
  }
  var next = (out.length===limit && out.length) ? out[out.length-1].id : null;
  return json_({ items: out, next: next });
}

/* ui_strings -> JSON {items:[{key,value}], lang} */
function apiUI_(p){
  var lang = String(p.lang||'en-US');
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_UISTR);
  if (!sh) return json_({ items:[], lang:lang });

  var headers = sh.getRange(1,1,1, sh.getLastColumn()).getValues()[0];
  var col = {}; for (var i=0;i<headers.length;i++) col[headers[i]]=i+1;
  var langCol = col[lang] || col['en-US'] || col['zh-TW'];

  var last = sh.getLastRow(); if (last<2) return json_({ items:[], lang:lang });
  var rows = sh.getRange(2,1,last-1, sh.getLastColumn()).getValues();

  var items=[], i;
  for (i=0;i<rows.length;i++){
    var key = String(rows[i][0]||'').trim();
    if (!key) continue;
    items.push({ key:key, value:String(rows[i][langCol-1]||'') });
  }
  return json_({ items:items, lang:lang });
}

/* admin: 本地化翻譯（需 ADMIN_TOKEN） */
function doPost(e){
  var body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  var token = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!body || body.token !== token) return json_({ error:'unauthorized' });

  if (body.action === 'localize'){
    var out = callOpenAI_LocalizeBatch_(body.rows||[], String(body.source||'zh-TW'), String(body.target||'en-US'));
    return json_({ ok:true, translations: out });
  }
  return json_({ ok:false, error:'bad_action' });
}

/* =================== 菜单 =================== */
function safeGetUi_(){
  try { return SpreadsheetApp.getUi(); } catch (e){ return null; }
}

function onOpen() {
  var uiSvc = safeGetUi_();
  if (!uiSvc){ Logger.log('onOpen skipped: no UI context'); return; }
  var ui = uiSvc.createMenu('TypeSprout')
    .addItem('① 建立/重置所有分页', 'buildAllSheets')
    .addItem('② 從選中行生成至表尾（每10筆保存，英→繁本地化）', 'generateByIndexFromCursorToEnd')
    .addItem('②-A 選區追加 N 筆（忽略 count）', 'appendByIndexSelectionAddN')
    .addItem('③ 一鍵同步：QuestionBank → content_bank（按順序，多語翻譯）', 'syncQuestionBankToContentBankAll')
    .addItem('③c zh-TW → 目標語言（批次翻譯）', 'translateContentBankZhTwToTarget')
    .addItem('③d 補翻譯：掃描空白目標並補齊', 'translateContentBankFillMissingTarget')
    .addItem('③b 偵錯：寫入一列到 content_bank', 'debugContentBankWrite1')
    .addItem('⑦ 導出：content_bank → JSON（分頁）', 'exportContentBankToJsonPrompt')
    .addItem('④e 擴充 content_bank 欄位（audience/category/…）', 'expandContentBankReservedColumns')
    .addItem('④f 還原 content_bank 標準 5 欄', 'revertContentBankToBaseColumns')
    .addSeparator()
    .addItem('⑧ 檢查：非 zh 欄含中文 → 高亮', 'scanContentBankNonZhForChinese')
    .addItem('⑧a 清除檢查高亮（語言欄）', 'scanContentBankClearHighlights')
    .addItem('④ 去重 QuestionBank（unit_id+Text）', 'dedupeQuestionBank')
    .addItem('④b 全局去重（僅 Text 規範化）', 'fastDedupeQuestionBankByText')
    .addItem('④c 補齊 content_bank 唯一 ID', 'fillContentBankMissingIds')
    .addItem('④d 生成/修復 qb_id 與重新命名 unit_id', 'fixQbIdsAndRenameUnitIds')
    .addItem('⑤ 智能去重（相似合併）', 'smartDedupePrompt')
    .addItem('⑥ 清潔：移除含括號/標籤的行（QuestionBank）', 'cleanQuestionBankRemoveBracketsAndTags')
    .addItem('⑨a 生成索引（A–Z×10，英語，count=100）', 'buildAlphabetIndexEN260')
    .addItem('⑨b 重新編號 unit_id（依年級）', 'renumberIndexUnitIdsByGrade');
  ui.addToUi();
  // 也掛上 Bible 菜單
  try { if (typeof onOpen_BibleMenu === 'function') onOpen_BibleMenu(); } catch(e){ Logger.log('call onOpen_BibleMenu failed: '+e); }
}

function onOpen_old() {
  var ui = SpreadsheetApp.getUi().createMenu('TypeSprout')
    .addItem('① 建立/重置所有分页', 'buildAllSheets')
    .addItem('⑨a 生成索引（A–Z×10，英語，count=100）', 'buildAlphabetIndexEN260')
    .addItem('② 從選中行生成至表尾（每10筆保存，英→繁本地化）', 'generateByIndexFromCursorToEnd')
    .addItem('③ 一鍵同步：QuestionBank → content_bank（按順序，多語翻譯）', 'syncQuestionBankToContentBankAll')
    .addItem('④ 去重 QuestionBank（unit_id+Text）', 'dedupeQuestionBank')
    .addItem('⑤ 智能去重（相似合併）', 'smartDedupePrompt');
  ui.addToUi();
}

function ibpypBuildIndexAZEnglish(){
  buildAlphabetIndexEN260();
}

/* =================== 建表 / 重置 =================== */
function buildAllSheets(){
  ensureUiSheet_();
  ensureQuestionBank_();
  ensureContentBank_();
  ensureIndex_();
  SpreadsheetApp.getUi().alert('✅ 已建立/重置：ui / QuestionBank / content_bank / index');
}

function ensureUiSheet_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_UI); if (!sh) sh = ss.insertSheet(SHEET_UI);
  sh.clear();
  var headers = ['subject','skill','grade','difficulty','count','target_locale','chunk_size'];
  var data    = [[CFG_SUBJECT, CFG_SKILL, CFG_GRADE, CFG_DIFFICULTY, CFG_COUNT, 'en-US', CHUNK_SIZE]];
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  sh.getRange(2,1,1,data[0].length).setValues(data);

  var subjects = ['Math','Language','Science','Social Studies','Arts','PSPE'];
  sh.getRange('A2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(subjects, true).build());
  sh.getRange('C2').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1,6).build());
  sh.getRange('D2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['easy','medium','hard'], true).build());
  var locales = ['ALL','en-US','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU',
                 'ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY',
                 'hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR','zh-CN'];
  sh.getRange('F2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(locales, true).build());
  sh.getRange('G2').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(5,50).build());
  sh.setFrozenRows(1);
}

function ensureQuestionBank_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_QB);
  if (!sh) sh = ss.insertSheet(SHEET_QB);

  var needRebuild = (sh.getLastRow()<1) || (sh.getRange(1,1,1,1).getValue() !== 'unit_id');
  if (needRebuild){
    sh.clear();
    sh.getRange(1,1,1,QB_HEADERS.length).setValues([QB_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var c; for (c=1;c<=QB_HEADERS.length;c++) sh.autoResizeColumn(c);
  }
}

function ensureContentBank_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh) sh = ss.insertSheet(SHEET_CONTENT);
  sh.clear();
  // 回復為原來的 5 欄 + 語言（其餘作為可選的擴充，不強制）
  var headers = ['id','type','grade_min','grade_max','tags',
                 'zh-TW','en-US','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU',
                 'ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY',
                 'hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR','zh-CN'];
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  sh.setFrozenRows(1);
  var c; for (c=1;c<=headers.length;c++) sh.autoResizeColumn(c);
}

// 就地擴充現有 content_bank 表頭，插入預留欄位（不清空資料）
function expandContentBankReservedColumns(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1){ SpreadsheetApp.getUi().alert('content_bank 表頭為空'); return; }

  var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  var map = {}; for (var i=0;i<headers.length;i++){ map[String(headers[i]).trim()] = i+1; }
  var gmaxCol = map['grade_max'] || 0; var tagsCol = map['tags'] || 0;
  if (!gmaxCol){ SpreadsheetApp.getUi().alert('找不到 grade_max 欄，無法就地插入預留欄位'); return; }

  var reserves = ['audience','category','canonical_lang','series_id','source','license','rev_ts'];
  var inserted = [];
  var offset = 0;
  for (var r=0; r<reserves.length; r++){
    var name = reserves[r];
    if (map[name]) continue; // 已存在則略過
    sh.insertColumnAfter(gmaxCol + offset);
    var colIdx = gmaxCol + offset + 1;
    sh.getRange(1, colIdx, 1, 1).setValue(name).setFontWeight('bold');
    inserted.push({ name:name, col:colIdx });
    offset++;
  }
  if (!inserted.length){ SpreadsheetApp.getUi().alert('✅ 已有預留欄位，無需變更'); return; }

  // 設定預設值（僅對資料列；不覆蓋已有值）
  var rows = Math.max(0, lastRow - 1);
  if (rows > 0){
    for (var j=0; j<inserted.length; j++){
      var ins = inserted[j];
      var defaultVal = '';
      if (ins.name==='audience') defaultVal = 'kids';
      if (ins.name==='category') defaultVal = 'typing';
      if (ins.name==='canonical_lang') defaultVal = 'zh-TW';
      if (ins.name==='rev_ts') defaultVal = new Date().toISOString();
      var rng = sh.getRange(2, ins.col, rows, 1);
      var vals = rng.getValues();
      var dirty = false;
      for (var rr=0; rr<vals.length; rr++){
        if (!String(vals[rr][0]||'').trim() && defaultVal){ vals[rr][0] = defaultVal; dirty = true; }
      }
      if (dirty) rng.setValues(vals);
    }
  }
  SpreadsheetApp.getUi().alert('✅ 已插入預留欄位：'+inserted.map(function(x){return x.name}).join(', '));
}

// 還原成標準 5 欄（id/type/grade_min/grade_max/tags） + 語言欄
function revertContentBankToBaseColumns(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }

  function nowStr(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'); }

  // 讀取原資料，先備份
  var lastRow = sh.getLastRow(); var lastCol = sh.getLastColumn();
  if (lastRow >= 1 && lastCol >= 1){
    var all = sh.getRange(1,1,lastRow,lastCol).getValues();
    try{
      var bak = ss.insertSheet('content_bank_backup-'+nowStr());
      bak.getRange(1,1,lastRow,lastCol).setValues(all); bak.setFrozenRows(1);
    } catch(e){}
  }

  var targetHeaders = ['id','type','grade_min','grade_max','tags',
    'zh-TW','en-US','es-MX','pt-BR','ja-JP','ko-KR','fr-FR','de-DE','it-IT','id-ID','vi-VN','th-TH','ru-RU',
    'ar-SA','fil-PH','nl-NL','pl-PL','sv-SE','nb-NO','da-DK','fi-FI','ro-RO','el-GR','cs-CZ','hu-HU','uk-UA','ms-MY',
    'hi-IN','bn-BD','he-IL','fa-IR','ur-PK','tr-TR','zh-CN'];

  // 列映射
  var outRows = [];
  if (lastRow > 1){
    var oldHeaders = sh.getRange(1,1,1,lastCol).getValues()[0];
    var idxOld = {}; for (var i=0;i<oldHeaders.length;i++) idxOld[String(oldHeaders[i]).trim()] = i+1;
    var idxNew = {}; for (var j=0;j<targetHeaders.length;j++) idxNew[targetHeaders[j]] = j+1;
    var data = sh.getRange(2,1,lastRow-1,lastCol).getValues();
    for (var r=0;r<data.length;r++){
      var row = data[r];
      var out = new Array(targetHeaders.length).fill('');
      function copyField(name){ if(idxOld[name]) out[idxNew[name]-1] = row[idxOld[name]-1]; }
      copyField('id'); copyField('type'); copyField('grade_min'); copyField('grade_max'); copyField('tags');
      for (var k=5; k<targetHeaders.length; k++){
        var lang = targetHeaders[k]; if (idxOld[lang]) out[idxNew[lang]-1] = row[idxOld[lang]-1];
      }
      outRows.push(out);
    }
  }

  // 覆寫為標準欄位並寫回資料
  sh.clear();
  sh.getRange(1,1,1,targetHeaders.length).setValues([targetHeaders]).setFontWeight('bold');
  if (outRows.length) sh.getRange(2,1,outRows.length,targetHeaders.length).setValues(outRows);
  sh.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('✅ 已還原為標準欄位，且在同活頁簿建立備份分頁（content_bank_backup-日期）。原資料已保留於備份分頁。');
}

// 掃描 content_bank：所有非 zh-* 語言欄，若與 zh 文字的『前兩個可見字元』相同 → 高亮
function scanContentBankNonZhForChinese(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }
  var lastRow = sh.getLastRow(); var lastCol = sh.getLastColumn();
  if (lastRow<2 || lastCol<1){ SpreadsheetApp.getUi().alert('content_bank 無資料'); return; }

  var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  var langCols = [];
  for (var c=1;c<=lastCol;c++){
    var name = String(headers[c-1]||'').trim();
    if (!name || name==='id' || name==='type' || name==='grade_min' || name==='grade_max' || name==='tags') continue;
    if (/^zh(?:-|$)/i.test(name)) continue; // 跳過 zh 欄
    langCols.push({ col:c, name:name });
  }
  if (!langCols.length){ SpreadsheetApp.getUi().alert('找不到非 zh 的語言欄'); return; }

  // 基準：優先 zh-TW，否則 zh-CN
  var baseCol = -1;
  for (var i0=1;i0<=lastCol;i0++){ var nm = String(headers[i0-1]||'').trim(); if (nm==='zh-TW'){ baseCol=i0; break; } }
  if (baseCol<0){
    for (var j0=1;j0<=lastCol;j0++){ var nm2 = String(headers[j0-1]||'').trim(); if (nm2==='zh-CN'){ baseCol=j0; break; } }
  }
  if (baseCol<0){ SpreadsheetApp.getUi().alert('找不到 zh-TW/zh-CN 參考欄，無法比較'); return; }

  var rows = lastRow-1;
  var hits = 0;
  var color = '#fde2e2';

  // 取 zh 基準前兩個可見字元
  var baseVals = sh.getRange(2, baseCol, rows, 1).getValues();
  var basePref = new Array(rows);
  for (var r0=0;r0<rows;r0++){
    basePref[r0] = firstTwoVisibleChars_(String(baseVals[r0][0]||''));
  }

  // 批次處理每個語言欄：一次讀值、一次寫背景
  for (var i=0;i<langCols.length;i++){
    var col = langCols[i].col;
    var values = sh.getRange(2, col, rows, 1).getValues();
    var bg = sh.getRange(2, col, rows, 1).getBackgrounds(); // 讀現有背景，避免覆蓋其他人工標記
    for (var r=0;r<rows;r++){
      var v = String(values[r][0]||'');
      var pref = firstTwoVisibleChars_(v);
      if (pref && pref === basePref[r]){ if (bg[r][0] !== color){ bg[r][0] = color; } hits++; }
    }
    sh.getRange(2, col, rows, 1).setBackgrounds(bg);
  }
  SpreadsheetApp.getUi().alert('檢查完成：高亮 '+hits+' 個可疑單元格（非 zh 欄與 zh 的前兩字相同）。');
}

function scanContentBankClearHighlights(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_CONTENT);
  if (!sh){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }
  var lastRow = sh.getLastRow(); var lastCol = sh.getLastColumn();
  if (lastRow<2 || lastCol<1){ SpreadsheetApp.getUi().alert('content_bank 無資料'); return; }
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  // 找到語言欄連續區段的起點（第一個非 meta 欄）
  var firstLangCol = -1;
  for (var c=1;c<=lastCol;c++){
    var name = String(headers[c-1]||'').trim();
    if (!name) continue;
    if (name==='id' || name==='type' || name==='grade_min' || name==='grade_max' || name==='tags') continue;
    firstLangCol = c; break;
  }
  if (firstLangCol<0){ SpreadsheetApp.getUi().alert('找不到語言欄'); return; }
  var rows = lastRow-1;
  var cols = lastCol - firstLangCol + 1;
  // 一次性清空語言欄整塊背景（最快）
  sh.getRange(2, firstLangCol, rows, cols).setBackground(null);
  SpreadsheetApp.getUi().alert('已清除語言欄區塊的背景顏色（包含先前的高亮）。');
}

// 取前兩個可見字元（去掉空白與標點邊界，僅快速比對，不做語義）
function firstTwoVisibleChars_(s){
  var t = String(s||'').replace(/^[\s\u00A0\p{P}\p{S}]+/gu,'');
  // 直接取前兩個 code unit（大多數 CJK 符合）；如不足兩個則原樣
  return t.slice(0,2);
}

function ensureIndex_(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_INDEX);
  if (!sh) sh = ss.insertSheet(SHEET_INDEX);
  if (sh.getLastRow()<1){
    var headers = ['unit_id','subject','strand','skill','ib_concept','grade_min','grade_max','difficulty_curve','context_guidelines','style_notes','count','seed','status','last_run','tags'];
    sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function rebuildUiStrings(){
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_UISTR); if (!sh) sh = ss.insertSheet(SHEET_UISTR);
  sh.clear();
  var headers = ['key','zh-TW','en-US'];
  var rows = [
    ['menu.build','建立/重置所有分页','Build / Reset Sheets'],
    ['menu.overwrite','生成→覆盖（按选区）','Generate → Overwrite (Selection)'],
    ['menu.fillonly','生成→只填补空白（按选区）','Generate → Fill-only (Selection)'],
    ['menu.bulk','大量生成（按 ui 设置）','Bulk Generate (UI)'],
    ['menu.diagnose','诊断 / 自检','Diagnose'],
    ['menu.sample','样例填充（离线）','Sample Fill (Offline)'],
    ['menu.localize','选区在地化翻译→content_bank','Localize Selection → content_bank']
  ];
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  sh.setFrozenRows(1);
}

/* =================== 读 ui =================== */
function readUi_(){
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_UI);
  if (!sh) throw new Error('找不到 ui 分页，请先执行 ① 建立/重置所有分页');
  var v = sh.getRange(2,1,1,7).getValues()[0];
  return {
    subject: String(v[0]||CFG_SUBJECT),
    skill: String(v[1]||CFG_SKILL),
    grade: Math.max(1, Math.min(6, Number(v[2]||CFG_GRADE))),
    difficulty: String(v[3]||CFG_DIFFICULTY).toLowerCase(),
    count: Math.max(1, Math.min(1000, Number(v[4]||CFG_COUNT))),
    targetLocale: String(v[5]||'en-US'),
    chunkSize: Math.max(5, Math.min(50, Number(v[6]||CHUNK_SIZE)))
  };
}

/* =================== 选区生成（覆盖/填补） =================== */
function genToSelectionOverwrite(){ genToSelectionCore_(false); }
function genToSelectionFillOnly(){ genToSelectionCore_(true); }
function genToSelectionCore_(fillOnly){
  ensureApiKey_(); ensureSheetsExist_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var sel = qb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 QuestionBank 選取要寫入的行。'); return; }
  var startRow = sel.getRow(), rows = sel.getNumRows();
  if (startRow === 1) { SpreadsheetApp.getUi().alert('選區不應包含表頭列。'); return; }

  var cfg = readUi_();
  var produced = 0, rowPtr = startRow;

  while (rowPtr < startRow + rows) {
    var batch = Math.min(cfg.chunkSize, startRow + rows - rowPtr);
    var block = qb.getRange(rowPtr, 1, batch, QB_HEADERS.length).getValues();

    var need = 0, mask = [], i;
    for (i=0;i<batch;i++){
      var hasQ = String(block[i][6]||'').trim() !== '';
      mask[i] = fillOnly ? !hasQ : true;
      if (mask[i]) need++;
    }
    if (need > 0) {
      var items = generateQuestions_({ grade:cfg.grade, subject:cfg.subject, skill:cfg.skill, difficulty:cfg.difficulty, count:need });
      if (!items || !items.length){ SpreadsheetApp.getUi().alert('本批無有效返回，稍後再試。'); return; }

      var p=0, r;
      for (r=0;r<batch;r++){
        if (!mask[r]) continue;
        var it = items[p++] || {};
        block[r][1] = it.grade || cfg.grade;
        block[r][2] = it.subject || cfg.subject;
        block[r][3] = it.skill || cfg.skill;
        block[r][4] = it.difficulty || cfg.difficulty;
        block[r][5] = 'zh-TW';
        block[r][6] = it.question || '';
        block[r][7] = it.choices && it.choices.length ? it.choices.join(' | ') : '';
        block[r][8] = it.answer || '';
        block[r][9] = it.explanation || '';
        block[r][10] = it.sourceHint || '';
      }
      qb.getRange(rowPtr,1,batch,QB_HEADERS.length).setValues(block);
      produced += need;
      Utilities.sleep(BULK_SLEEP_MS);
    }
    rowPtr += batch;
  }
  SpreadsheetApp.getUi().alert('✅ 完成：已寫入/補齊 '+produced+' 題到選區。');
}

/* =================== 大量生成（到表尾） =================== */
function genBulkByTotalPrompt(){
  ensureApiKey_(); ensureSheetsExist_();
  var cfg = readUi_();
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('大量生成', '輸入總題數（例如 1000）：', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var total = parseInt(resp.getResponseText(),10);
  if (!(total>0)){ ui.alert('請輸入正整數'); return; }

  var remain = total, produced = 0;
  while (remain > 0) {
    var want = Math.min(cfg.chunkSize, remain);
    var items = generateQuestions_({ grade:cfg.grade, subject:cfg.subject, skill:cfg.skill, difficulty:cfg.difficulty, count:want });
    if (items && items.length) { appendToQB_(items); produced += items.length; remain -= items.length; }
    else { Utilities.sleep(1000); }
    Utilities.sleep(BULK_SLEEP_MS);
  }
  ui.alert('✅ 完成：共写入 '+produced+' 题。');
}

/* =================== 在地化翻译（选区→content_bank） =================== */
function localizeSelectionToContentBank(){
  ensureApiKey_(); ensureSheetsExist_();
  var cfg = readUi_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var sel = qb.getActiveRange();
  if (!sel){ SpreadsheetApp.getUi().alert('請先在 QuestionBank 選取要翻譯的行。'); return; }
  var start = sel.getRow(), rows = sel.getNumRows();
  if (start===1){ SpreadsheetApp.getUi().alert('選區不應包含表頭列。'); return; }

  var src = qb.getRange(start,1,rows,QB_HEADERS.length).getValues();
  var pack = [], i;
  for (i=0;i<src.length;i++){
    pack.push({ question:String(src[i][6]||'') });
  }
  var localized = callOpenAI_LocalizeBatch_(pack, 'zh-TW', cfg.targetLocale);

  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var zhCol  = getLangCol_(headers, 'zh-TW');
  var tgtCol = getLangCol_(headers, cfg.targetLocale);
  if (zhCol<0 || tgtCol<0){ SpreadsheetApp.getUi().alert('content_bank 缺少語言欄位：zh-TW 或 '+cfg.targetLocale); return; }

  var startRow = cb.getLastRow() + 1;
  var rowsOut = [];
  for (i=0;i<pack.length;i++){
    var row = new Array(headers.length).fill('');
    row[0] = '';
    row[1] = 'typing';
    row[2] = '1';
    row[3] = '6';
    row[4] = '';
    row[zhCol] = pack[i].question || '';
    rowsOut.push(row);
  }
  cb.getRange(startRow,1,rowsOut.length, headers.length).setValues(rowsOut);

  var tgtWrite=[];
  for (i=0;i<pack.length;i++){
    var cellVal = localized[i];
    var outText = '';
    if (cellVal && typeof cellVal==='object') outText = String(cellVal.q||'');
    else if (typeof cellVal==='string') outText = cellVal;
    if (!outText) outText = String(pack[i].question||'');
    tgtWrite.push([outText]);
  }
  cb.getRange(startRow, tgtCol+0, tgtWrite.length, 1).setValues(tgtWrite);

  SpreadsheetApp.getUi().alert('✅ 已在地化翻譯 '+pack.length+' 條到 '+SHEET_CONTENT+'（列：'+cfg.targetLocale+'）。');
}

// ⑦c：把 QuestionBank 選區轉入 content_bank，與 QB 行一一對應（同排索引），
// 並將 Question/Choices/Answer/Explanation/SourceHint 合併成 JSON 存在各語言欄位，便於一致映射與還原。
function qbSelectionToContentBankSameRows(){
  ensureSheetsExist_(); ensureApiKey_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var sel = qb.getActiveRange(); if (!sel){ SpreadsheetApp.getUi().alert('請先選取 QuestionBank 的行'); return; }
  var start = sel.getRow(), rows = sel.getNumRows(); if (start===1){ SpreadsheetApp.getUi().alert('不要包含表頭'); return; }

  var cfg = readUi_();
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var zhCol  = getLangCol_(headers, 'zh-TW');
  var tgtCol = getLangCol_(headers, cfg.targetLocale);
  if (zhCol<0 || tgtCol<0){ SpreadsheetApp.getUi().alert('content_bank 缺少語言欄位：zh-TW 或 '+cfg.targetLocale); return; }

  var data = qb.getRange(start,1,rows,QB_HEADERS.length).getValues();
  var payload = [];
  for (var i=0;i<data.length;i++){
    payload.push({ q: String(data[i][6]||'') });
  }
  var translated = callOpenAI_LocalizeBatch_(payload, 'zh-TW', cfg.targetLocale);

  var startRow = cb.getLastRow()+1;
  var out = [];
  for (var j=0;j<rows;j++){
    var row = new Array(headers.length).fill('');
    row[0]=''; row[1]='typing'; row[2]='1'; row[3]='6'; row[4]='';
    row[zhCol] = JSON.stringify({ q: payload[j].q });
    row[tgtCol] = translated[j] || '';
    // build tags from Subject/Skill/Difficulty + unit_id (and qb_id if存在)
    var subj = String(data[j][2]||'');
    var skl  = String(data[j][3]||'');
    var dif  = String(data[j][4]||'');
    var uid  = String(data[j][0]||'');
    var pieces = [];
    if (uid) pieces.push('unit:'+uid);
    if (subj) pieces.push('subj:'+subj);
    if (skl)  pieces.push('skill:'+skl);
    if (dif)  pieces.push('diff:'+dif);
    // 如果 QuestionBank 有 qb_id 欄位，讀出來
    try{
      var qbHeaders = SpreadsheetApp.getActive().getSheetByName(SHEET_QB).getRange(1,1,1,SpreadsheetApp.getActive().getSheetByName(SHEET_QB).getLastColumn()).getValues()[0];
      var qbCol = {}; for (var h=0;h<qbHeaders.length;h++){ qbCol[String(qbHeaders[h]).trim().toLowerCase()] = h+1; }
      var qbIdIdx = qbCol['qb_id'] || null;
      if (qbIdIdx){
        var qbId = SpreadsheetApp.getActive().getSheetByName(SHEET_QB).getRange(start+j, qbIdIdx, 1, 1).getValue();
        if (String(qbId||'').trim()) pieces.unshift('qb_id:'+qbId);
      }
    } catch(e){}
    if (row[4]!==undefined) row[4] = pieces.join(';');
    out.push(row);
  }
  cb.getRange(startRow,1,out.length,headers.length).setValues(out);
  SpreadsheetApp.getUi().alert('✅ 已寫入 '+rows+' 行到 content_bank（'+cfg.targetLocale+'）。');
}

// ⑩e：在 QuestionBank 中按「每 9 行為一單位」映射到 index 第 N 行，
// 例如選取 19~27 則使用 index 的第 3 行；自動生題並覆蓋選區起點。
function qbGenerateFromIndexByBlockOverwrite(){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  var qb  = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var qbSel = qb.getActiveRange(); if (!qbSel){ SpreadsheetApp.getUi().alert('請在 QuestionBank 選取要覆蓋的行區段'); return; }
  var qbStart = qbSel.getRow(), qbRows = qbSel.getNumRows(); if (qbStart===1){ SpreadsheetApp.getUi().alert('不要包含表頭'); return; }

  var blockIndex = Math.floor((qbStart-2)/9) + 1; // 1-based
  var idxRow = 1 + blockIndex; // index 表頭佔 1 行
  var rec = idx.getRange(idxRow,1,1,15).getValues()[0];
  if (!rec){ SpreadsheetApp.getUi().alert('找不到 index 第 '+blockIndex+' 行'); return; }

  var unit = { unit_id:String(rec[0]||''), subject:String(rec[1]||'Math'), strand:String(rec[2]||''), skill:String(rec[3]||'') };
  if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);
  var grade = Math.max(1, Math.min(6, Number(rec[5]||1)));
  var difficulty = 'medium';
  var blockSize = Math.max(1, Math.min(50, Number(SpreadsheetApp.getActive().getSheetByName(SHEET_UI).getRange(2,7).getValue()||CHUNK_SIZE)));
  var count = Math.max(1, Math.min(200, Number(rec[10]||blockSize)));
  // 依 index 的 difficulty_curve 自動平均分配
  var curve = String(rec[7]||'easy>medium>hard');
  var parts = curve.indexOf('>')>-1 ? curve.split('>') : [curve];
  var per = Math.max(1, Math.floor(count/parts.length));
  var items = [];
  for (var di=0; di<parts.length; di++){
    var d = String(parts[di]||'medium').toLowerCase();
    var seg = generateQuestionsByUnit_(unit, grade, d, per);
    if (seg && seg.length) items = items.concat(seg);
  }
  if (!items || !items.length){ SpreadsheetApp.getUi().alert('⚠️ 未返回題目'); return; }
  writeUnitItemsFromRow_(qb, qbStart, unit.unit_id, items);
  SpreadsheetApp.getUi().alert('✅ 已覆蓋 '+items.length+' 題（QB 起點 '+qbStart+'，對應 index 第 '+blockIndex+' 行）。');
}

/* =================== IB 全索引：一键生成 =================== */
function ibpypBuildFullIndex(){
  ensureIndex_();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_INDEX);

  var headers = ['unit_id','subject','strand','skill','ib_concept','grade_min','grade_max','difficulty_curve','context_guidelines','style_notes','count','seed','status','last_run','tags'];
  if (sh.getLastRow()<1) sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');

  if (sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1, sh.getLastColumn()).clearContent();

  var rows = [];
  var curve = 'easy>medium>hard';
  var defaultCount = 100;
  
  function addUnit(subject, strand, skill, g, idxConcept){
    var uid = subject.toUpperCase()+'-G'+g+'-'+(strand||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(skill||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(new Date().getTime().toString().slice(-4));
    var seed = 'ibpyp-'+subject.toLowerCase().replace(/\s+/g,'-')+'-g'+g+'-'+(skill||'').replace(/\s+/g,'-').toLowerCase().slice(0,6);
    var style = '片段≤對應年級上限；活潑/清楚/精煉（隨年級）；保留佔位符；用公制（非美制）';
    var ctx = '';
    if (subject==='Math') ctx = '校園/家庭購物/時間安排等貼近日常場景，避免超年級內容';
    if (subject==='Language') ctx = '日常短語與文本，避免艱深專有名詞';
    if (subject==='Science') ctx = '可觀察現象（天氣、廚房、動植物），不涉及危險實驗';
    if (subject==='Social Studies') ctx = '社群、地圖、文化與資源等熟悉例子';
    if (subject==='Arts') ctx = '視覺/音樂/戲劇的基礎要素與表達';
    if (subject==='PSPE') ctx = '運動安全、規則、情緒與合作的情境';

    rows.push([
      uid, subject, strand, skill, IB_CONCEPTS[idxConcept % IB_CONCEPTS.length],
      g, g, curve, ctx, style, defaultCount, seed, '', '', 'ib-auto'
    ]);
  }
  
  var s, subj, i, j, g;
  var subjects = [IB.math, IB.language, IB.science, IB.social, IB.arts, IB.pspe];
  var conceptIdx = 0;

  for (s=0; s<subjects.length; s++){
    subj = subjects[s];
    for (i=0; i<subj.strands.length; i++){
      var strand = subj.strands[i];
      for (j=0; j<strand.skills.length; j++){
        var skill = strand.skills[j];
        for (g=1; g<=6; g++){
          addUnit(subj.subject, strand.strand, skill, g, conceptIdx++);
        }
      }
    }
  }

  if (rows.length){
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  }
  SpreadsheetApp.getUi().alert('✅ 已生成 IB-PYP 全索引，共 '+rows.length+' 行。選中若干行後執行「⑩ 按 index 选区生成内容」。');
}

/* =================== 按 index 选区生成题目 =================== */
function generateByIndexSelection(){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的數據行（不要包含表頭）。'); return; }

  var cfgUi = readUi_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var start = sel.getRow(), rows = sel.getNumRows();
  var producedTotal = 0;

  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Math'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      ib:      String(rec[4]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count))),
      seed:    String(rec[11]||'')
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var targetTotal = unit.count;
    var made = 0;
    while (made < targetTotal){
      var remaining = targetTotal - made;
      var perBatch = Math.min(100, remaining); // 單次模型上限 100

      var grades = [], gi; for (gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));

      var produced = 0, di;
      for (gi=0; gi<grades.length; gi++){
        for (di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = perDiffCount;
          var items = generateQuestionsByUnit_(unit, grades[gi], diff, want);
          items = maybeLocalizeToZhTW_(unit, items);
          if (items && items.length){
            produced += writeUnitItems_(qb, unit.unit_id, items, false);
            Utilities.sleep(BULK_SLEEP_MS);
          }
        }
      }
      if (produced === 0) break; // 無返回則中止，避免無限迴圈
      made += produced;
    }
    idx.getRange(start+r,12,1,3).setValues([[ made>=targetTotal?'done':'partial', new Date(), rec[14] ]]);
    producedTotal += made;
  }
  SpreadsheetApp.getUi().alert('✅ 完成：共寫入 '+producedTotal+' 條（按 index，自動分批至目標，並已本地化 zh-TW）。');
}

// Headless 版本：不顯示彈窗，直接依據參數決定覆蓋或填補（預設 fill）。
function generateByIndexSelectionHeadless(fillOrOverwrite){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的數據行（不要包含表頭）。'); return; }

  var cfgUi = readUi_();
  var mode = String(fillOrOverwrite||'fill').toLowerCase();
  var fillOnly = (mode !== 'overwrite');

  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var start = sel.getRow(), rows = sel.getNumRows();
  var producedTotal = 0;

  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Math'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      ib:      String(rec[4]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count))),
      seed:    String(rec[11]||'')
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var targetTotal = unit.count;
    var made = 0;
    while (made < targetTotal){
      var remaining = targetTotal - made;
      var perBatch = Math.min(100, remaining);
      var grades = [], gi; for (gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));
      var produced = 0, di;
      for (gi=0; gi<grades.length; gi++){
        for (di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = perDiffCount;
          var items = generateQuestionsByUnit_(unit, grades[gi], diff, want);
          items = maybeLocalizeToZhTW_(unit, items);
          if (items && items.length){
            produced += writeUnitItems_(qb, unit.unit_id, items, fillOnly);
            Utilities.sleep(BULK_SLEEP_MS);
          }
        }
      }
      if (produced === 0) break;
      made += produced;
    }
    idx.getRange(start+r,12,1,3).setValues([[ made>=targetTotal?'done':'partial', new Date(), rec[14] ]]);
    producedTotal += made;
  }
  SpreadsheetApp.getUi().alert('✅ 完成（headless '+(fillOnly?'fill':'overwrite')+'）：共寫入 '+producedTotal+' 條（已本地化 zh-TW）。');
}

// 直接以覆蓋模式（不彈窗）
function generateByIndexSelectionHeadlessOverwrite(){
  generateByIndexSelectionHeadless('overwrite');
}

/* =================== 核心：生成繁体题目（含 JSON 容错） =================== */
function generateQuestions_(cfg){
  var grade = Math.max(1, Math.min(6, Number(cfg.grade||3)));
  var subject = String(cfg.subject||'Math');
  var skill = String(cfg.skill||'Number Sense');
  var difficulty = String(cfg.difficulty||'medium').toLowerCase();
  var count = Math.max(1, Math.min(100, Number(cfg.count||10)));

  var sys = buildSystemPrompt_();
  var user = buildUserPrompt_(grade, subject, skill, difficulty, count);

  var resp = chatContentWithFallback_([{role:'system',content:sys},{role:'user',content:user}], 0.2, 4096);
  var json = parseJsonLoose_(resp.content);
  if (json && json.items instanceof Array) return normalizeItems_(json.items, grade, subject, skill, difficulty);
  return [];
}

/* =================== Prompt（IB 对齐 + 学科细则 + 数学范围） =================== */
function buildSystemPrompt_(){
  var s='';
  s+='You are a generator for a kids typing game (Grades 1–6).\n';
  s+='Output language: Traditional Chinese (zh-TW) for ALL fields.\n';
  s+='Do NOT write questions. NEVER use a question mark, interrogatives, or ask for an answer.\n';
  s+='Produce typing snippets: single words, short phrases, idioms, mini-definitions, or concise descriptions.\n';
  s+='Keep age-appropriate, friendly wording; preserve placeholders {x}, {{name}}, %d, %1$s, and <b>…</b>.\n';
  s+='Mix types roughly: 40% single words, 40% short phrases, 20% short sentences/definitions.\n';
  s+='Length ceiling (1-minute typing target, concise and readable): G1≤12 chars, G2≤18, G3≤28, G4≤36, G5≤46, G6≤56.\n';
  s+='Tone must MATCH grade level:\n';
  s+='- G1–G2: lively, simple, everyday words; avoid abstract terms.\n';
  s+='- G3–G4: clear and practical; introduce basic concepts with familiar contexts.\n';
  s+='- G5–G6: precise yet friendly; slightly more academic, but still concise.\n';
  s+='Theme alignment (subject/skill) should inform topic/vocabulary but stay non-question.\n';
  s+='Return STRICT JSON (no code fences): {"items":[{"question":"","choices":[],"answer":"","explanation":"","sourceHint":""}]}.\n';
  s+='Fill ONLY "question" with the typing snippet; keep other fields empty strings.\n';
  return s;
}
function buildUserPrompt_(grade, subject, skill, difficulty, count){
  var u='';
  u+='請產生「打字片段」給兒童打字練習（非問答）。\n';
  u+='語言：中文（繁體）\n';
  u+='年級：'+grade+'（1~6；依年級遞進難度與長度上限）\n';
  u+='主題：'+subject+'；技能/主題：'+skill+'；難度註記：'+difficulty+'（僅作語彙難易參考）\n';
  u+='混合型態：大約 40% 單字、40% 短語、20% 迷你句/定義；嚴禁問句與「？」。\n';
  u+='長度上限（約 1 分鐘可完成）：G1≤12、G2≤18、G3≤28、G4≤36、G5≤46、G6≤56（字元）。\n';
  u+='語氣必須貼合年級：\n';
  u+='- G1–G2：活潑、簡單、日常詞彙；避免抽象艱深。\n';
  u+='- G3–G4：清楚、實用；用熟悉情境引入概念。\n';
  u+='- G5–G6：精準但友善；可略具學術感但維持精煉。\n';
  u+='數量：'+count+'\n';
  u+='輸出嚴格遵循 JSON schema（僅填 question 欄位，其餘留空）。不要任何解說或程式碼框。';
  return u;
}
function buildUnitUserPrompt_(unit, grade, difficulty, count){
  var u='';
  u+='請產生「打字片段」（非問答）— 與課綱索引對齊：\n';
  u+='單元ID：'+unit.unit_id+'；科目：'+unit.subject+'；領域/主軸：'+(unit.strand||'')+'；技能：'+(unit.skill||'')+'\n';
  u+='年級：'+grade+'（'+unit.gmin+'~'+unit.gmax+'；依年級遞進難度與長度上限）\n';
  u+='難度：'+difficulty+'；情境指引：'+(unit.ctx||'')+'；風格/語氣：'+(unit.style||'')+'\n';
  u+='混合型態：約 40% 單字、40% 短語、20% 短句/定義；嚴禁問句與「？」或要求回答。\n';
  u+='長度上限：G1≤12、G2≤18、G3≤28、G4≤36、G5≤46、G6≤56（字元）。\n';
  u+='語氣必須貼合年級（G1–G2 活潑簡單；G3–G4 清楚實用；G5–G6 精準友善）。\n';
  u+='題數：'+count+'；輸出為嚴格 JSON（僅填 question 欄位，其餘留空）。';
  return u;
}

/* =================== 按 unit 出题（用于 index） =================== */
function generateQuestionsByUnit_(unit, grade, difficulty, count){
  var sys = buildSystemPrompt_();
  var user = buildUnitUserPrompt_(unit, grade, difficulty, Math.max(1, Math.min(100, Number(count||10))));
  var resp2 = chatContentWithFallback_([{role:'system',content:sys},{role:'user',content:user}], 0.2, 4096);
  var json2 = parseJsonLoose_(resp2.content);
  if (json2 && json2.items instanceof Array) return normalizeItems_(json2.items, grade, unit.subject, unit.skill||unit.strand, difficulty);
  return [];
}

function quickOpenAITest(){
  try {
    ensureApiKey_();
    var items = generateQuestions_({ grade:3, subject:'Math', skill:'Number Sense', difficulty:'easy', count:1 });
    var ok = items && items.length>0;
    var ui = safeGetUi_();
    if (ui) ui.alert(ok ? '✅ OpenAI 連線正常，已取得 1 題樣本。' : '⚠️ 呼叫完成但未返回題目（請稍後重試或檢查額度/金鑰）。');
    return ok;
  } catch (e) {
    var ui2 = safeGetUi_();
    if (ui2) ui2.alert('❌ 失敗：'+(e && e.message ? e.message : e));
    return false;
  }
}

/* =================== 写入/工具/容错/去重/诊断 =================== */
function writeUnitItems_(qb, unit_id, items, fillOnly){
  var wrote = 0;
  var lastRow = qb.getLastRow();
  var usedRows = [];
  if (lastRow>1){
    var data = qb.getRange(2,1,lastRow-1,QB_HEADERS.length).getValues();
    for (var i=0;i<data.length;i++){
      if (String(data[i][0]||'').trim() === unit_id){
        var hasText = String(data[i][6]||'').trim() !== '';
        if (!hasText && fillOnly) usedRows.push(i+2);
        else if (!fillOnly) usedRows.push(i+2);
      }
    }
  }

  var rowsNeeded = items.length;
  var targets = usedRows.slice(0, rowsNeeded);

  if (fillOnly) {
    rowsNeeded = Math.min(rowsNeeded, targets.length);
    targets = targets.slice(0, rowsNeeded);
  } else {
    var appendCount = rowsNeeded - targets.length;
    if (appendCount > 0) {
      var start = qb.getLastRow() + 1;
      for (var a=0; a<appendCount; a++) targets.push(start + a);
    }
  }

  for (var k=0; k<rowsNeeded; k++){
    var dst = targets[k];
    var row = [
      unit_id,
      items[k].grade, items[k].subject, items[k].skill, items[k].difficulty, 'zh-TW',
      items[k].question || ''
    ];
    qb.getRange(dst,1,1,row.length).setValues([row]);
    wrote++;
  }
  return wrote;
}

function writeUnitItemsFromRow_(qb, startRow, unit_id, items){
  var wrote = 0;
  var rowsNeeded = items.length;
  var targets = [];
  for (var i=0;i<rowsNeeded;i++) targets.push(startRow + i);
  var last = qb.getLastRow();
  var needAppend = (startRow + rowsNeeded - 1) - last;
  if (needAppend > 0){
    var base = last + 1;
    for (var j=0;j<needAppend;j++) targets.push(base + j);
  }
  for (var k=0;k<rowsNeeded;k++){
    var dst = targets[k];
    var row = [
      unit_id,
      items[k].grade, items[k].subject, items[k].skill, items[k].difficulty, 'zh-TW',
      items[k].question || ''
    ];
    qb.getRange(dst,1,1,row.length).setValues([row]);
    wrote++;
  }
  return wrote;
}

function generateByIndexSelectionOverwriteFromCursor(){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  var qb  = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的數據行（不要包含表頭）。'); return; }
  var startIdx = sel.getRow();
  var rec = idx.getRange(startIdx,1,1,15).getValues()[0];
  var unit = {
    unit_id: String(rec[0]||'').trim() || buildUnitId_({subject:String(rec[1]||'Math'),strand:String(rec[2]||''),skill:String(rec[3]||''),gmin:Number(rec[5]||1),gmax:Number(rec[6]||1)}),
    subject: String(rec[1]||'Math'), skill: String(rec[3]||'')
  };
  var grade = Math.max(1, Math.min(6, Number(rec[5]||1)));
  var difficulty = 'medium';
  var count = Math.max(1, Math.min(200, Number(rec[10]||18)));
  var items = generateQuestionsByUnit_(unit, grade, difficulty, count);
  if (!items || !items.length){ SpreadsheetApp.getUi().alert('⚠️ 呼叫完成但未返回題目'); return; }
  var startRow = SpreadsheetApp.getActive().getRange('QuestionBank!A2').getRow();
  // 以 QuestionBank 的當前選區起點為覆蓋起點；若當前工作表不是 QuestionBank，就從第二列起
  var activeSheet = SpreadsheetApp.getActive().getActiveSheet();
  if (activeSheet.getName() === SHEET_QB){
    var qbSel = activeSheet.getActiveRange();
    if (qbSel) startRow = qbSel.getRow();
    if (startRow === 1) startRow = 2;
  }
  var wrote = writeUnitItemsFromRow_(qb, startRow, unit.unit_id, items);
  SpreadsheetApp.getUi().alert('✅ 完成（cursor overwrite）：共寫入 '+wrote+' 題，起點第 '+startRow+' 行。');
}

function appendToQB_(items){
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var rows=[], i;
  for (i=0;i<items.length;i++){
    rows.push([
      '',
      items[i].grade, items[i].subject, items[i].skill, items[i].difficulty, 'zh-TW',
      items[i].question || ''
    ]);
  }
  var start = sh.getLastRow()+1;
  sh.getRange(start,1,rows.length,rows[0].length).setValues(rows);
}

function normalizeItems_(arr, grade, subject, skill, difficulty){
  var out=[], i; for (i=0;i<arr.length;i++){
    var it=arr[i]||{};
    out.push({
      grade: grade, subject: subject, skill: skill, difficulty: difficulty,
      question: it.question || '', choices: it.choices || [], answer: it.answer || '', explanation: it.explanation || '', sourceHint: it.sourceHint || ''
    });
  } return out;
}

function parseJsonLoose_(content){
  var s = String(content||'').trim();
  s = s.replace(/^```json/i,'').replace(/^```/i,'').replace(/```$/,'').trim();
  var start = s.indexOf('{'); var end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.substring(start, end+1);
  try { return JSON.parse(s); } catch(e){}
  try { return JSON.parse(s.replace(/,\s*}/g,'}').replace(/,\s*]/g,']')); } catch(e2){}
  return null;
}

function findColumnIndex_(headers, name){
  var i; for (i=0;i<headers.length;i++) if (String(headers[i]).trim()===String(name).trim()) return i;
  return -1;
}

// 鬆綁版：容忍大小寫/底線/長破折號/常見別名（如 fil→fil-PH、he→he-IL、fa→fa-IR、uk→uk-UA 等）
function getLangCol_(headers, lang){
  function normKey(s){ return String(s||'').trim().replace(/[–—‑−]/g,'-').replace(/_/g,'-').toLowerCase(); }
  var alias = {
    'vi': 'vi-vn', 'th': 'th-th', 'ru': 'ru-ru', 'ar': 'ar-sa',
    'fil': 'fil-ph', 'tl': 'fil-ph',
    'nl': 'nl-nl', 'pl': 'pl-pl', 'sv': 'sv-se', 'nb': 'nb-no', 'no': 'nb-no', 'da': 'da-dk', 'fi': 'fi-fi',
    'ro': 'ro-ro', 'el': 'el-gr', 'cs': 'cs-cz', 'hu': 'hu-hu', 'uk': 'uk-ua', 'ms': 'ms-my',
    'hi': 'hi-in', 'bn': 'bn-bd', 'he': 'he-il', 'iw': 'he-il', 'fa': 'fa-ir', 'ur': 'ur-pk', 'tr': 'tr-tr',
    'zh-cn': 'zh-cn', 'zh-hans-cn': 'zh-cn', 'zh-hant-tw': 'zh-tw'
  };
  var target = normKey(lang);
  if (alias[target]) target = alias[target];
  // 構建表頭索引（同時支持原樣與正規化鍵）
  var map = {};
  for (var i=0;i<headers.length;i++){
    var raw = String(headers[i]||'');
    var k1 = normKey(raw);
    map[k1] = i+1;
    map[String(raw).trim()] = i+1;
  }
  // 直接命中
  if (map[target]) return map[target]-1;
  // 嘗試區域化簡（如 vi-vn → vi；僅當表頭真的使用短碼時有用）
  var short = target.split('-')[0];
  if (map[short]) return map[short]-1;
  return -1;
}

function ensureSheetsExist_(){
  var ss=SpreadsheetApp.getActive();
  if(!ss.getSheetByName(SHEET_UI)) ensureUiSheet_();
  if(!ss.getSheetByName(SHEET_QB)) ensureQuestionBank_();
  if(!ss.getSheetByName(SHEET_CONTENT)) ensureContentBank_();
  if(!ss.getSheetByName(SHEET_INDEX)) ensureIndex_();
}
function ensureApiKey_(){ var k=getApiKey_(); if(!k) throw new Error('缺少 OPENAI_API_KEY。到「项目设置 → 脚本属性」新增。'); }
function getApiKey_(){ return PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY'); }

function diagnose(){
  var ss = SpreadsheetApp.getActive();
  var msgs = [];
  msgs.push('活跃表：'+ss.getName());
  msgs.push('ui：'+(ss.getSheetByName(SHEET_UI)?'✅':'❌'));
  msgs.push('QuestionBank：'+(ss.getSheetByName(SHEET_QB)?'✅':'❌'));
  msgs.push('content_bank：'+(ss.getSheetByName(SHEET_CONTENT)?'✅':'❌'));
  msgs.push('index：'+(ss.getSheetByName(SHEET_INDEX)?'✅':'❌'));
  msgs.push('OPENAI_API_KEY：'+(getApiKey_()?'✅ 已设置':'❌ 未设置'));
  SpreadsheetApp.getUi().alert('诊断结果', msgs.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

/* 去重：按 unit_id+Question */
function dedupeQuestionBank(){
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var last = sh.getLastRow();
  if (last<2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return; }
  var data = sh.getRange(2,1,last-1,QB_HEADERS.length).getValues();
  var seen = {};
  var keep = [];
  var i;
  for (i=0;i<data.length;i++){
    var key = (String(data[i][0]||'')+'||'+String(data[i][6]||'')).trim();
    if (!key || seen[key]) continue;
    seen[key] = true;
    keep.push(data[i]);
  }
  sh.getRange(2,1,last-1,QB_HEADERS.length).clearContent();
  if (keep.length) sh.getRange(2,1,keep.length,QB_HEADERS.length).setValues(keep);
  SpreadsheetApp.getUi().alert('✅ 去重完成，保留 '+keep.length+' 行。');
}

function offlineSampleFill(){
  ensureSheetsExist_();
  var sample = [
    {grade:1,subject:'Math',skill:'Number Sense',difficulty:'easy',question:'有 3 顆蘋果，又得到 2 顆，現在共有幾顆？',choices:['4','5','6'],answer:'5',explanation:'3+2=5',sourceHint:'加法入門'},
    {grade:3,subject:'Language',skill:'Main Idea',difficulty:'medium',question:'閱讀短文：「小安每天幫忙整理書包與桌面。」這段主要在說什麼？',choices:['去玩球','做家務','去露營'],answer:'做家務',explanation:'主旨在日常責任',sourceHint:'主旨抓取'},
    {grade:4,subject:'Science',skill:'States of Matter',difficulty:'easy',question:'下列哪一項屬於液體？',choices:['石頭','水','玻璃'],answer:'水',explanation:'液體可流動並改變形狀',sourceHint:'物質三態'}
  ];
  appendToQB_(sample);
}

function buildUnitId_(u){
  var g = (u.gmin===u.gmax)? ('G'+u.gmin) : ('G'+u.gmin+'-'+u.gmax);
  var s1 = (u.strand||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3);
  var s2 = (u.skill||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3);
  return (u.subject||'GEN').toUpperCase()+'-'+g+'-'+s1+'-'+s2+'-'+(new Date().getTime().toString().slice(-4));
}

/* 在地化翻译（姓名/情境/单位） */
function callOpenAI_LocalizeBatch_(items, sourceLocale, targetLocale){
  var nameSets = {
    'en-US':['Ava','Liam','Mia','Noah','Emma','Ethan'],
    'es-MX':['Sofía','Mateo','Valentina','Diego'],
    'ja-JP':['たろう','さくら','はると','ゆい'],
    'ko-KR':['民俊','書妍','志厚','河允'],
    'fr-FR':['Léa','Lucas','Zoé','Louis'],
    'de-DE':['Mia','Ben','Emma','Leon']
  };
  var unitPref = (targetLocale==='en-US') ? 'imperial' : 'metric';

  var sys = ''
    + 'You are a localization expert.\n'
    + 'Translate K-6 educational questions from '+sourceLocale+' to '+targetLocale+' with FULL cultural adaptation.\n'
    + 'Adapt personal names, foods, places, currency, and school life scenes to fit the locale; keep math correctness.\n'
    + 'Convert measurement units if needed ('+unitPref+').\n'
    + 'Prefer given names like: '+JSON.stringify(nameSets[targetLocale]||[])+'\n'
    + 'Keep placeholders unchanged: {x}, {{name}}, %d, %1$s, and HTML tags.\n'
    + 'Return STRICT JSON only: {"translations":["...","..."]}.';
  var user = 'Translate each object fields separately and return JSON: {"translations":[{"q":"...","c":"...","a":"...","e":"...","s":"..."},...]}\nitems='+JSON.stringify(items);

  var r = chatContentWithFallback_([{role:'system',content:sys},{role:'user',content:user}], 0.3, 4096);
  var js = parseJsonLoose_(r.content);
  if (js && js.translations instanceof Array){
    var out=[], n=items.length, i; for (i=0;i<n;i++) out.push(js.translations[i]||{q:'',c:'',a:'',e:'',s:''});
    return out;
  }
  var fb=[], j; for (j=0;j<items.length;j++) fb.push({q:items[j].question||'',c:items[j].choices||'',a:items[j].answer||'',e:items[j].explanation||'',s:items[j].sourceHint||''});
  return fb;
}

// 併發版本：同時對多個 packs 發送請求，提升吞吐
function callOpenAI_LocalizeBatchMulti_(packsArray, sourceLocale, targetLocale){
  var unitPref = (targetLocale==='en-US') ? 'imperial' : 'metric'
  var sys = ''
    + 'You are a localization expert.\n'
    + 'Translate K-6 educational questions from '+sourceLocale+' to '+targetLocale+' with FULL cultural adaptation.\n'
    + 'Adapt personal names, foods, places, currency, and school life scenes to fit the locale; keep math correctness.\n'
    + 'Convert measurement units if needed ('+unitPref+').\n'
    + 'Keep placeholders unchanged: {x}, {{name}}, %d, %1$s, and HTML tags.\n'
    + 'Return STRICT JSON only: {"translations":[{"q":"...","c":"...","a":"...","e":"...","s":"..."},...]}.'
  var requests = []
  for (var i=0;i<packsArray.length;i++){
    var user = 'Translate each object fields separately and return JSON: {"translations":[{"q":"...","c":"...","a":"...","e":"...","s":"..."},...]}'
      + '\nitems='+JSON.stringify(packsArray[i])
    var payload = { model: OPENAI_MODEL, messages: [{role:'system',content:sys},{role:'user',content:user}] }
    if (supportsTemperature_(OPENAI_MODEL)) payload.temperature = 0.3
    if (usesMaxCompletionTokens_(OPENAI_MODEL)) payload.max_completion_tokens = 4096; else payload.max_tokens = 4096
    if (supportsJsonResponseFormat_()) payload.response_format = JSON_RESPONSE_FORMAT
    requests.push({ url: 'https://api.openai.com/v1/chat/completions', method: 'post', headers: {'Authorization':'Bearer '+getApiKey_(),'Content-Type':'application/json'}, payload: JSON.stringify(payload), muteHttpExceptions: true })
  }
  var out = []
  try{
    var resps = UrlFetchApp.fetchAll(requests)
    for (var r=0;r<resps.length;r++){
      var code = resps[r].getResponseCode()
      var text = resps[r].getContentText()
      if (code>=200 && code<300){
        var data = JSON.parse(text)
        var content = (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
        var js = parseJsonLoose_(content)
        if (js && js.translations instanceof Array){ out.push(js.translations) } else { out.push([]) }
      } else { out.push([]) }
    }
  } catch(e){
    for (var k=0;k<packsArray.length;k++) out.push([])
  }
  return out
}

// 新增：⑩f 交錯混合（按 index 選區，多科交錯寫入到 QuestionBank 尾端）
function generateInterleavedFromIndexAppend(){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的數據行（不要包含表頭）。'); return; }

  var cfgUi = readUi_();
  var start = sel.getRow();
  var rows = sel.getNumRows();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);

  var unitPacks = [];
  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Math'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count)))
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var targetTotal = unit.count;
    var made = 0;
    var bag = [];
    while (made < targetTotal){
      var remaining = targetTotal - made;
      var perBatch = Math.min(100, remaining);
      var grades = []; for (var gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));

      for (var gIdx=0; gIdx<grades.length; gIdx++){
        for (var di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = perDiffCount;
          var seg = generateQuestionsByUnit_(unit, grades[gIdx], diff, want);
          if (seg && seg.length){ for (var sIdx=0; sIdx<seg.length; sIdx++) bag.push({ unit_id: unit.unit_id, item: seg[sIdx] }); }
        }
      }
      if (bag.length === 0) break;
      made += Math.min(perBatch, bag.length);
    }
    unitPacks.push(bag);
  }

  var merged = [];
  var remain = true;
  while (remain){
    remain = false;
    for (var u=0; u<unitPacks.length; u++){
      if (unitPacks[u].length){ merged.push(unitPacks[u].shift()); remain = true; }
    }
  }
  if (!merged.length){ SpreadsheetApp.getUi().alert('⚠️ 未返回內容'); return; }

  var rowsOut = [];
  for (var k=0; k<merged.length; k++){
    var it = merged[k].item;
    rowsOut.push([
      merged[k].unit_id,
      it.grade, it.subject, it.skill, it.difficulty, 'zh-TW',
      it.question || ''
    ]);
  }
  var startRow = qb.getLastRow()+1;
  qb.getRange(startRow,1,rowsOut.length, rowsOut[0].length).setValues(rowsOut);
  SpreadsheetApp.getUi().alert('✅ 已交錯寫入 '+rowsOut.length+' 條到 QuestionBank 尾端（自動分批）。');
}

function ibpypBuildIndexLangHistory(){
  ensureIndex_();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_INDEX);

  var headers = ['unit_id','subject','strand','skill','ib_concept','grade_min','grade_max','difficulty_curve','context_guidelines','style_notes','count','seed','status','last_run','tags'];
  if (sh.getLastRow()<1) sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');

  if (sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1, sh.getLastColumn()).clearContent();

  var rows = [];
  var curve = 'easy>medium>hard';
  var defaultCount = 100;

  function addUnit(subject, strand, skill, g, idxConcept){
    var uid = subject.toUpperCase()+'-G'+g+'-'+(strand||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(skill||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(new Date().getTime().toString().slice(-4));
    var seed = 'ibpyp-'+subject.toLowerCase().replace(/\s+/g,'-')+'-g'+g+'-'+(skill||'').replace(/\s+/g,'-').toLowerCase().slice(0,6);
    var style = '片段≤對應年級上限；活潑/清楚/精煉（隨年級）；保留佔位符；用公制（非美制）';
    var ctx = '';
    if (subject==='Language') ctx = '日常短語與文本，閱讀/寫作/聽說情境，避免艱深專有名詞';
    if (subject==='Social Studies') ctx = '歷史與社會：時間線、人物與事件、社群與文化、地圖與資源';

    rows.push([
      uid, subject, strand, skill, IB_CONCEPTS[idxConcept % IB_CONCEPTS.length],
      g, g, curve, ctx, style, defaultCount, seed, '', '', 'ib-auto'
    ]);
  }

  var subjects = [IB.language, IB.social];
  var conceptIdx = 0;
  for (var s=0; s<subjects.length; s++){
    var subj = subjects[s];
    for (var i=0; i<subj.strands.length; i++){
      var strand = subj.strands[i];
      for (var j=0; j<strand.skills.length; j++){
        var skill = strand.skills[j];
        for (var g=1; g<=6; g++){
          addUnit(subj.subject, strand.strand, skill, g, conceptIdx++);
        }
      }
    }
  }

  if (rows.length){
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  }
  SpreadsheetApp.getUi().alert('✅ 已生成「語言 + 歷史（社會）」索引，預設 count=100。');
}

function setIndexTopNCount(n, newCount){
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!sh || sh.getLastRow()<2){ SpreadsheetApp.getUi().alert('index 無資料'); return; }
  var last = sh.getLastRow();
  var rows = Math.min(n, last-1);
  var data = new Array(rows).fill(0).map(function(){ return [newCount]; });
  // count 欄位在第 11 欄
  sh.getRange(2,11,rows,1).setValues(data);
  SpreadsheetApp.getUi().alert('✅ 已將 index 前 '+rows+' 行的 count 設為 '+newCount+'。');
}

function setIndexTop5Count100(){ setIndexTopNCount(5, 100); }

function ibpypBuildIndex_LangHistSciArts_500(){
  ensureIndex_();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_INDEX);

  var headers = ['unit_id','subject','strand','skill','ib_concept','grade_min','grade_max','difficulty_curve','context_guidelines','style_notes','count','seed','status','last_run','tags'];
  if (sh.getLastRow()<1) sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold');

  if (sh.getLastRow()>1) sh.getRange(2,1,sh.getLastRow()-1, sh.getLastColumn()).clearContent();

  var rows = [];
  var curve = 'easy>medium>hard';
  var defaultCount = 500;

  function addUnit(subject, strand, skill, g, idxConcept){
    var uid = subject.toUpperCase()+'-G'+g+'-'+(strand||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(skill||'GEN').replace(/\s+/g,'').toUpperCase().slice(0,3)+'-'+(new Date().getTime().toString().slice(-4));
    var seed = 'ibpyp-'+subject.toLowerCase().replace(/\s+/g,'-')+'-g'+g+'-'+(skill||'').replace(/\s+/g,'-').toLowerCase().slice(0,6);
    var style = '片段≤對應年級上限；活潑/清楚/精煉（隨年級）；保留佔位符；用公制（非美制）';
    var ctx = '';
    if (subject==='Language') ctx = '閱讀/寫作/聽說情境之常用語彙與短語，避免艱深專有名詞';
    if (subject==='Social Studies') ctx = '歷史與社會：時間線、人物與事件、社群與文化、地圖與資源';
    if (subject==='Science') ctx = '生活可觀察現象（天氣、動植物、材料）、安全為先、詞彙精煉';
    if (subject==='Arts') ctx = '視覺/音樂/戲劇的基礎要素、表達與欣賞';

    rows.push([
      uid, subject, strand, skill, IB_CONCEPTS[idxConcept % IB_CONCEPTS.length],
      g, g, curve, ctx, style, defaultCount, seed, '', '', 'ib-auto'
    ]);
  }

  var subjects = [IB.language, IB.social, IB.science, IB.arts];
  var conceptIdx = 0;
  for (var s=0; s<subjects.length; s++){
    var subj = subjects[s];
    for (var i=0; i<subj.strands.length; i++){
      var strand = subj.strands[i];
      for (var j=0; j<strand.skills.length; j++){
        var skill = strand.skills[j];
        for (var g=1; g<=6; g++){
          addUnit(subj.subject, strand.strand, skill, g, conceptIdx++);
        }
      }
    }
  }

  if (rows.length){
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
  }
  SpreadsheetApp.getUi().alert('✅ 已生成索引（語言/歷史/科學/社會/藝術），每行 count=500。');
}

function setIndexTop5Count500(){ setIndexTopNCount(5, 500); }

function writeUnitItemsAppend_(qb, unit_id, items, batchSize){
  var wrote = 0;
  var buf = [];
  var bsz = Math.max(1, Math.min(50, Number(batchSize||10)));
  for (var i=0;i<items.length;i++){
    buf.push([
      unit_id,
      items[i].grade, items[i].subject, items[i].skill, items[i].difficulty, 'zh-TW',
      items[i].question || ''
    ]);
    if (buf.length >= bsz){
      var startRow = qb.getLastRow()+1;
      qb.getRange(startRow,1,buf.length, buf[0].length).setValues(buf);
      wrote += buf.length; buf = [];
    }
  }
  if (buf.length){
    var startRow2 = qb.getLastRow()+1;
    qb.getRange(startRow2,1,buf.length, buf[0].length).setValues(buf);
    wrote += buf.length; buf = [];
  }
  return wrote;
}

function getUnitCounts_(qb){
  var map = {};
  var last = qb.getLastRow();
  if (last>1){
    var ids = qb.getRange(2,1,last-1,1).getValues();
    for (var i=0;i<ids.length;i++){
      var uid = String(ids[i][0]||'').trim();
      if (!uid) continue;
      map[uid] = (map[uid]||0) + 1;
    }
  }
  return map;
}

function generateByIndexFromCursorToEnd(typeMode){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的起始數據行（不要包含表頭）。'); return; }

  var cfgUi = readUi_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var start = sel.getRow();
  var last = idx.getLastRow();
  var rows = Math.max(0, last - start + 1);

  var SKIP = GENERATION_SKIP_DEDUP === true;
  var existing, textSetByUnit;
  if (SKIP){
    existing = getUnitCounts_(qb);
    textSetByUnit = null;
  } else {
    var maps = buildExistingMaps_(qb);
    existing = maps.countByUnit;
    textSetByUnit = maps.textSetByUnit;
  }

  var producedTotal = 0;

  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    if (!rec || !String(rec[1]||'').trim()) continue;
    var status = String(rec[12]||'').toLowerCase();
    if (status === 'done') continue; // 跳過已完成的 index 行
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Language-EN'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      ib:      String(rec[4]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count))),
      seed:    String(rec[11]||'')
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var already = existing[unit.unit_id] || 0;
    var targetTotal = unit.count;
    if (already >= targetTotal){
      idx.getRange(start+r,12,1,3).setValues([[ 'done', new Date(), rec[14] ]]);
      continue;
    }
    var remainingTarget = targetTotal - already;

    var made = 0;
    while (made < remainingTarget){
      var remaining = remainingTarget - made;
      var perBatch = Math.min(100, remaining);

      var grades = [], gi; for (gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));

      var produced = 0, di;
      for (gi=0; gi<grades.length; gi++){
        for (di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = Math.min(perDiffCount, remainingTarget - made - produced);
          if (want <= 0) break;
          var typeOverride = (typeMode==='word' || typeMode==='sentence' || typeMode==='phrase' || typeMode==='idiom') ? typeMode : null;
          var items = generateQuestionsByUnit_(unit, grades[gi], diff, want, typeOverride);
          items = maybeLocalizeToZhTW_(unit, items);
          if (!SKIP && textSetByUnit){ items = filterNewItems_(unit.unit_id, items, textSetByUnit); }
          if (items && items.length){
            produced += writeUnitItemsAppend_(qb, unit.unit_id, items, 10);
            existing[unit.unit_id] = (existing[unit.unit_id]||0) + items.length;
            Utilities.sleep(BULK_SLEEP_MS);
          }
        }
      }
      if (produced === 0) break;
      made += produced;
    }
    idx.getRange(start+r,12,1,3).setValues([[ made>=remainingTarget?'done':'partial', new Date(), rec[14] ]]);
    producedTotal += made;
  }
  SpreadsheetApp.getUi().alert('✅ 已生成至表尾，共新寫入 '+producedTotal+' 條' + (SKIP?'（已跳過即時去重）':'（含即時去重）') + '。');
}

function genIndexFromCursor_Word(){ generateByIndexFromCursorToEnd('word'); }
function genIndexFromCursor_Sentence(){ generateByIndexFromCursorToEnd('sentence'); }
function genIndexFromCursor_Phrase(){ generateByIndexFromCursorToEnd('phrase'); }
function genIndexFromCursor_Idiom(){ generateByIndexFromCursorToEnd('idiom'); }

function isMostlyLatin_(s){
  var t = String(s||'');
  var latin = (t.match(/[A-Za-z]/g)||[]).length;
  var total = t.replace(/\s+/g,'').length;
  return total>0 && latin/total > 0.6;
}
function ensureZhTwBatch_(items){
  // 找出英文項，批次翻譯為 zh-TW
  var needs = [];
  var idxs = [];
  for (var i=0;i<items.length;i++){
    var q = String(items[i] && items[i].question || '');
    if (!q) continue;
    if (isMostlyLatin_(q)) { needs.push({ question:q }); idxs.push(i); }
  }
  if (!needs.length) return items;
  var translated = callOpenAI_LocalizeBatch_(needs, 'en-US', 'zh-TW') || [];
  for (var k=0;k<idxs.length;k++){
    var at = idxs[k];
    var tr = translated[k];
    var text = '';
    if (tr && typeof tr==='object') text = String(tr.q||'');
    else if (typeof tr==='string') text = tr;
    if (text) items[at].question = text;
  }
  return items;
}

function buildUnitUserPrompt_(unit, grade, difficulty, count, outLang, typesOverride){
  // 解析字母與型態
  var letter = '';
  var strand = String(unit.strand||'');
  var m = strand.match(/Letter\s*:\s*([A-Za-z])/i); if (m) letter = m[1].toUpperCase();
  var domain = String(unit.skill||'');
  var types = typesOverride ? String(typesOverride) : String((unit.ib||'types:word|sentence|idiom').replace('types:',''));
  var u='';
  u+='Language: '+(outLang||'Traditional Chinese (zh-TW)')+'\n';
  u+='Grade: '+grade+' (1–6; difficulty grows with grade)\n';
  u+='Letter constraint: '+(letter?('Words MUST start with "'+letter+'"; sentences/idioms MUST contain a keyword starting with "'+letter+'".'):'None')+'\n';
  u+='Domain/topic: '+domain+'\n';
  u+='Types (only generate these): '+types+'; NO questions; NO "?".\n';
  u+='Avoid duplicates within the batch; vary vocabulary; keep kid-friendly wording.\n';
  u+='Count: '+count+'\n';
  u+='Output STRICT JSON; fill only question field; others empty.\n';
  return u;
}

function generateQuestionsByUnit_(unit, grade, difficulty, count, typesOverride){
  var outLang = (String(unit.subject||'').toLowerCase().indexOf('language-en')>=0) ? 'English (en-US)' : 'Traditional Chinese (zh-TW)';
  var sys = buildSystemPrompt_(outLang);
  var user = buildUnitUserPrompt_(unit, grade, difficulty, Math.max(1, Math.min(100, Number(count||10))), outLang, typesOverride);
  var resp2 = chatContentWithFallback_([{role:'system',content:sys},{role:'user',content:user}], 0.2, 4096);
  var json2 = parseJsonLoose_(resp2.content);
  if (json2 && json2.items instanceof Array) return normalizeItems_(json2.items, grade, unit.subject, unit.skill||unit.strand, difficulty);
  return [];
}

function maybeLocalizeToZhTW_(unit, items){
  try{
    var subj = String(unit.subject||'').toLowerCase();
    // 對 Language-EN 先英→繁，再補強強制 zh-TW
    if (subj.indexOf('language-en') !== -1){
      var pack = [];
      for (var i=0;i<items.length;i++){ pack.push({ question: String(items[i].question||'') }); }
      var localized = callOpenAI_LocalizeBatch_(pack, 'en-US', 'zh-TW') || [];
      var out = [];
      for (var j=0;j<items.length;j++){
        var zhq = '';
        var tr = localized[j];
        if (tr && typeof tr === 'object') zhq = String(tr.q||'');
        if (!zhq && typeof tr === 'string') zhq = tr;
        out.push({
          grade: items[j].grade,
          subject: items[j].subject,
          skill: items[j].skill,
          difficulty: items[j].difficulty,
          question: zhq || items[j].question,
          choices: [], answer: '', explanation: '', sourceHint: ''
        });
      }
      // 若仍有英文殘留，再次強制轉繁
      return ensureZhTwBatch_(out);
    }
    // 其他科目：若偵測英文，亦強制轉繁
    return ensureZhTwBatch_(items);
  } catch(e){ return items; }
}

function generateByIndexFromCursorToEnd(typeMode){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的起始數據行（不要包含表頭）。'); return; }

  var cfgUi = readUi_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var start = sel.getRow();
  var last = idx.getLastRow();
  var rows = Math.max(0, last - start + 1);

  var SKIP = GENERATION_SKIP_DEDUP === true;
  var existing, textSetByUnit;
  if (SKIP){
    existing = getUnitCounts_(qb);
    textSetByUnit = null;
  } else {
    var maps = buildExistingMaps_(qb);
    existing = maps.countByUnit;
    textSetByUnit = maps.textSetByUnit;
  }

  var producedTotal = 0;

  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    if (!rec || !String(rec[1]||'').trim()) continue;
    var status = String(rec[12]||'').toLowerCase();
    if (status === 'done') continue; // 跳過已完成的 index 行
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Language-EN'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      ib:      String(rec[4]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count))),
      seed:    String(rec[11]||'')
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var already = existing[unit.unit_id] || 0;
    var targetTotal = unit.count;
    if (already >= targetTotal){
      idx.getRange(start+r,12,1,3).setValues([[ 'done', new Date(), rec[14] ]]);
      continue;
    }
    var remainingTarget = targetTotal - already;

    var made = 0;
    while (made < remainingTarget){
      var remaining = remainingTarget - made;
      var perBatch = Math.min(100, remaining);

      var grades = [], gi; for (gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));

      var produced = 0, di;
      for (gi=0; gi<grades.length; gi++){
        for (di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = Math.min(perDiffCount, remainingTarget - made - produced);
          if (want <= 0) break;
          var typeOverride = (typeMode==='word' || typeMode==='sentence' || typeMode==='phrase' || typeMode==='idiom') ? typeMode : null;
          var items = generateQuestionsByUnit_(unit, grades[gi], diff, want, typeOverride);
          items = maybeLocalizeToZhTW_(unit, items);
          if (!SKIP && textSetByUnit){ items = filterNewItems_(unit.unit_id, items, textSetByUnit); }
          if (items && items.length){
            produced += writeUnitItemsAppend_(qb, unit.unit_id, items, 10);
            existing[unit.unit_id] = (existing[unit.unit_id]||0) + items.length;
            Utilities.sleep(BULK_SLEEP_MS);
          }
        }
      }
      if (produced === 0) break;
      made += produced;
    }
    idx.getRange(start+r,12,1,3).setValues([[ made>=remainingTarget?'done':'partial', new Date(), rec[14] ]]);
    producedTotal += made;
  }
  SpreadsheetApp.getUi().alert('✅ 已生成至表尾，共新寫入 '+producedTotal+' 條' + (SKIP?'（已跳過即時去重）':'（含即時去重）') + '。');
}

function genIndexFromCursor_Word(){ generateByIndexFromCursorToEnd('word'); }
function genIndexFromCursor_Sentence(){ generateByIndexFromCursorToEnd('sentence'); }
function genIndexFromCursor_Phrase(){ generateByIndexFromCursorToEnd('phrase'); }
function genIndexFromCursor_Idiom(){ generateByIndexFromCursorToEnd('idiom'); }

function syncQuestionBankToContentBankAll(){
  ensureApiKey_(); ensureSheetsExist_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  if (!qb || !cb){ SpreadsheetApp.getUi().alert('缺少必要分頁'); return; }

  // 總是從「選取列」開始，可中斷後再次從選取列重跑
  var ss = SpreadsheetApp.getActive();
  // 若使用者在 content_bank 有選取列，尊重其為寫入起點
  var cbSelectedRow = null;
  if (ss.getActiveSheet().getName() === SHEET_CONTENT){
    var cbSel = ss.getActiveRange();
    if (cbSel && cbSel.getRow()>1) cbSelectedRow = cbSel.getRow();
  }
  if (ss.getActiveSheet().getName() !== SHEET_QB) { ss.setActiveSheet(qb); }
  var sel = ss.getActiveRange();
  var startFromQB = (sel && sel.getRow()>1) ? sel.getRow() : null;
  // 若未在 QB 選取，使用 content_bank 的選取列作為對齊起點（期望兩邊同一列對齊續跑）
  var start = startFromQB || (cbSelectedRow && cbSelectedRow>1 ? cbSelectedRow : 2);
  var qbLast = qb.getLastRow();
  // 不論是否有選取範圍，都持續處理到表尾；選取只決定起點（可用來續跑）
  var totalRows = qbLast - start + 1;
  if (qb.getLastRow()<2 || totalRows<=0){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return; }

  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  function normName(s){
    return String(s||'').trim().replace(/[–—‑−]/g,'-').replace(/_/g,'_')
  }
  var col = {};
  for (var i=0;i<headers.length;i++){
    var raw = String(headers[i]||'')
    var key = normName(raw)
    col[raw] = i+1
    col[key] = i+1
    col[key.toLowerCase()] = i+1
  }
  var zhCol = col['zh-TW'] || col['ZH-TW'] || col['zh_tw'] || col['zh-tw'] || col['zh‑TW'];
  if (!zhCol){ SpreadsheetApp.getUi().alert('content_bank 缺少 zh-TW 欄'); return; }
  var idCol = col['id'] || col['ID'];
  var typeCol = col['type'] || col['TYPE'];
  var gminCol = col['grade_min'] || col['gradeMin'] || col['gmin'];
  var gmaxCol = col['grade_max'] || col['grade_map'] || col['gradeMax'] || col['gmax'];
  var tagsCol = col['tags'];

  // 取得語言欄位
  var cfgUi = readUi_();
  var targetLocale = String(cfgUi.targetLocale||'en-US');
  var langs = [];
  if (String(targetLocale).toUpperCase() === 'ALL'){
    for (var h=0; h<headers.length; h++){
      var name = String(headers[h]||'').trim();
      if (!name) continue;
      if (name==='id' || name==='type' || name==='grade_min' || name==='grade_max' || name==='tags') continue;
      if (name==='zh-TW') continue;
      langs.push({ name:name, col:h+1 });
    }
  } else {
    var tgtCol = col[targetLocale] || col[String(targetLocale).toLowerCase()] || col[String(targetLocale).replace('_','-')] || col[String(targetLocale).replace('-','_')];
    if (tgtCol){ langs.push({ name:targetLocale, col:tgtCol }); }
  }

  var BATCH_META = 50;                                // 每批處理 50 行，提高吞吐
  var CH = Math.max(10, Math.min(100, CHUNK_SIZE||50)); // 翻譯子批大小
  var processed = 0;
  var writePtr = cbSelectedRow || findNextWriteRow_(cb, zhCol, idCol);  // 寫入從選取列開始，否則附加到尾端（忽略殘留格式）
  var wroteMetaTotal = 0;
  var wroteLangCells = 0;
  var startTs = new Date().getTime();
  var TIME_BUDGET_MS = 340000; // 近 5.7 分鐘，接近 Apps Script 上限但留餘裕

  // 準備 QuestionBank 標頭映射（可選擇讀取 qb_id）
  var qbHeadersRow = qb.getRange(1,1,1,qb.getLastColumn()).getValues()[0];
  var qbCol = {};
  for (var qi=0; qi<qbHeadersRow.length; qi++){ qbCol[String(qbHeadersRow[qi]).trim().toLowerCase()] = qi+1; }
  var qbIdColIdx = qbCol['qb_id'] || null;

  while (processed < totalRows){
    var sizeMeta = Math.min(BATCH_META, totalRows - processed);
    var srcBatch = qb.getRange(start + processed, 1, sizeMeta, QB_HEADERS.length).getValues();
    var qbIdVals = qbIdColIdx ? qb.getRange(start + processed, qbIdColIdx, sizeMeta, 1).getValues() : null;

    // 一次寫入當批 meta 與 zh-TW（只填空白：若目標列已有 id/zh-TW，則保留）
    var out = [];
    var existIdVals = idCol ? cb.getRange(writePtr, idCol, srcBatch.length, 1).getValues() : null
    var existZhVals = cb.getRange(writePtr, zhCol, srcBatch.length, 1).getValues()
    for (var r=0;r<srcBatch.length;r++){
      var g = Number(srcBatch[r][1]||1);
      var arr = new Array(headers.length).fill('');
      // 以 QuestionBank 的 unit_id 作為 content_bank 的 id（題庫 ID 一致）；若已有 id 則不覆蓋
      if (idCol)   { var existId = existIdVals && String(existIdVals[r][0]||''); arr[idCol-1] = existId ? existId : String(srcBatch[r][0]||''); }
      if (typeCol) arr[typeCol-1] = 'typing';
      if (gminCol) arr[gminCol-1] = String(g||1);
      if (gmaxCol) arr[gmaxCol-1] = String(g||1);
      if (tagsCol){
        var unitId = String(srcBatch[r][0]||'');
        var qbId = qbIdVals ? String(qbIdVals[r][0]||'') : '';
        var subj = String(srcBatch[r][2]||'');
        var skl  = String(srcBatch[r][3]||'');
        var dif  = String(srcBatch[r][4]||'');
        var pieces = [];
        if (qbId) pieces.push('qb_id:'+qbId);
        if (unitId) pieces.push('unit:'+unitId);
        if (subj) pieces.push('subj:'+subj);
        if (skl)  pieces.push('skill:'+skl);
        if (dif)  pieces.push('diff:'+dif);
        arr[tagsCol-1] = pieces.join(';');
      }
      var existZh = String(existZhVals[r][0]||'')
      arr[zhCol-1] = existZh ? existZh : String(srcBatch[r][6]||'');
      out.push(arr);
    }
    if (out.length) {
      cb.getRange(writePtr,1,out.length,headers.length).setValues(out);
      SpreadsheetApp.flush();
      wroteMetaTotal += out.length;
      // 若仍出現空白，強制逐行補寫 zh-TW 欄（容錯）
      try{
        var zVals = cb.getRange(writePtr, zhCol, out.length, 1).getValues();
        var needFix = false; for (var zz=0; zz<zVals.length; zz++){ if (!String(zVals[zz][0]||'').trim()){ needFix = true; break; } }
        if (needFix){
          var fix = []; for (var ff=0; ff<out.length; ff++){ fix.push([ out[ff][zhCol-1] ]); }
          cb.getRange(writePtr, zhCol, fix.length, 1).setValues(fix);
          SpreadsheetApp.flush();
        }
      } catch(e){}
    }

    // 針對此批逐語言翻譯
    for (var li=0; li<langs.length; li++){
      var tgt = langs[li];
      var written = 0;
      var CONC = 8; // 提升併發
      while (written < srcBatch.length){
        var reqPacks = []
        var chunkStarts = []
        var chunkSizes = []
        for (var c=0; c<CONC && written < srcBatch.length; c++){
          var size = Math.min(CH, srcBatch.length - written)
          var pack = []
          for (var k=0;k<size;k++) pack.push({ question:String(srcBatch[written+k][6]||'') })
          reqPacks.push(pack)
          chunkStarts.push(writePtr + written)
          chunkSizes.push(size)
          written += size
        }
        var multi = callOpenAI_LocalizeBatchMulti_(reqPacks, 'zh-TW', tgt.name)
        for (var m=0;m<reqPacks.length;m++){
          var translated = multi[m] || []
          var sizeM = chunkSizes[m]
          var vals = []
          for (var t=0;t<sizeM;t++){
            var tr = translated[t]
            var text = ''
            if (tr && typeof tr === 'object') text = String(tr.q||''); else if (typeof tr === 'string') text = tr
            vals.push([text])
          }
          cb.getRange(chunkStarts[m], tgt.col, sizeM, 1).setValues(vals)
          SpreadsheetApp.flush()
          wroteLangCells += sizeM
        }
        Utilities.sleep(BULK_SLEEP_MS)
      }
    }

    processed += sizeMeta;
    writePtr  += sizeMeta;
    Utilities.sleep(BULK_SLEEP_MS);
    if (new Date().getTime() - startTs > TIME_BUDGET_MS) break; // 接近時限，留待下次從同一起點續跑
  }
  SpreadsheetApp.getUi().alert('✅ 已同步（分批） '+totalRows+' 行到 content_bank。\n寫入 zh-TW/meta：'+wroteMetaTotal+' 行；翻譯寫入總格：'+wroteLangCells+'。\n起點：第 '+start+' 行，可中斷後由選取列續傳。');
}

// ③c：從 content_bank 的 zh-TW 批次翻譯到 ui 目標語言（僅翻譯目標欄；其他不動）
function translateContentBankZhTwToTarget(){
  ensureApiKey_(); ensureSheetsExist_();
  var cfg = readUi_();
  var target = String(cfg.targetLocale||'en-US').trim();
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT);
  if (!cb){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return; }

  // 來源選區：若使用者在 content_bank 有選取，就只處理選區；否則處理整張（從第 2 列到最後有資料的列）
  var sel = (SpreadsheetApp.getActive().getActiveSheet().getName()===SHEET_CONTENT) ? cb.getActiveRange() : null;
  var start = 2, rows = cb.getLastRow()-1;
  if (sel && sel.getRow()>1){ start = sel.getRow(); rows = sel.getNumRows(); }
  if (rows<=0){ SpreadsheetApp.getUi().alert('content_bank 無資料可翻譯'); return; }

  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var zhIdx = getLangCol_(headers, 'zh-TW');
  if (zhIdx < 0){ SpreadsheetApp.getUi().alert('缺少語言欄：zh-TW'); return; }
  var zhCol = zhIdx + 1; // 1-based for Range

  // 目標語言欄位集合：優先使用 content_bank 的選取欄（若有），否則使用 ui!F2（可為 ALL）
  var targets = [];
  var sel = (SpreadsheetApp.getActive().getActiveSheet().getName()===SHEET_CONTENT) ? cb.getActiveRange() : null;
  if (sel && sel.getNumColumns()>=1){
    var cStart = sel.getColumn(); var cEnd = cStart + sel.getNumColumns() - 1;
    for (var cc=cStart; cc<=cEnd; cc++){
      var nm = String(headers[cc-1]||'').trim();
      if (!nm || nm==='id' || nm==='type' || nm==='grade_min' || nm==='grade_max' || nm==='tags' || nm==='zh-TW') continue;
      targets.push({ name:nm, col:cc });
    }
  } else if (String(target).toUpperCase() === 'ALL'){
    for (var h=0; h<headers.length; h++){
      var name = String(headers[h]||'').trim();
      if (!name) continue;
      if (name==='id' || name==='type' || name==='grade_min' || name==='grade_max' || name==='tags') continue;
      if (name==='zh-TW') continue;
      targets.push({ name:name, col:h+1 });
    }
  } else {
    var tIdx = getLangCol_(headers, target);
    if (tIdx < 0){ SpreadsheetApp.getUi().alert('缺少語言欄：'+target); return; }
    targets.push({ name: target, col: tIdx+1 });
  }

  var BATCH = Math.max(10, Math.min(100, CHUNK_SIZE||50));
  var CONC = 8;
  var processed = 0; var translatedCells = 0; var verifiedNonEmpty = 0; var fallbackCalls = 0; var remainEmpty = 0;
  var startTs = new Date().getTime(); var TIME_BUDGET = 340000;

  while (processed < rows){
    var size = Math.min(200, rows - processed);
    var zhVals = cb.getRange(start+processed, zhCol, size, 1).getValues();

    // 逐個目標語言欄處理
    for (var ti=0; ti<targets.length; ti++){
      var tgt = targets[ti];
      var tgtValsExist = cb.getRange(start+processed, tgt.col, size, 1).getValues();

      var packs = [];
      var idxs = [];
      for (var i=0;i<size;i++){
        var srcRaw = String(zhVals[i][0]||'').trim();
        var srcText = srcRaw;
        if (srcRaw && srcRaw.charAt(0)==='{'){
          try{ var obj = JSON.parse(srcRaw); if (obj && typeof obj==='object' && obj.q) srcText = String(obj.q||''); }catch(e){}
        }
        var hasTgt = String(tgtValsExist[i][0]||'').trim() !== '';
        if (!srcText) continue;
        if (sel) { idxs.push(i); packs.push({ question: srcText }); }
        else { if (!hasTgt) { idxs.push(i); packs.push({ question: srcText }); } }
      }

      var cursor = 0;
      while (cursor < packs.length){
        var reqPacks = [];
        var chunkLens = [];
        var chunkStarts = [];
        for (var c=0; c<CONC && cursor < packs.length; c++){
          var thisSize = Math.min(BATCH, packs.length - cursor);
          var slice = packs.slice(cursor, cursor+thisSize);
          reqPacks.push(slice);
          chunkLens.push(thisSize);
          chunkStarts.push(cursor);
          cursor += thisSize;
        }
        var multi = callOpenAI_LocalizeBatchMulti_(reqPacks, 'zh-TW', tgt.name);
        for (var m=0;m<reqPacks.length;m++){
          var translated = multi[m] || [];
          var sizeM = chunkLens[m];
          var vals = []; var emptyIdxs = []; var t;
          for (t=0;t<sizeM;t++){
            var tr = translated[t];
            var text = '';
            if (tr && typeof tr==='object') text = String(tr.q||''); else if (typeof tr==='string') text = tr;
            if (!String(text||'').trim()) emptyIdxs.push(t);
            vals.push([text]);
          }
          if (emptyIdxs.length){
            var pack2 = [];
            for (t=0;t<emptyIdxs.length;t++){
              var idx2 = emptyIdxs[t];
              var item = reqPacks[m][idx2] || {question:''};
              pack2.push({ question: String(item.question||'') });
            }
            var fb = callOpenAI_LocalizeBatch_(pack2, 'zh-TW', tgt.name) || [];
            fallbackCalls++;
            for (t=0;t<emptyIdxs.length;t++){
              var fbTr = fb[t];
              var fbText = '';
              if (fbTr && typeof fbTr==='object') fbText = String(fbTr.q||''); else if (typeof fbTr==='string') fbText = fbTr;
              if (String(fbText||'').trim()) vals[ emptyIdxs[t] ][0] = fbText; else remainEmpty++;
            }
          }
          for (var w=0; w<sizeM; w++){
            var at = idxs[ chunkStarts[m] + w ];
            if (typeof at === 'number'){
              var val = String(vals[w] && vals[w][0] || '').trim();
              if (val){
                cb.getRange(start+processed+at, tgt.col, 1, 1).setValues([ [val] ]);
                translatedCells++;
              }
            }
          }
          SpreadsheetApp.flush();
          try{
            for (var w2=0; w2<sizeM; w2++){
              var at2 = idxs[ chunkStarts[m] + w2 ];
              if (typeof at2 === 'number'){
                var got = cb.getRange(start+processed+at2, tgt.col, 1, 1).getValue();
                if (String(got||'').trim()) verifiedNonEmpty++;
              }
            }
          } catch(e){}
        }
        Utilities.sleep(BULK_SLEEP_MS);
        if (new Date().getTime() - startTs > TIME_BUDGET) break;
      }
    }

    processed += size;
    if (new Date().getTime() - startTs > TIME_BUDGET) break;
  }
  SpreadsheetApp.getUi().alert('✅ 翻譯完成：寫入 '+translatedCells+' 個 '+(String(target).toUpperCase()==='ALL'?'ALL':target)+' 單元（來源 zh-TW），非空驗證 '+verifiedNonEmpty+'；fallback 次數 '+fallbackCalls+'；仍空白 '+remainEmpty+'。');
}

// 小步偵錯：把 QuestionBank 第 2 列寫入 content_bank（只 zh-TW 與 meta），可用來檢查表頭/權限/寫入是否正常
function debugContentBankWrite1(){
  ensureSheetsExist_()
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB)
  var cb = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT)
  if (!qb || !cb){ SpreadsheetApp.getUi().alert('缺少必要分頁'); return }
  if (qb.getLastRow() < 2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return }
  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0]
  var col = {}; for (var i=0;i<headers.length;i++){ col[String(headers[i]).trim()] = i+1 }
  var zhCol = col['zh-TW'] || col['zh-tw'] || col['ZH-TW']
  if (!zhCol){ SpreadsheetApp.getUi().alert('content_bank 缺少 zh-TW 欄'); return }
  var row = qb.getRange(2,1,1,QB_HEADERS.length).getValues()[0]
  var start = findNextWriteRow_(cb, zhCol, col['id'])
  var out = new Array(headers.length).fill('')
  if (col['id']) out[col['id']-1] = ''
  if (col['type']) out[col['type']-1] = 'typing'
  if (col['grade_min']) out[col['grade_min']-1] = String(row[1]||1)
  if (col['grade_max']) out[col['grade_max']-1] = String(row[1]||1)
  out[zhCol-1] = String(row[6]||'')
  cb.getRange(start,1,1,headers.length).setValues([out])
  SpreadsheetApp.flush()
  var confirm = cb.getRange(start,zhCol,1,1).getValue()
  cb.setActiveRange(cb.getRange(start, 1))
  SpreadsheetApp.getUi().alert('debug 寫入完成：第 '+start+' 行，zh-TW 欄內容 = '+String(confirm))
}

// 找到下一個真實可寫入的列：以 zh-TW（若無則 id）欄為準，忽略格式化造成的尾端 phantom lastRow
function findNextWriteRow_(sh, zhCol, idCol){
  var last = sh.getLastRow()
  if (last < 2) return 2
  var col = zhCol || idCol || 1
  var n = last - 1
  var vals = sh.getRange(2, col, n, 1).getValues()
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]||'').trim() !== '') {
      return 2 + i + 1
    }
  }
  return 2
}

// 補齊 content_bank 的唯一 id（格式：TS-YYYYMMDD-XXXX 序號）
function fillContentBankMissingIds(){
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_CONTENT)
  if (!sh){ SpreadsheetApp.getUi().alert('缺少 content_bank 分頁'); return }
  var last = sh.getLastRow()
  if (last < 2){ SpreadsheetApp.getUi().alert('content_bank 無資料'); return }
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]
  var col = {}; for (var i=0;i<headers.length;i++) col[headers[i]] = i+1
  if (!col['id']){ SpreadsheetApp.getUi().alert('content_bank 缺少 id 欄'); return }

  var ids = sh.getRange(2, col['id'], last-1, 1).getValues()
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd')
  var prefix = 'TS-'+today+'-'
  var seq = 0
  // 找到現有最大序號
  for (var r=0;r<ids.length;r++){
    var s = String(ids[r][0]||'')
    var m = s.match(/^TS-\d{8}-(\d{4})$/)
    if (m){ var n = parseInt(m[1],10); if (n>seq) seq=n }
  }
  var updates = []
  for (var r2=0;r2<ids.length;r2++){
    if (!String(ids[r2][0]||'').trim()){
      seq++
      var id = prefix + ('0000'+seq).slice(-4)
      updates.push([id])
    } else {
      updates.push([ids[r2][0]])
    }
  }
  sh.getRange(2, col['id'], updates.length, 1).setValues(updates)
  SpreadsheetApp.getUi().alert('✅ 已補齊 content_bank 唯一 id，共處理 '+updates.length+' 行。')
}

// 規範化文字做為去重鍵
function normalizeKey_(s){ return String(s||'').trim().replace(/\s+/g,' ').toLowerCase() }

// 簡化版：只重寫 A 欄 unit_id → 目標格式「<Letter>-<Lang>-G<grade>-<####>」
function makeSimpleUnitId_(oldUnitId, grade, fallbackSeq){
  var id = String(oldUnitId||'')
  var letter = 'X'
  var lang = 'EN'
  var seq = null
  var m
  // 取字母：LAN-X- / LANG-EN-X / -X-Language-
  m = id.match(/LAN-([A-Z])-/); if (m) letter = m[1].toUpperCase()
  if (!m){ m = id.match(/LANG-[A-Z]{2}-([A-Z])/i); if (m) letter = m[1].toUpperCase() }
  if (!m){ m = id.match(/-([A-Z])-Language-/i); if (m) letter = m[1].toUpperCase() }
  // 語言：Language-EN 或 LANG-EN
  m = id.match(/Language-([A-Z]{2})/i); if (m) lang = m[1].toUpperCase()
  if (!m){ m = id.match(/LANG-([A-Z]{2})/); if (m) lang = m[1].toUpperCase() }
  // 年級：G1..G6（允許外部傳入覆蓋）
  var g = Math.max(1, Math.min(6, Number(grade||1)))
  m = id.match(/G(\d)/); if (m) g = Math.max(1, Math.min(6, Number(m[1])))
  // 序號：尾端四位；若沒有就用 fallbackSeq
  m = id.match(/(\d{4})$/); if (m) seq = m[1]
  if (!seq) seq = padNumber_(Number(fallbackSeq||1), 4)
  return letter+'-'+lang+'-G'+g+'-'+seq
}

// 產生新的 qb_id（當天序號）
function makeQbId_(){
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd')
  if (!makeQbId_.seqDay || makeQbId_.seqDay !== today){ makeQbId_.seqDay = today; makeQbId_.seq = 0 }
  makeQbId_.seq++
  return 'QB-'+today+'-'+padNumber_(makeQbId_.seq,4)
}

// 一鍵：為 QuestionBank 生成/修復 qb_id，並可依 類別/學年/序列 重新命名 unit_id
function fixQbIdsAndRenameUnitIds(){
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB)
  if (!qb){ SpreadsheetApp.getUi().alert('缺少 QuestionBank 分頁'); return }
  var last = qb.getLastRow()
  if (last < 2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return }
  // 只讀取目前實際存在的欄位數，避免無意新增欄
  var colCount = qb.getLastColumn()
  var headers = qb.getRange(1,1,1,colCount).getValues()[0]
  var idCol = 1
  var qbIdCol = -1 // 僅在存在時回寫
  for (var h=0; h<headers.length; h++) if (String(headers[h]).trim()==='qb_id') { qbIdCol = h+1; break }
  var data = qb.getRange(2,1,last-1,colCount).getValues()
  var seqByGroup = {} // key = letter|lang|grade -> seq（僅於沒有原尾碼時使用）
  for (var i=0;i<data.length;i++){
    var unitId = String(data[i][0]||'')
    var grade  = Number(data[i][1]||1)
    var subject= String(data[i][2]||'GEN')
    var skill  = String(data[i][3]||'GEN')
    var qbId   = (qbIdCol>0) ? String(data[i][qbIdCol-1]||'') : ''

    // qb_id 欄存在才補；不存在則不新增新欄位
    if (qbIdCol>0 && !qbId){ qbId = makeQbId_(); data[i][qbIdCol-1] = qbId }

    // 重新命名 unit_id：按 類別+年級 分組的連號
    // 若原 id 無尾碼，依 letter+lang+grade 自增；否則沿用原尾碼
    var tmp = makeSimpleUnitId_(unitId, grade, 0)
    var mlg = tmp.match(/^([A-Z]+)-([A-Z]{2})-G(\d+)-(\d{4})$/)
    var key = (mlg ? (mlg[1]+'|'+mlg[2]+'|'+mlg[3]) : ('X|EN|'+grade))
    var hasTail = /\d{4}$/.test(unitId)
    var nextSeq
    if (hasTail){ nextSeq = mlg ? mlg[4] : padNumber_(1,4) }
    else { seqByGroup[key] = (seqByGroup[key]||0) + 1; nextSeq = padNumber_(seqByGroup[key],4) }
    data[i][0] = makeSimpleUnitId_(unitId, grade, nextSeq)
  }
  // 僅回寫 A 欄（unit_id），避免新增 H 欄；若有 qb_id 欄才單獨回寫該欄
  var ids = []
  for (var r=0;r<data.length;r++) ids.push([ data[r][0] ])
  qb.getRange(2,idCol,ids.length,1).setValues(ids)
  if (qbIdCol>0){
    var qbs = []
    for (var r2=0;r2<data.length;r2++) qbs.push([ data[r2][qbIdCol-1] ])
    qb.getRange(2,qbIdCol,qbs.length,1).setValues(qbs)
  }
  SpreadsheetApp.getUi().alert('✅ 已補齊 qb_id 並按 類別/年級 重新命名 unit_id（'+data.length+' 行）。')
}

// 從 QuestionBank 建立既有統計與文字集合：{ countByUnit, textSetByUnit }
function buildExistingMaps_(qb){
  var countByUnit = {}
  var textSetByUnit = {}
  var last = qb.getLastRow()
  if (last>1){
    var data = qb.getRange(2,1,last-1, QB_HEADERS.length).getValues()
    for (var i=0;i<data.length;i++){
      var uid = String(data[i][0]||'').trim()
      var text = String(data[i][6]||'').trim()
      // 視為重複：相同 Subject+Grade+Text 也算（避免不同 unit_id 的重複）
      var subj = String(data[i][2]||'').trim()
      var grade = String(data[i][1]||'').trim()
      if (!uid || !text) continue
      countByUnit[uid] = (countByUnit[uid]||0) + 1
      var set = textSetByUnit[uid] || (textSetByUnit[uid] = {})
      set[normalizeKey_(subj+'|'+grade+'|'+text)] = true
    }
  }
  return { countByUnit: countByUnit, textSetByUnit: textSetByUnit }
}

// 批內與跨批過濾新項目，避免 unit_id+Text 重複
function filterNewItems_(unitId, items, textSetByUnit){
  var set = textSetByUnit[unitId] || (textSetByUnit[unitId] = {})
  var accepted = []
  for (var i=0;i<items.length;i++){
    var key = normalizeKey_(items[i] && (items[i].subject+'|'+items[i].grade+'|'+items[i].question))
    if (!key) continue
    if (set[key]) continue // 已存在
    set[key] = true
    accepted.push(items[i])
  }
  return accepted
}

// 生成時是否即時去重（預設關閉以提升速度）
var INLINE_DEDUPE = false

// 快速去重：僅以 Text（規範化）為鍵，保留首個，刪除其他
function fastDedupeQuestionBankByText(){
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB)
  if (!qb){ SpreadsheetApp.getUi().alert('QuestionBank 缺失'); return }
  var last = qb.getLastRow()
  if (last < 2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return }
  var data = qb.getRange(2,1,last-1,QB_HEADERS.length).getValues()
  var seen = {}
  var keep = []
  for (var i=0;i<data.length;i++){
    var text = String(data[i][6]||'')
    var subj = String(data[i][2]||'')
    var grade = String(data[i][1]||'')
    var key = normalizeKey_(subj+'|'+grade+'|'+text)
    if (!key) continue
    if (seen[key]) continue
    seen[key] = true
    keep.push(data[i])
  }
  qb.getRange(2,1,last-1,QB_HEADERS.length).clearContent()
  if (keep.length) qb.getRange(2,1,keep.length,QB_HEADERS.length).setValues(keep)
  SpreadsheetApp.getUi().alert('✅ 快速去重完成，保留 '+keep.length+' 行（按 Text 首見保留）。')
}

// 生成時是否跳過即時去重（為提速，之後用一鍵去重處理）
var GENERATION_SKIP_DEDUP = true

function getBigrams_(s){
  var t = normalizeKey_(s)
  var grams = {}
  for (var i=0;i<t.length-1;i++) grams[t.slice(i,i+2)] = true
  return grams
}
function jaccardBigramSim_(a, b){
  var A = getBigrams_(a), B = getBigrams_(b)
  var inter = 0, uni = 0
  var k
  for (k in A){ if (A.hasOwnProperty(k)){ if (B[k]) inter++; uni++; } }
  for (k in B){ if (B.hasOwnProperty(k) && !A[k]) uni++; }
  return uni>0 ? inter/uni : 0
}
function smartDedupeQuestionBank(threshold){
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB)
  if (!qb){ SpreadsheetApp.getUi().alert('QuestionBank 不存在'); return }
  var last = qb.getLastRow()
  if (last<2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return }
  var rows = qb.getRange(2,1,last-1,QB_HEADERS.length).getValues()
  var byUnit = {}
  for (var i=0;i<rows.length;i++){
    var uid = String(rows[i][0]||'').trim()
    if (!byUnit[uid]) byUnit[uid] = []
    byUnit[uid].push(rows[i])
  }
  var keepAll = []
  var th = (typeof threshold==='number' && threshold>0 && threshold<=1) ? threshold : 0.9
  for (var uid in byUnit){ if (!byUnit.hasOwnProperty(uid)) continue
    var arr = byUnit[uid]
    var keep = []
    for (var j=0;j<arr.length;j++){
      var cur = arr[j]
      var text = String(cur[6]||'')
      if (!text){ keep.push(cur); continue }
      var dup = false
      for (var k=0;k<keep.length;k++){
        var prev = String(keep[k][6]||'')
        if (!prev) continue
        if (Math.abs(prev.length - text.length) > 6) continue
        var sim = jaccardBigramSim_(prev, text)
        if (sim >= th){ dup = true; break }
      }
      if (!dup) keep.push(cur)
    }
    for (var m=0;m<keep.length;m++) keepAll.push(keep[m])
  }
  // 清空並寫回
  qb.getRange(2,1,last-1,QB_HEADERS.length).clearContent()
  if (keepAll.length) qb.getRange(2,1,keepAll.length,QB_HEADERS.length).setValues(keepAll)
  SpreadsheetApp.getUi().alert('✅ 去重/相似合併完成：原 '+rows.length+' → 保留 '+keepAll.length+'（閾值 '+th+'）')
}

function smartDedupePrompt(){
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('智能去重（相似合併）', '輸入相似度閾值（0.80~0.98，預設 0.90）', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var v = parseFloat(String(resp.getResponseText()||'').replace(',', '.'));
  if (!(v>0 && v<1)) v = 0.90;
  smartDedupeQuestionBank(v);
}

function padNumber_(n, width){
  var s = String(Math.floor(Math.max(0, n)));
  while (s.length < width) s = '0' + s;
  return s;
}

function renumberIndexUnitIdsByGrade(){
  ensureIndex_();
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!sh || sh.getLastRow()<2){ SpreadsheetApp.getUi().alert('index 無資料'); return; }

  var last = sh.getLastRow();
  var rows = sh.getRange(2,1,last-1, sh.getLastColumn()).getValues();
  // 收集資料：unit_id, subject, strand, skill, grade_min, grade_max
  var recs = [];
  for (var i=0;i<rows.length;i++){
    recs.push({
      row: i+2,
      subj: String(rows[i][1]||''),
      strand: String(rows[i][2]||'GEN'),
      skill: String(rows[i][3]||'GEN'),
      gmin: Number(rows[i][5]||1),
      gmax: Number(rows[i][6]||1)
    });
  }
  // 按年級升冪、原順序排序
  recs.sort(function(a,b){ return (a.gmin||1)-(b.gmin||1) || (a.row-b.row); });

  // 各年級獨立序號
  var seqByGrade = {1:0,2:0,3:0,4:0,5:0,6:0};
  var newIds = [];
  for (var j=0;j<recs.length;j++){
    var r = recs[j];
    var g = Math.max(1, Math.min(6, r.gmin||1));
    seqByGrade[g] = (seqByGrade[g]||0) + 1;
    var s1 = r.strand.replace(/\s+/g,'').toUpperCase().slice(0,3) || 'GEN';
    var s2 = r.skill.replace(/\s+/g,'').toUpperCase().slice(0,3) || 'GEN';
    var id = (r.subj||'GEN').toUpperCase()+'-G'+g+'-'+s1+'-'+s2+'-'+padNumber_(seqByGrade[g], 4);
    newIds.push({ row:r.row, id:id });
  }

  // 寫回 unit_id，清空狀態/時間
  var idCol = 1; // unit_id
  for (var k=0;k<newIds.length;k++){
    sh.getRange(newIds[k].row, idCol).setValue(newIds[k].id);
  }
  if (sh.getLastColumn() >= 14){
    sh.getRange(2,12,last-1,2).clearContent();
  }
  SpreadsheetApp.getUi().alert('✅ 已依年級重編 unit_id：共 '+newIds.length+' 行。');
}

function appendByIndexSelectionAddN(){
  ensureApiKey_(); ensureSheetsExist_();
  var idx = SpreadsheetApp.getActive().getSheetByName(SHEET_INDEX);
  if (!idx){ SpreadsheetApp.getUi().alert('請先生成 index（⑨）。'); return; }
  var sel = idx.getActiveRange();
  if (!sel || sel.getRow()==1){ SpreadsheetApp.getUi().alert('請選擇 index 的數據行（不要包含表頭）。'); return; }

  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt('選區追加', '每個單元要追加多少筆？（忽略 index.count）', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var addN = parseInt(String(resp.getResponseText()||'').trim(), 10);
  if (!(addN>0)){ ui.alert('請輸入正整數'); return; }

  var cfgUi = readUi_();
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  var start = sel.getRow();
  var rows = sel.getNumRows();

  var SKIP = GENERATION_SKIP_DEDUP === true;
  var textSetByUnit = null;
  if (!SKIP){
    var maps = buildExistingMaps_(qb);
    textSetByUnit = maps.textSetByUnit;
  }

  var producedTotal = 0;

  for (var r=0; r<rows; r++){
    var rec = idx.getRange(start+r,1,1,15).getValues()[0];
    if (!rec || !String(rec[1]||'').trim()) continue;
    var unit = {
      unit_id: String(rec[0]||'').trim(),
      subject: String(rec[1]||'Language-EN'),
      strand:  String(rec[2]||''),
      skill:   String(rec[3]||''),
      ib:      String(rec[4]||''),
      gmin:    Math.max(1, Math.min(6, Number(rec[5]||1))),
      gmax:    Math.max(1, Math.min(6, Number(rec[6]||1))),
      curve:   String(rec[7]||'easy>medium>hard'),
      ctx:     String(rec[8]||''),
      style:   String(rec[9]||''),
      count:   Math.max(1, Math.min(1000, Number(rec[10]||cfgUi.count))),
      seed:    String(rec[11]||'')
    };
    if (!unit.unit_id) unit.unit_id = buildUnitId_(unit);

    var made = 0;
    while (made < addN){
      var remaining = addN - made;
      var perBatch = Math.min(100, remaining);

      var grades = [], gi; for (gi=unit.gmin; gi<=unit.gmax; gi++) grades.push(gi);
      var parts = unit.curve.indexOf('>')>-1 ? unit.curve.split('>') : [unit.curve];
      var perDiffCount = Math.max(1, Math.floor(perBatch / parts.length));

      var produced = 0, di;
      for (gi=0; gi<grades.length; gi++){
        for (di=0; di<parts.length; di++){
          var diff = String(parts[di]||'medium').toLowerCase();
          var want = Math.min(perDiffCount, addN - made - produced);
          if (want <= 0) break;
          var items = generateQuestionsByUnit_(unit, grades[gi], diff, want);
          items = maybeLocalizeToZhTW_(unit, items);
          if (!SKIP && textSetByUnit){ items = filterNewItems_(unit.unit_id, items, textSetByUnit); }
          if (items && items.length){
            produced += writeUnitItemsAppend_(qb, unit.unit_id, items, 10);
            Utilities.sleep(BULK_SLEEP_MS);
          }
        }
      }
      if (produced === 0) break;
      made += produced;
    }
    idx.getRange(start+r,12,1,3).setValues([[ 'append', new Date(), rec[14] ]]);
    producedTotal += made;
  }
  SpreadsheetApp.getUi().alert('✅ 已追加完成：本次共新寫入 '+producedTotal+' 條'+(SKIP?'（已跳過即時去重）':'（含即時去重）')+'。');
}

function cleanQuestionBankRemoveBracketsAndTags(){
  var qb = SpreadsheetApp.getActive().getSheetByName(SHEET_QB);
  if (!qb){ SpreadsheetApp.getUi().alert('缺少 QuestionBank 分頁'); return; }
  var last = qb.getLastRow();
  if (last < 2){ SpreadsheetApp.getUi().alert('QuestionBank 無資料'); return; }

  var rangeStart = 2;
  var rowsCount = last - 1;
  var sel = qb.getActiveRange();
  if (sel && sel.getRow() > 1){
    rangeStart = sel.getRow();
    rowsCount = sel.getNumRows();
  }

  var data = qb.getRange(rangeStart, 1, rowsCount, QB_HEADERS.length).getValues();
  var before = data.length;
  var keep = [];
  var removed = 0;
  var rxBracket = /[()（）]/;            // 中英括號
  var rxHtmlTag = /<[^>]+>/;             // HTML 標籤（如 <b>..</b>）

  for (var i=0;i<data.length;i++){
    var row = data[i];
    var text = String(row[6]||'');
    if (!text){ keep.push(row); continue; }
    if (rxBracket.test(text) || rxHtmlTag.test(text)) { removed++; continue; }
    keep.push(row);
  }

  // 清空原範圍並寫回保留列
  qb.getRange(rangeStart, 1, rowsCount, QB_HEADERS.length).clearContent();
  if (keep.length) qb.getRange(rangeStart, 1, keep.length, QB_HEADERS.length).setValues(keep);

  SpreadsheetApp.getUi().alert('✅ 清潔完成：原 '+before+' 行 → 保留 '+keep.length+' 行（刪除 '+removed+' 行）。');
}

/* =================== 導出 content_bank → JSON（分頁） =================== */
function exportContentBankToJsonPrompt(){
  ensureSheetsExist_();
  var ui = safeGetUi_();
  if (!ui){ Logger.log('no UI'); return; }
  var resp1 = ui.prompt('導出 content_bank', '輸入語言（如 zh-TW / en-US / ALL）：', ui.ButtonSet.OK_CANCEL);
  if (resp1.getSelectedButton() !== ui.Button.OK) return;
  var lang = String(resp1.getResponseText()||'').trim() || 'ALL';
  var resp2 = ui.prompt('每頁筆數', '建議 1000（最大 5000）', ui.ButtonSet.OK_CANCEL);
  if (resp2.getSelectedButton() !== ui.Button.OK) return;
  var pageSize = Math.max(1, Math.min(5000, parseInt(String(resp2.getResponseText()||'1000'),10)||1000));
  var out = exportContentBankToJson(lang, pageSize);
  ui.alert('✅ 導出完成', '資料夾：'+out.folderName+'\n語言：'+out.lang+'\n檔數：'+out.files+'（含 index.json）', ui.ButtonSet.OK);
}

// 導出資料夾名稱：TypeSprout-Export-content_bank-<lang>-YYYYMMDD-HHMM
function exportContentBankToJson(lang, pageSize){
  var ss = SpreadsheetApp.getActive();
  var cb = ss.getSheetByName(SHEET_CONTENT);
  if (!cb) throw new Error('缺少 content_bank 分頁');
  var headers = cb.getRange(1,1,1,cb.getLastColumn()).getValues()[0];
  var col = {}; for (var i=0;i<headers.length;i++) col[String(headers[i]).trim()] = i+1;
  var last = cb.getLastRow(); if (last<2) return { folderName:'(空)', lang:lang, files:0 };

  function nowStr(){ return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm'); }
  var langs = [];
  if (String(lang||'ALL').toUpperCase()==='ALL'){
    for (var h=0; h<headers.length; h++){
      var nm = String(headers[h]||'').trim();
      if (!nm || nm==='id' || nm==='type' || nm==='grade_min' || nm==='grade_max' || nm==='tags' || nm==='zh-TW') continue;
      langs.push(nm);
    }
  } else {
    if (!col[lang]) throw new Error('找不到語言欄：'+lang);
    langs.push(lang);
  }

  var folderName = 'TypeSprout-Export-content_bank-'+(langs.length>1?'ALL':langs[0])+'-'+nowStr();
  var folder = DriveApp.createFolder(folderName);

  var totalRows = last - 1;
  var meta = { version: 1, totalRows: totalRows, pageSize: pageSize, langs: langs, generatedAt: new Date().toISOString() };

  // 逐語言輸出
  var files = 0;
  var filesPerLang = {};
  for (var li=0; li<langs.length; li++){
    var langName = langs[li];
    var lcol = col[langName]; if (!lcol) continue;
    var targetFolder = (langs.length>1) ? folder.createFolder(langName) : folder;
    var page = 1;
    var offset = 0;
    while (offset < totalRows){
      var size = Math.min(pageSize, totalRows - offset);
      var rows = cb.getRange(2+offset, 1, size, cb.getLastColumn()).getValues();
      var items = [];
      for (var r=0; r<rows.length; r++){
        var row = rows[r];
        var id = String(row[col['id']-1]||'');
        var tp = String(row[col['type']-1]||'');
        var gm = Number(row[col['grade_min']-1]||1);
        var gx = Number(row[col['grade_max']-1]||6);
        var tags = String(row[col['tags']-1]||'');
        var text = String(row[lcol-1]||'');
        items.push({ id:id, lang:langName, type:tp, grade_min:gm, grade_max:gx, tags:tags, text:text });
      }
      var body = { items: items, page: page, next: (offset+size<totalRows) ? (page+1) : null };
      var file = targetFolder.createFile('page-'+padNumber_(page,4)+'.json', JSON.stringify(body), 'application/json');
      file.setDescription('content_bank export '+langName+' page '+page);
      files++;
      filesPerLang[langName] = (filesPerLang[langName]||0) + 1;
      offset += size; page++;
    }
  }
  folder.createFile('index.json', JSON.stringify(Object.assign({}, meta, { filesPerLang: filesPerLang })), 'application/json');
  return { folderName: folder.getName(), lang: (langs.length>1?'ALL':langs[0]), files: files+1 };
}
