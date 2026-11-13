'use strict';
// Budget – Ausgaben erfassen, Monat im Blick. Reines JS, Daten lokal in IndexedDB.
// Bei Änderungen APP_VER hochzählen, damit iPhone und Mac das Update bekommen.
const APP_VER = '1.0.0';

/* ---------- Hilfen ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const money = c => EUR.format(c / 100);
const money0 = c => EUR0.format(Math.round(c / 100));
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const monthOf = iso => iso.slice(0, 7);
const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const monthName = ym => MONTHS[+ym.slice(5, 7) - 1];
const monthLabel = ym => `${monthName(ym)} ${ym.slice(0, 4)}`;
const shiftMonth = (ym, d) => { const x = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + d, 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`; };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayLabel = iso => {
  if (iso === todayISO()) return 'Heute';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'Gestern';
  const d = new Date(iso + 'T12:00:00');
  return `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}.`;
};
// "12,50" · "12.50" · "1.234,56" · "1234" → Cent
function parseMoney(s) {
  s = String(s || '').replace(/[\s€]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s)) return NaN;
  const v = Math.round(parseFloat(s) * 100);
  return Number.isFinite(v) ? v : NaN;
}
const centsToInput = c => c ? (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100)) : '';

const COLORS = ['#2F7DBF', '#2E8A6F', '#C27A12', '#8A5BC8', '#C2417A', '#5E6B7D', '#B8572B', '#3E8E3A', '#1E8FA0'];

/* ---------- Speicher (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => {
      const r = indexedDB.open('budget', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async get(k) { const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
};

/* ---------- Zustand ---------- */
const S = { cats: [], tx: [], setup: false };
const UI = { cur: monthOf(todayISO()), filter: null, showAll: false, sheet: null };

function defaultCats() {
  const out = ['Wohnen', 'Lebensmittel', 'Auto', 'Freizeit', 'Abos'];
  const inc = ['Gehalt', 'Sonstiges'];
  return [
    ...out.map((n, i) => ({ id: uid() + i, name: n, kind: 'out', color: COLORS[i], budget: 0 })),
    ...inc.map((n, i) => ({ id: uid() + 'i' + i, name: n, kind: 'in', color: COLORS[i + 1], budget: 0 }))
  ];
}
async function load() {
  try {
    const d = await DB.get('state');
    if (d) Object.assign(S, d);
  } catch (e) { console.warn('Laden fehlgeschlagen', e); }
  if (!S.cats.length) S.cats = defaultCats();
}
let saveP = Promise.resolve();
function save() {
  const snap = JSON.parse(JSON.stringify({ cats: S.cats, tx: S.tx, setup: S.setup }));
  saveP = saveP.then(() => DB.set('state', snap)).catch(e => toast('Speichern fehlgeschlagen'));
  return saveP;
}
const catById = id => S.cats.find(c => c.id === id);
const activeCats = kind => S.cats.filter(c => c.kind === kind && !c.archived);

/* ---------- Router ---------- */
function route() {
  const h = location.hash || '#/';
  if (!S.setup) return renderWelcome();
  if (h.startsWith('#/settings')) return renderSettings();
  if (h.startsWith('#/add')) { history.replaceState(null, '', '#/'); renderHome(); return openAdd(); }
  renderHome();
}
function setTab(t) { document.querySelectorAll('.nav-i').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }

/* ---------- Willkommen ---------- */
function renderWelcome() {
  $('#nav').hidden = true;
  const cats = activeCats('out');
  $('#view').innerHTML = `
    <h1 class="page-h">Willkommen bei Budget</h1>
    <p class="lead">Wie viel willst du pro Monat ausgeben? Trag ein, was du weißt – alles lässt sich später in den Einstellungen ändern.</p>
    <div class="card">
      ${cats.map(c => `
        <div class="set-row">
          <span class="dot" style="background:${c.color}"></span>
          <span style="flex:1;font-size:17px;font-weight:700">${esc(c.name)}</span>
          <label class="bud"><input class="num" inputmode="decimal" data-bud="${c.id}" placeholder="0" aria-label="Monatsbudget ${esc(c.name)}" value="${centsToInput(c.budget)}"><span>€</span></label>
        </div>`).join('')}
    </div>
    <button class="btn primary" style="width:100%" data-a="finishSetup">Los geht's</button>`;
}

