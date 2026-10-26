/**
 * 語音速記後端（Google Apps Script）
 * 收到手機傳來的錄音或文字 → 呼叫 Gemini 轉文字並整理 → 存成 .md 到 Google Drive 指定資料夾
 *
 * 指令碼屬性（專案設定 → 指令碼屬性）：
 *   GEMINI_API_KEY  必填，Google AI Studio 申請
 *   TOKEN           必填，自己訂一組通關密語，手機 App 設定時填同一組
 *   FOLDER_NAME     選填，預設 voice-notes（放在「我的雲端硬碟」第一層）
 *   AUDIO_FOLDER_NAME 選填，預設 voice-notes-audio（原始錄音 .wav）
 *   GEMINI_MODEL    選填，預設 gemini-3.8-flash
 *   DICTIONARY      選填，常用專有名詞，逗號分隔；不填用下面的預設清單
 */

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_FOLDER = 'voice-notes';
const DEFAULT_AUDIO_FOLDER = 'voice-notes-audio';
const DEFAULT_DICTIONARY = [
  'DDR1', 'Discoidin Domain Receptor 1', 'IDD', 'intervertebral disc degeneration',
  'NP cell', 'nucleus pulposus', 'annulus fibrosus', 'GLP-1', 'exosome', 'MSC', 'iPSC',
  'senescence', 'SASP', 'p16', 'p21', 'qPCR', 'Western blot', 'collagen', 'UVA',
].join(', ');

function doGet() {
  return json({ ok: true, message: '語音速記後端運作中' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    if (!req.token || req.token !== props.getProperty('TOKEN')) {
      return json({ ok: false, error: '通關密語不對' });
    }
    const folderName = props.getProperty('FOLDER_NAME') || DEFAULT_FOLDER;
    if (req.action === 'ping') return json({ ok: true, folder: folderName });
    if (req.action !== 'save') return json({ ok: false, error: '未知的動作' });

    // 同一則筆記重送時（例如上次存好了但回應沒傳回手機），直接回傳先前的結果，避免重複檔案
    const cache = CacheService.getScriptCache();
    const done = cache.get('done_' + req.id);
    if (done) return json(JSON.parse(done));

    const note = buildNote(req, props);
    const filename = makeFilename(req.createdAt, note.title);

    // 錄音存到另一個資料夾（Mac 搬檔只搬 .md，錄音留在 Drive），筆記裡放連結
    if (req.type === 'audio') {
      const audioFolder = getFolder(props.getProperty('AUDIO_FOLDER_NAME') || DEFAULT_AUDIO_FOLDER);
      const blob = Utilities.newBlob(Utilities.base64Decode(req.audio), req.mime || 'audio/wav', filename.replace(/\.md$/, '.wav'));
      note.audioUrl = audioFolder.createFile(blob).getUrl();
    }

    getFolder(folderName).createFile(filename, renderMarkdown(req, note), 'text/markdown');

    const result = { ok: true, filename: filename, title: note.title, cleaned: note.cleaned };
    cache.put('done_' + req.id, JSON.stringify(result), 21600);
    return json(result);
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- Gemini ----------

function buildNote(req, props) {
  if (req.type === 'text' && !req.clean) {
    const text = String(req.text || '').trim();
    return { title: text.split('\n')[0].slice(0, 24), cleaned: text, transcript: '', tags: [] };
  }

  const dictionary = props.getProperty('DICTIONARY') || DEFAULT_DICTIONARY;
  const instructions = [
    '你是一位筆記助理。使用者是細胞生物學／骨科學研究者，會用繁體中文夾雜英文專有名詞記錄突然冒出的想法。',
    req.type === 'audio' ? '請先把錄音逐字轉成文字（transcript），保留原話。' : '原始文字就是使用者的輸入（transcript 請原樣回傳）。',
    '再整理成 cleaned：刪掉贅字（嗯、那個、就是）、合併講錯又改口的地方、保留原意與語氣，不要自行補充內容；',
    '若內容有多個要點或待辦，用 Markdown 條列（待辦用 "- [ ] "）。',
    '一律使用台灣繁體中文與全形標點，英文專有名詞保留英文。',
    '常見專有名詞（請優先依此拼寫）：' + dictionary + '。',
    'title：10～20 字的標題，不含標點與斜線。tags：1～3 個簡短中文或英文標籤。',
  ].join('\n');

  const parts = [{ text: instructions }];
  if (req.type === 'audio') {
    parts.push({ inline_data: { mime_type: req.mime || 'audio/wav', data: req.audio } });
  } else {
    parts.push({ text: '原始文字：\n' + req.text });
  }

  const model = props.getProperty('GEMINI_MODEL') || DEFAULT_MODEL;
  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': props.getProperty('GEMINI_API_KEY') },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' },
              cleaned: { type: 'STRING' },
              transcript: { type: 'STRING' },
              tags: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['title', 'cleaned', 'transcript', 'tags'],
          },
        },
      }),
    }
  );

  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini 錯誤：' + (body.error && body.error.message || res.getResponseCode()));
  }
  const text = body.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
  return JSON.parse(text);
}

// ---------- 檔案 ----------

function getFolder(name) {
  const it = DriveApp.getRootFolder().getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(name);
}

// createdAt 是手機端的當地時間，例如 2026-10-25T14:32:05-04:00；直接取字串，時區不會跑掉
function makeFilename(createdAt, title) {
  const date = createdAt.slice(0, 10);
  const time = createdAt.slice(11, 13) + createdAt.slice(14, 16);
  const safe = String(title || '速記').replace(/[\\/:*?"<>|#\n\r\t]/g, '').replace(/\s+/g, '-').slice(0, 40);
  return date + '_' + time + '_' + safe + '.md';
}

function renderMarkdown(req, note) {
  const tags = (note.tags || []).map(function (t) { return String(t).replace(/[,\[\]]/g, ''); });
  const lines = [
    '---',
    'title: "' + String(note.title).replace(/"/g, '\'') + '"',
    'created: ' + req.createdAt,
    'device: ' + (req.device || ''),
    'source: ' + (req.type === 'audio' ? 'voice' : 'text'),
  ];
  if (req.seconds) lines.push('duration_sec: ' + req.seconds);
  if (note.audioUrl) lines.push('audio: ' + note.audioUrl);
  lines.push('tags: [' + tags.join(', ') + ']', 'status: inbox', '---', '', '# ' + note.title, '');
  if (note.audioUrl) lines.push('🎧 [原始錄音](' + note.audioUrl + ')', '');
  lines.push(note.cleaned.trim(), '');
  if (note.transcript && note.transcript.trim() && note.transcript.trim() !== note.cleaned.trim()) {
    lines.push('## 原始逐字稿', '', note.transcript.trim(), '');
  }
  return lines.join('\n');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
