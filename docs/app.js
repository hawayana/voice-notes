// 語音速記 PWA
// 錄音 → 16 kHz 單聲道 WAV → 先存進 IndexedDB 佇列 → 送到 Apps Script（Gemini 整理 + 存 Google Drive）
// 網路失敗時留在佇列，下次打開或恢復連線時自動重送，想法不會丟

const TARGET_RATE = 16000;
const MAX_SECONDS = 300;
const HISTORY_KEY = 'vn.history';
const CONFIG_KEY = 'vn.config';

const $ = (id) => document.getElementById(id);

// ---------- 設定 ----------
function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
}
function saveConfig(cfg) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}
let config = loadConfig();

function guessDevice() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return 'Web';
}

function openSettings(show) {
  $('settings').classList.toggle('hidden', !show);
  if (show) {
    $('urlInput').value = config.url || '';
    $('tokenInput').value = config.token || '';
    $('deviceInput').value = config.device || guessDevice();
  }
}
$('settingsBtn').onclick = () => openSettings($('settings').classList.contains('hidden'));
$('saveSettingsBtn').onclick = () => {
  config = {
    url: $('urlInput').value.trim(),
    token: $('tokenInput').value.trim(),
    device: $('deviceInput').value.trim() || guessDevice(),
  };
  saveConfig(config);
  openSettings(false);
  setStatus('設定已儲存', 'ok');
  flushQueue();
};
$('testBtn').onclick = async () => {
  const url = $('urlInput').value.trim();
  const token = $('tokenInput').value.trim();
  if (!url) return setStatus('請先填 Apps Script 網址', 'err');
  setStatus('測試中…');
  try {
    const res = await post(url, { action: 'ping', token });
    setStatus(res.ok ? `✅ 連線成功，檔案會存到 Drive 的「${res.folder}」` : `❌ ${res.error}`, res.ok ? 'ok' : 'err');
  } catch (e) {
    setStatus('❌ 連不上：' + e.message, 'err');
  }
};

// ---------- 分頁 ----------
function showTab(voice) {
  $('tabVoice').classList.toggle('active', voice);
  $('tabText').classList.toggle('active', !voice);
  $('voicePane').classList.toggle('hidden', !voice);
  $('textPane').classList.toggle('hidden', voice);
}
$('tabVoice').onclick = () => showTab(true);
$('tabText').onclick = () => { showTab(false); $('textInput').focus(); };

// ---------- 狀態與紀錄 ----------
function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg || '';
  el.className = kind || '';
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function addHistory(item) {
  const list = [item, ...loadHistory()].slice(0, 15);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
  renderHistory();
}
function renderHistory() {
  const list = loadHistory();
  const ul = $('history');
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'meta';
    li.textContent = '還沒有紀錄';
    ul.append(li);
    return;
  }
  for (const h of list) {
    const li = document.createElement('li');
    const t = document.createElement('div');
    t.textContent = h.title;
    const m = document.createElement('div');
    m.className = 'meta';
    m.textContent = `${h.when} · ${h.filename}`;
    li.append(t, m);
    ul.append(li);
  }
}

function showResult(res) {
  const box = $('result');
  box.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = res.title;
  const p = document.createElement('div');
  p.textContent = res.cleaned;
  box.append(h, p);
  $('resultCard').classList.remove('hidden');
}