/* ---------- Übersicht ---------- */
function monthData(ym) {
  const tx = S.tx.filter(t => monthOf(t.date) === ym);
  const out = tx.filter(t => t.type === 'out'), inc = tx.filter(t => t.type === 'in');
  const byCat = {};
  out.forEach(t => byCat[t.cat] = (byCat[t.cat] || 0) + t.amount);
  return { tx, spent: out.reduce((a, t) => a + t.amount, 0), income: inc.reduce((a, t) => a + t.amount, 0), byCat };
}

function renderHome() {
  $('#nav').hidden = false; setTab('home');
  const ym = UI.cur, d = monthData(ym), now = monthOf(todayISO());
  const cats = S.cats.filter(c => c.kind === 'out' && (!c.archived || d.byCat[c.id]));
  const budget = cats.reduce((a, c) => a + (c.budget || 0), 0);
  const left = budget - d.spent, pct = budget ? d.spent / budget : 0;

  let sub = '';
  if (budget) sub = left >= 0
    ? `von ${money0(budget)} · noch <b class="num">${money0(left)}</b> übrig`
    : `<span class="over">von ${money0(budget)} · <b class="num" style="color:inherit">${money0(-left)}</b> darüber</span>`;
  else sub = `Leg in den Einstellungen Monatsbudgets fest.`;

  const catRows = cats.map(c => {
    // Rot ab 80 % – aber nicht, wenn das Budget genau aufgebraucht ist (z. B. Miete)
    const s = d.byCat[c.id] || 0, b = c.budget || 0, p = b ? s / b : 0, warn = b && p >= 0.8 && s !== b;
    let line;
    if (!b) line = s ? 'ohne Budget' : 'noch nichts ausgegeben';
    else if (s > b) line = `<b class="num">${money0(s - b)}</b> über ${money0(b)}`;
    else if (s === b) line = `genau aufgebraucht · ${money0(b)}`;
    else line = `noch <b class="num">${money0(b - s)}</b> von ${money0(b)}${warn ? ' · <span class="tag-warn">fast aufgebraucht</span>' : ''}`;
    return `<button class="cat${warn ? ' warn' : ''}" data-a="filter" data-id="${c.id}" aria-pressed="${UI.filter === c.id}">
      <div class="cat-top"><span class="cat-n"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="cat-v num">${money0(s)}</span></div>
      <div class="cat-sub">${line}</div>
      ${b ? `<div class="cat-bar"><div style="width:${Math.min(100, p * 100).toFixed(1)}%"></div></div>` : ''}
    </button>`;
  }).join('');

  let list = d.tx.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const fc = UI.filter && catById(UI.filter);
  if (fc) list = list.filter(t => t.cat === fc.id);
  const shown = UI.showAll ? list : list.slice(0, 8);

  $('#view').innerHTML = `
    <div class="month-bar">
      <button class="icon-btn" data-a="month" data-d="-1" aria-label="Vorheriger Monat"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h1>${monthLabel(ym)}</h1>
      <button class="icon-btn" data-a="month" data-d="1" aria-label="Nächster Monat" ${ym >= now ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>
    <section class="hero">
      <p class="hero-l">Ausgegeben im ${monthName(ym)}</p>
      <p class="hero-n num" id="spent">${money(d.spent)}</p>
      <p class="hero-s">${sub}</p>
      ${budget ? `<div class="hero-bar${pct >= 0.8 ? ' warn' : ''}"><div style="width:${Math.min(100, pct * 100).toFixed(1)}%"></div></div>` : ''}
      ${d.income ? `<p class="hero-in">Einnahmen <b class="num">${money0(d.income)}</b> · Saldo <b class="num" style="color:${d.income - d.spent < 0 ? 'var(--danger)' : 'var(--income)'}">${d.income - d.spent >= 0 ? '+' : '−'}${money0(Math.abs(d.income - d.spent))}</b></p>` : ''}
    </section>

    <div class="sec-h"><h2>Kategorien</h2><span>${budget ? Math.round(pct * 100) + ' % vom Budget' : ''}</span></div>
    <div class="card">${catRows || '<div class="empty">Keine Kategorien</div>'}</div>

    <div class="sec-h"><h2>${fc ? 'Buchungen · ' + esc(fc.name) : 'Buchungen'}</h2>${fc ? `<button class="more-btn" style="width:auto;padding:0" data-a="filter" data-id="">Alle zeigen</button>` : `<span>${d.tx.length || ''}</span>`}</div>
    <div class="card">
      ${shown.length ? shown.map(txRow).join('') : `<div class="empty"><b>${fc ? 'Hier noch nichts' : 'Noch keine Buchungen'}</b>Tipp auf + und erfass deine erste Ausgabe.</div>`}
      ${list.length > shown.length ? `<button class="more-btn" data-a="showAll">Alle ${list.length} anzeigen</button>` : ''}
    </div>`;
}

function txRow(t) {
  const c = catById(t.cat) || { name: 'Ohne Kategorie', color: '#888' };
  const title = t.note || c.name;
  const sub = `${dayLabel(t.date)}${t.note ? ' · ' + esc(c.name) : ''}`;
  return `<button class="tx" data-a="edit" data-id="${t.id}">
    <span class="tx-ic" style="background:${c.color}22;color:${c.color}">${esc(c.name[0] || '?')}</span>
    <span class="tx-m"><div class="tx-t">${esc(title)}</div><div class="tx-d">${sub}</div></span>
    <span class="tx-a num${t.type === 'in' ? ' in' : ''}">${t.type === 'in' ? '+' : '−'}${money(t.amount)}</span>
  </button>`;
}

/* ---------- Erfassen / Bearbeiten ---------- */
function openAdd(edit) {
  const t = edit ? { ...edit } : { type: 'out', amount: 0, cat: null, date: todayISO(), note: '' };
  UI.sheet = t;
  $('#sheetTitle').textContent = edit ? 'Buchung bearbeiten' : 'Neue Buchung';
  drawAdd();
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  const a = $('#fAmt');
  a.focus({ preventScroll: true });
  if (edit) a.select();
}
function drawAdd(keepInputs) {
  const t = UI.sheet, edit = !!t.id;
  const prev = keepInputs ? { amt: $('#fAmt').value, date: $('#fDate').value, note: $('#fNote').value } : null;
  const cats = activeCats(t.type);
  $('#sheet .sheet-body').innerHTML = `
    <div class="seg" role="tablist">
      <button role="tab" data-a="type" data-t="out" class="${t.type === 'out' ? 'on' : ''}" aria-selected="${t.type === 'out'}">Ausgabe</button>
      <button role="tab" data-a="type" data-t="in" class="${t.type === 'in' ? 'on' : ''}" aria-selected="${t.type === 'in'}">Einnahme</button>
    </div>
    <label class="amt"><input id="fAmt" class="num" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Betrag in Euro" value="${prev ? esc(prev.amt) : centsToInput(t.amount)}"><span>€</span></label>
    <div class="err" id="fErr" hidden></div>
    <div class="row2">
      <label class="fld"><span>Datum</span><input id="fDate" type="date" value="${prev ? prev.date : t.date}" max="${todayISO()}"></label>
      <label class="fld"><span>Notiz</span><input id="fNote" placeholder="${t.type === 'out' ? 'z. B. Billa' : 'z. B. Lohn'}" value="${esc(prev ? prev.note : t.note)}" maxlength="60" enterkeyhint="done"></label>
    </div>
    <p class="pick-h">${edit ? 'Kategorie' : 'Kategorie antippen – wird sofort gespeichert'}</p>
    <div class="chips">
      ${cats.map(c => `<button class="chip${t.cat === c.id ? ' on' : ''}" data-a="pick" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
    </div>
    ${edit ? `<div class="sheet-foot"><button class="btn danger" data-a="delTx">Löschen</button><button class="btn primary wide" data-a="saveTx">Speichern</button></div>` : ''}`;
}
function readSheet() {
  const t = UI.sheet;
  const amount = parseMoney($('#fAmt').value);
  const err = $('#fErr');
  if (!(amount > 0)) {
    err.textContent = 'Gib zuerst einen Betrag ein'; err.hidden = false;
    $('#fAmt').focus(); return null;
  }
  if (amount > 100000000) { err.textContent = 'Der Betrag ist zu groß'; err.hidden = false; return null; }
  if (!t.cat) { err.textContent = 'Wähl eine Kategorie'; err.hidden = false; return null; }
  return { ...t, amount, date: $('#fDate').value || todayISO(), note: $('#fNote').value.trim() };
}
async function commitTx() {
  const t = readSheet(); if (!t) return;
  const isNew = !t.id;
  if (isNew) { t.id = uid(); t.created = Date.now(); S.tx.push(t); }
  else S.tx[S.tx.findIndex(x => x.id === t.id)] = t;
  await save();
  closeSheet();
  UI.cur = monthOf(t.date);
  if (UI.filter && UI.filter !== t.cat) UI.filter = null;
  location.hash = '#/'; route();
  toast(isNew ? `${money(t.amount)} · ${catById(t.cat)?.name} gespeichert` : 'Änderung gespeichert');
}
function closeSheet() {
  $('#sheet').hidden = true; UI.sheet = null;
  document.body.style.overflow = '';
}

/* ---------- Einstellungen ---------- */
function renderSettings() {
  $('#nav').hidden = false; setTab('settings');
  const out = activeCats('out'), inc = activeCats('in');
  const sum = out.reduce((a, c) => a + (c.budget || 0), 0);
  const theme = (() => { try { return localStorage.getItem('budget.theme') || 'auto'; } catch (e) { return 'auto'; } })();
  const row = (c, withBudget) => `
    <div class="set-row">
      <button class="dot" style="background:${c.color}" data-a="color" data-id="${c.id}" aria-label="Farbe von ${esc(c.name)} ändern"></button>
      <input class="name" data-name="${c.id}" value="${esc(c.name)}" maxlength="24" aria-label="Name der Kategorie">
      ${withBudget ? `<label class="bud"><input class="num" inputmode="decimal" data-bud="${c.id}" placeholder="0" value="${centsToInput(c.budget)}" aria-label="Monatsbudget ${esc(c.name)}"><span>€</span></label>` : ''}
      <button class="icon-btn del" data-a="delCat" data-id="${c.id}" aria-label="${esc(c.name)} entfernen"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg></button>
    </div>`;
  $('#view').innerHTML = `
    <h1 class="page-h">Einstellungen</h1>
    <div class="sec-h" style="margin-top:0"><h2>Ausgaben-Kategorien</h2><span>Budget pro Monat</span></div>
    <div class="card">
      ${out.map(c => row(c, true)).join('')}
      <form class="add-cat" data-form="out"><input placeholder="Neue Kategorie" maxlength="24" aria-label="Neue Ausgaben-Kategorie"><button class="btn" type="submit">Hinzufügen</button></form>
      <div class="set-sum"><span>Monatsbudget gesamt</span><b class="num" id="budSum">${money0(sum)}</b></div>
    </div>
    <div class="sec-h"><h2>Einnahmen-Kategorien</h2></div>
    <div class="card">
      ${inc.map(c => row(c, false)).join('')}
      <form class="add-cat" data-form="in"><input placeholder="Neue Kategorie" maxlength="24" aria-label="Neue Einnahmen-Kategorie"><button class="btn" type="submit">Hinzufügen</button></form>
    </div>
    <div class="sec-h"><h2>Darstellung</h2></div>
    <div class="card">
      <div class="theme">
        ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button data-a="theme" data-t="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <p class="note">Deine Daten liegen nur auf diesem Gerät. Version ${APP_VER}</p>`;
}