// ---------- 時間 ----------
function pad(n) { return String(n).padStart(2, '0'); }
function localStamp(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const tz = `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tz}`;
}
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- IndexedDB 佇列 ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('voice-notes', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('queue', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbDo(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', mode);
    const out = fn(tx.objectStore('queue'));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
const queuePut = (item) => dbDo('readwrite', (s) => s.put(item));
const queueDelete = (id) => dbDo('readwrite', (s) => s.delete(id));
const queueAll = () => dbDo('readonly', (s) => s.getAll());

async function renderQueueInfo() {
  let items = [];
  try { items = await queueAll(); } catch {}
  const el = $('queueInfo');
  el.replaceChildren();
  if (!items.length) return;
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const head = document.createElement('div');
  head.append(`📮 還有 ${items.length} 則等待上傳`);
  const retry = document.createElement('button');
  retry.textContent = '全部重試';
  retry.onclick = flushQueue;
  head.append(retry);
  el.append(head);

  // 逐則列出：哪一則卡住、為什麼卡住，必要時可以單獨刪掉
  const ul = document.createElement('ul');
  ul.className = 'list pending';
  for (const item of items) {
    const li = document.createElement('li');
    const label = item.type === 'audio' ? `🎙️ 錄音 ${item.seconds || '?'} 秒` : `⌨️ ${item.text.slice(0, 12)}…`;
    li.append(`${item.createdAt.slice(5, 16).replace('T', ' ')} · ${label}`);
    const del = document.createElement('button');
    del.textContent = '刪除';
    del.onclick = async () => {
      if (!confirm('確定刪除這則還沒上傳的筆記？刪掉就找不回來了。')) return;
      await queueDelete(item.id);
      renderQueueInfo();
    };
    li.append(del);
    if (item.lastError) {
      const m = document.createElement('div');
      m.className = 'meta';
      m.textContent = '上次失敗：' + item.lastError;
      li.append(m);
    }
    ul.append(li);
  }
  el.append(ul);
}

// ---------- 上傳 ----------
const UPLOAD_TIMEOUT_MS = 150000;

async function post(url, payload) {
  // 不設 Content-Type → 瀏覽器用 text/plain，屬於 simple request，Apps Script 不需處理 CORS preflight
  // 加逾時：連線卡住時不會一直佔著上傳流程，讓「重試」按了沒反應
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('等太久沒回應');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

let flushing = false;
async function flushQueue() {
  if (flushing) {
    setStatus('⏳ 正在上傳中，請稍候…');
    return;
  }
  if (!config.url || !config.token) {
    setStatus('請先按右上角 ⚙️ 完成設定', 'err');
    openSettings(true);
    return;
  }
  flushing = true;
  let failed = 0;
  try {
    const items = (await queueAll()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const n = items.length > 1 ? `（${i + 1}/${items.length}）` : '';
      setStatus((item.type === 'audio' ? '🧠 AI 轉文字整理中…' : '💾 存檔中…') + n);
      try {
        const res = await post(config.url, { ...item, action: 'save', token: config.token, device: config.device || guessDevice() });
        if (!res.ok) {
          // 後端有回應但處理失敗（例如 Gemini 忙線）：記下原因，繼續處理下一則，不讓一則卡住全部
          item.lastError = res.error || '未知錯誤';
          await queuePut(item);
          failed++;
          continue;
        }
        await queueDelete(item.id);
        addHistory({ title: res.title, filename: res.filename, when: item.createdAt.slice(0, 16).replace('T', ' ') });
        showResult(res);
        setStatus(`✅ 已存檔：${res.filename}`, 'ok');
      } catch (e) {
        // 網路斷線或逾時：後面幾則也一定失敗，先停下來
        item.lastError = e.message;
        await queuePut(item);
        setStatus(`⚠️ 先存在手機裡，稍後重送（${e.message}）`, 'err');
        return;
      }
    }
    if (failed) setStatus(`⚠️ 有 ${failed} 則沒成功，原因列在下面，可以按「全部重試」`, 'err');
  } finally {
    flushing = false;
    await renderQueueInfo();
  }
}
window.addEventListener('online', flushQueue);

// ---------- 文字模式 ----------
$('saveTextBtn').onclick = async () => {
  const text = $('textInput').value.trim();
  if (!text) return setStatus('還沒有內容', 'err');
  await queuePut({ id: uuid(), type: 'text', text, clean: $('cleanCheck').checked, createdAt: localStamp() });
  $('textInput').value = '';
  renderQueueInfo();
  flushQueue();
};

// ---------- 錄音 ----------
let rec = null; // { ctx, stream, node, source, chunks, start, timerId, wakeLock }

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor 已被標為過時，但 Android Chrome／iPad Safari／Mac 都還支援，且不需額外檔案
  const node = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(node);
  node.connect(ctx.destination);

  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}

  rec = { ctx, stream, node, source, chunks, start: Date.now(), wakeLock, createdAt: localStamp() };
  rec.timerId = setInterval(() => {
    const s = Math.floor((Date.now() - rec.start) / 1000);
    $('timer').textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
    if (s >= MAX_SECONDS) stopRecording();
  }, 250);

  $('recBtn').classList.add('recording');
  $('recBtn').textContent = '⏹';
  $('recBtn').setAttribute('aria-label', '停止錄音');
  $('recHint').textContent = '錄音中…講完按一下停止';
  setStatus('');
}

async function stopRecording() {
  if (!rec) return;
  const r = rec;
  rec = null;
  clearInterval(r.timerId);
  r.node.disconnect();
  r.source.disconnect();
  r.stream.getTracks().forEach((t) => t.stop());
  try { r.wakeLock?.release(); } catch {}
  const rate = r.ctx.sampleRate;
  await r.ctx.close();

  $('recBtn').classList.remove('recording');
  $('recBtn').textContent = '🎙️';
  $('recBtn').setAttribute('aria-label', '開始錄音');
  $('recHint').textContent = '按一下開始講，再按一下結束（最長 5 分鐘）';
  $('timer').textContent = '0:00';

  const seconds = (Date.now() - r.start) / 1000;
  if (seconds < 1) return setStatus('太短了，再講一次', 'err');

  const wav = encodeWav(downsample(merge(r.chunks), rate, TARGET_RATE), TARGET_RATE);
  await queuePut({ id: uuid(), type: 'audio', audio: await toBase64(wav), mime: 'audio/wav', createdAt: r.createdAt, seconds: Math.round(seconds) });
  renderQueueInfo();
  flushQueue();
}

$('recBtn').onclick = async () => {
  if (rec) return stopRecording();
  if (!config.url || !config.token) {
    setStatus('請先按右上角 ⚙️ 完成設定', 'err');
    return openSettings(true);
  }
  $('recBtn').disabled = true;
  try {
    await startRecording();
  } catch (e) {
    setStatus('沒辦法使用麥克風：' + e.message, 'err');
  } finally {
    $('recBtn').disabled = false;
  }
};

// ---------- WAV 編碼 ----------
function merge(chunks) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function downsample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(data.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), data.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- 啟動 ----------
renderHistory();
renderQueueInfo();
if (!config.url) openSettings(true); else flushQueue();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