/* ---------- Toast ---------- */
let toastT;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  if (action) el.querySelector('button').onclick = () => { el.hidden = true; action.fn(); };
  clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, action ? 6000 : 2600);
}

/* ---------- Aktionen ---------- */
const A = {
  add() { openAdd(); },
  closeSheet,
  edit(el) { const t = S.tx.find(x => x.id === el.dataset.id); if (t) openAdd(t); },
  type(el) {
    const t = UI.sheet; if (t.type === el.dataset.t) return;
    t.type = el.dataset.t; t.cat = null; drawAdd(true);
  },
  pick(el) {
    UI.sheet.cat = el.dataset.id;
    if (UI.sheet.id) { document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); return; }
    commitTx();
  },
  saveTx: commitTx,
  async delTx() {
    const t = S.tx.find(x => x.id === UI.sheet.id); if (!t) return;
    S.tx = S.tx.filter(x => x !== t); await save(); closeSheet(); route();
    toast('Buchung gelöscht', { label: 'Rückgängig', fn: async () => { S.tx.push(t); await save(); route(); } });
  },
  month(el) { UI.cur = shiftMonth(UI.cur, +el.dataset.d); UI.filter = null; UI.showAll = false; renderHome(); },
  filter(el) { const id = el.dataset.id || null; UI.filter = UI.filter === id ? null : id; UI.showAll = false; renderHome(); },
  showAll() { UI.showAll = true; renderHome(); },
  async finishSetup() {
    document.querySelectorAll('[data-bud]').forEach(i => { const c = catById(i.dataset.bud); const v = parseMoney(i.value); c.budget = v > 0 ? v : 0; });
    S.setup = true; await save(); location.hash = '#/'; route();
  },
  async color(el) {
    const c = catById(el.dataset.id); c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length];
    el.style.background = c.color; await save();
  },
  async delCat(el) {
    const c = catById(el.dataset.id);
    if (activeCats(c.kind).length <= 1) return toast('Mindestens eine Kategorie muss bleiben');
    const used = S.tx.some(t => t.cat === c.id);
    if (used) c.archived = true; else S.cats = S.cats.filter(x => x !== c);
    await save(); renderSettings();
    toast(`${c.name} entfernt`, { label: 'Rückgängig', fn: async () => { if (used) delete c.archived; else S.cats.push(c); await save(); renderSettings(); } });
  },
  theme(el) {
    const t = el.dataset.t;
    try { t === 'auto' ? localStorage.removeItem('budget.theme') : localStorage.setItem('budget.theme', t); } catch (e) {}
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    renderSettings();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  e.preventDefault(); fn(el);
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('[data-form]'); if (!f) return;
  e.preventDefault();
  const name = f.querySelector('input').value.trim(); if (!name) return;
  const kind = f.dataset.form;
  S.cats.push({ id: uid(), name, kind, color: COLORS[S.cats.filter(c => c.kind === kind).length % COLORS.length], budget: 0 });
  await save(); renderSettings();
  const inp = document.querySelector(`[data-form="${kind}"] input`); if (inp) inp.focus();
});
// Name & Budget direkt beim Tippen speichern
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'fAmt') { const er = $('#fErr'); if (er) er.hidden = true; return; }
  if (el.dataset.name) { const c = catById(el.dataset.name); if (el.value.trim()) { c.name = el.value.trim(); save(); } }
  if (el.dataset.bud && S.setup) {
    const c = catById(el.dataset.bud), v = parseMoney(el.value);
    c.budget = v > 0 ? v : 0; save();
    const s = $('#budSum'); if (s) s.textContent = money0(activeCats('out').reduce((a, x) => a + (x.budget || 0), 0));
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  if (e.key === 'Enter' && UI.sheet && e.target.closest('#sheet') && e.target.tagName === 'INPUT' && UI.sheet.id) { e.preventDefault(); commitTx(); }
  // Mac: „n" öffnet Erfassen
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey && S.setup && $('#sheet').hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); openAdd(); }
});
window.addEventListener('hashchange', () => { if (!$('#sheet').hidden) closeSheet(); route(); });
// Neuer Tag / neuer Monat, wenn die App lange offen bleibt
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden && S.setup && !location.hash.startsWith('#/settings')) renderHome(); });

/* ---------- Start ---------- */
(async () => {
  await load();
  route();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js?v=' + APP_VER).catch(() => {});
})();
