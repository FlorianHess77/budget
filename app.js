'use strict';
// Budget – Ausgaben erfassen, Monat im Blick. Reines JS, Daten lokal in IndexedDB.
// Bei Änderungen APP_VER hochzählen, damit iPhone und Mac das Update bekommen.
const APP_VER = '1.5.0';

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

// Geprüfte Reihenfolge (farbschwächen-tauglich). Rot fehlt absichtlich – das ist der Warnung vorbehalten.
const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6'];
const DAY = 864e5;
// Schwarz oder Weiß – je nachdem, was auf der Farbe besser lesbar ist
const inkOn = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  const L = .2126 * r + .7152 * g + .0722 * b;
  return 1.05 / (L + .05) >= (L + .05) / .0611 ? '#FFFFFF' : '#0B0D11';
};
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();

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
const S = { cats: [], tx: [], rec: [], setup: false, firstUse: 0, lastBackup: 0, snooze: 0 };
const KEYS = ['cats', 'tx', 'rec', 'setup', 'firstUse', 'lastBackup', 'snooze'];
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
  const snap = JSON.parse(JSON.stringify(Object.fromEntries(KEYS.map(k => [k, S[k]]))));
  saveP = saveP.then(() => DB.set('state', snap)).catch(e => toast('Speichern fehlgeschlagen'));
  return saveP;
}
const catById = id => S.cats.find(c => c.id === id);
const recById = id => S.rec.find(r => r.id === id);

/* ---------- Fixkosten (wiederkehrende Buchungen) ---------- */
// r.every = Abstand in Monaten (1, 2, 3, 6, 12), r.day = Tag, r.start = erster fälliger Monat,
// r.last = zuletzt gebuchter Monat. Legt alle fälligen Buchungen bis heute an.
const EVERY = { 1: 'monatlich', 2: 'alle 2 Monate', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };
const every = r => r.every || 1;
const nextMonth = r => r.last ? shiftMonth(r.last, every(r)) : r.start;
const nextDue = r => { const m = nextMonth(r); return `${m}-${pad(Math.min(r.day, daysIn(m)))}`; };
const perMonth = r => r.amount / every(r);
const longDate = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function materialize() {
  const now = todayISO(), curM = monthOf(now), today = +now.slice(8);
  let added = 0;
  for (const r of S.rec) {
    let m = nextMonth(r);
    while (m <= curM) {
      const d = Math.min(r.day, daysIn(m));
      if (m === curM && d > today) break;
      // nie doppelt im selben Monat buchen (z. B. nach Änderung des Datums)
      if (!S.tx.some(t => t.recId === r.id && monthOf(t.date) === m)) {
        S.tx.push({ id: uid(), type: r.type, amount: r.amount, cat: r.cat, date: `${m}-${pad(d)}`, note: r.note, recId: r.id, created: Date.now() });
        added++;
      }
      r.last = m; m = shiftMonth(m, every(r));
    }
  }
  if (added) save();
  return added;
}
const activeCats = kind => S.cats.filter(c => c.kind === kind && !c.archived);

/* ---------- Router ---------- */
function route() {
  const h = location.hash || '#/';
  if (!S.setup) return renderWelcome();
  if (h.startsWith('#/settings')) return renderSettings();
  if (h.startsWith('#/stats')) return renderStats();
  if (h.startsWith('#/help')) return renderHelp();
  if (h.startsWith('#/fixed')) return renderFixed();
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
    <button class="btn primary" style="width:100%" data-a="finishSetup">Los geht's</button>
    <p class="note" style="text-align:center;padding-top:16px">Unten im Reiter <b>Hilfe</b> ist später alles Schritt für Schritt erklärt.</p>`;
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
    return `<div class="cat${warn ? ' warn' : ''}">
      <button class="cat-main" data-a="catHist" data-id="${c.id}" aria-label="Verlauf von ${esc(c.name)} anzeigen">
        <div class="cat-top"><span class="cat-n"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="cat-v num">${money0(s)}</span></div>
        <div class="cat-sub">${line}</div>
        ${b ? `<div class="cat-bar"><div style="width:${Math.min(100, p * 100).toFixed(1)}%"></div></div>` : ''}
      </button>
      ${c.archived ? '' : `<button class="cat-add" data-a="addTo" data-id="${c.id}" style="background:${c.color};color:${inkOn(c.color)}" aria-label="Ausgabe zu ${esc(c.name)} hinzufügen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}
    </div>`;
  }).join('');

  let list = d.tx.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0));
  const fc = UI.filter && catById(UI.filter);
  if (fc) list = list.filter(t => t.cat === fc.id);
  const shown = UI.showAll ? list : list.slice(0, 8);

  $('#view').innerHTML = `
    ${monthBar(ym)}
    <section class="hero">
      <p class="hero-l">Ausgegeben im ${monthName(ym)}</p>
      <p class="hero-n num" id="spent">${money(d.spent)}</p>
      <p class="hero-s">${sub}</p>
      ${budget ? `<div class="hero-bar${pct >= 0.8 ? ' warn' : ''}"><div style="width:${Math.min(100, pct * 100).toFixed(1)}%"></div></div>` : ''}
      ${d.income ? `<p class="hero-in">Einnahmen <b class="num">${money0(d.income)}</b> · Saldo <b class="num" style="color:${d.income - d.spent < 0 ? 'var(--danger)' : 'var(--income)'}">${d.income - d.spent >= 0 ? '+' : '−'}${money0(Math.abs(d.income - d.spent))}</b></p>` : ''}
    </section>
    ${backupNag()}
    <div class="sec-h"><h2>Kategorien</h2><span>${budget ? Math.round(pct * 100) + ' % vom Budget' : ''}</span></div>
    <div class="card">${catRows || '<div class="empty">Keine Kategorien</div>'}</div>

    <div class="sec-h"><h2>${fc ? 'Buchungen · ' + esc(fc.name) : 'Buchungen'}</h2>${fc ? `<button class="more-btn" style="width:auto;padding:0" data-a="filter" data-id="">Alle zeigen</button>` : `<span>${d.tx.length || ''}</span>`}</div>
    <div class="card">
      ${shown.length ? shown.map(txRow).join('') : `<div class="empty"><b>${fc ? 'Hier noch nichts' : 'Noch keine Buchungen'}</b>Tipp auf + und erfass deine erste Ausgabe.</div>`}
      ${list.length > shown.length ? `<button class="more-btn" data-a="showAll">Alle ${list.length} anzeigen</button>` : ''}
    </div>`;
}

function monthBar(ym) {
  const now = monthOf(todayISO());
  return `<div class="month-bar">
      <button class="icon-btn" data-a="month" data-d="-1" aria-label="Vorheriger Monat"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <h1>${monthLabel(ym)}</h1>
      <button class="icon-btn" data-a="month" data-d="1" aria-label="Nächster Monat" ${ym >= now ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>`;
}

// Dezente Erinnerung: ab 5 Buchungen, wenn das letzte Backup über 30 Tage her ist
function backupNag() {
  const since = S.lastBackup || S.firstUse || Date.now();
  if (S.tx.length < 5 || Date.now() - since < 30 * DAY || Date.now() < (S.snooze || 0)) return '';
  const msg = S.lastBackup ? `Dein letztes Backup ist ${Math.floor((Date.now() - S.lastBackup) / DAY)} Tage alt.` : 'Du hast noch kein Backup gespeichert.';
  return `<div class="nag" role="note"><p><b>${msg}</b> Deine Daten liegen nur auf diesem Gerät.</p>
    <div class="nag-b"><button class="btn" data-a="snooze">Später</button><button class="btn primary" data-a="backup">Jetzt sichern</button></div></div>`;
}

function txRow(t) {
  const c = catById(t.cat) || { name: 'Ohne Kategorie', color: '#888' };
  const title = t.note || c.name;
  const sub = `${dayLabel(t.date)}${t.note ? ' · ' + esc(c.name) : ''}${t.recId && recById(t.recId) ? ` · <span class="rec-mark">${EVERY[every(recById(t.recId))]}</span>` : ''}`;
  return `<button class="tx" data-a="edit" data-id="${t.id}">
    <span class="tx-ic" style="background:${c.color};color:${inkOn(c.color)}">${esc(c.name[0] || '?')}</span>
    <span class="tx-m"><div class="tx-t">${esc(title)}</div><div class="tx-d">${sub}</div></span>
    <span class="tx-a num${t.type === 'in' ? ' in' : ''}">${t.type === 'in' ? '+' : '−'}${money(t.amount)}</span>
  </button>`;
}

/* ---------- Erfassen / Bearbeiten (Buchung oder wiederkehrend) ---------- */
// UI.sheet.mode: 'tx' = einzelne Buchung, 'rec' = wiederkehrende Buchung
function openAdd(edit, cat) {
  const t = edit ? { ...edit, mode: 'tx' } : { mode: 'tx', type: (cat && catById(cat)?.kind) || 'out', amount: 0, cat: cat || null, date: todayISO(), note: '', repeat: false, preset: !!cat };
  openSheet(t, edit ? 'Buchung bearbeiten' : 'Neue Buchung', !!edit);
}
function openRec(edit) {
  const t = edit ? { ...edit, mode: 'rec', every: every(edit), next: nextDue(edit) } : { mode: 'rec', type: 'out', amount: 0, cat: null, every: 1, next: todayISO(), note: '' };
  openSheet(t, edit ? 'Fixkosten bearbeiten' : 'Neue Fixkosten', !!edit);
}
function openSheet(t, title, select) {
  UI.sheet = t;
  $('#sheetTitle').textContent = title;
  drawAdd();
  $('#toast').hidden = true;
  $('#sheet').hidden = false;
  document.body.style.overflow = 'hidden';
  const a = $('#fAmt');
  a.focus({ preventScroll: true });
  if (select) a.select();
}
function drawAdd(keepInputs) {
  const t = UI.sheet, edit = !!t.id, rec = t.mode === 'rec';
  const prev = keepInputs ? { amt: $('#fAmt').value, date: $('#fDate')?.value, every: $('#fEvery')?.value, next: $('#fNext')?.value, note: $('#fNote').value } : null;
  const cats = activeCats(t.type);
  const curM = monthOf(todayISO());
  const instant = !rec && !edit;
  const parent = !rec && t.recId && recById(t.recId);
  $('#sheet .sheet-body').innerHTML = `
    <div class="seg" role="tablist">
      <button role="tab" data-a="type" data-t="out" class="${t.type === 'out' ? 'on' : ''}" aria-selected="${t.type === 'out'}">Ausgabe</button>
      <button role="tab" data-a="type" data-t="in" class="${t.type === 'in' ? 'on' : ''}" aria-selected="${t.type === 'in'}">Einnahme</button>
    </div>
    <label class="amt"><input id="fAmt" class="num" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Betrag in Euro" value="${prev ? esc(prev.amt) : centsToInput(t.amount)}"><span>€</span></label>
    <div class="err" id="fErr" hidden></div>
    <label class="note-f"><span>Notiz – wofür?</span><input id="fNote" placeholder="${t.type === 'out' ? (rec ? 'z. B. Miete, Handy, Netflix' : 'z. B. Billa, Tanken, Friseur') : 'z. B. Lohn'}" value="${esc(prev ? prev.note : t.note)}" maxlength="60" enterkeyhint="done" autocapitalize="sentences"></label>
    <div class="sugg" id="fSugg">${suggHtml()}</div>
    ${rec
      ? `<div class="row2">
          <label class="fld"><span>Wie oft</span><select id="fEvery">${Object.entries(EVERY).map(([k, l]) => `<option value="${k}"${+k === +(prev?.every || t.every) ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="fld"><span>${edit ? 'Nächstes Mal am' : 'Erstes Mal am'}</span><input id="fNext" type="date" value="${prev?.next || t.next}"></label>
        </div>
        <p class="note" style="padding:0 2px 14px;margin-top:-8px" id="fNextHint">${nextHint(prev?.next || t.next)}</p>`
      : `<div class="row1"><label class="fld"><span>Datum</span><input id="fDate" type="date" value="${prev ? prev.date : t.date}" max="${todayISO()}"></label></div>`}
    ${instant ? `<label class="tgl"><input type="checkbox" id="fRepeat" ${t.repeat ? 'checked' : ''}><span>Jeden Monat wiederholen</span></label>` : ''}
    ${parent ? `<p class="note" style="padding:0 2px 12px">Gehört zu den Fixkosten „${esc(parent.note || catById(parent.cat)?.name)}“ (${EVERY[every(parent)]}). Änderungen gelten nur für diese Buchung.</p>` : ''}
    <p class="pick-h">${instant && !t.preset ? 'Kategorie antippen – wird sofort gespeichert' : 'Kategorie'}</p>
    <div class="chips">
      ${cats.map(c => `<button class="chip${t.cat === c.id ? ' on' : ''}" data-a="pick" data-id="${c.id}"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('')}
    </div>
    ${instant && !t.preset ? '' : `<div class="sheet-foot">${edit ? `<button class="btn danger" data-a="${rec ? 'delRec' : 'delTx'}">Löschen</button>` : ''}<button class="btn primary wide" data-a="saveTx">Speichern</button></div>`}
    ${rec && edit ? `<p class="note" style="padding:12px 2px 0">Änderungen gelten ab der nächsten Buchung. Was schon gebucht ist, bleibt, wie es ist.</p>` : ''}`;
}
// Häufigste Notizen – aus der gewählten Kategorie, sonst aus allen (dann mit passender Kategorie)
function topNotes(cat, type, n = 6) {
  const m = new Map();
  for (const t of S.tx) {
    if (t.type !== type || !t.note || (cat && t.cat !== cat)) continue;
    const k = t.note.trim().toLowerCase();
    const e = m.get(k) || { note: t.note.trim(), n: 0, last: '', cats: {} };
    e.n++; e.cats[t.cat] = (e.cats[t.cat] || 0) + 1;
    if (t.date >= e.last) { e.last = t.date; e.note = t.note.trim(); }
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, n)
    .map(e => ({ note: e.note, cat: Object.entries(e.cats).sort((a, b) => b[1] - a[1])[0][0] }));
}
function suggHtml() {
  const t = UI.sheet; if (!t) return '';
  const cat = t.cat && catById(t.cat) && !catById(t.cat).archived ? t.cat : null;
  const list = topNotes(cat, t.type).filter(x => cat || activeCats(t.type).some(c => c.id === x.cat));
  if (!list.length) return '';
  return `<span class="sugg-l">${cat ? 'Häufig bei ' + esc(catById(cat).name) : 'Häufig'}:</span>` +
    list.map(x => `<button type="button" data-a="sugg" data-note="${esc(x.note)}" data-cat="${x.cat}">${esc(x.note)}</button>`).join('');
}
function nextHint(iso) {
  if (!iso) return '';
  return iso <= todayISO() ? 'Liegt heute oder in der Vergangenheit – wird beim Speichern gleich gebucht.' : `Wird am ${longDate(iso)} automatisch gebucht.`;
}
function readSheet() {
  const t = UI.sheet;
  const amount = parseMoney($('#fAmt').value);
  const err = $('#fErr');
  const fail = m => { err.textContent = m; err.hidden = false; return null; };
  if (!(amount > 0)) { $('#fAmt').focus(); return fail('Gib zuerst einen Betrag ein'); }
  if (amount > 100000000) return fail('Der Betrag ist zu groß');
  if (!t.cat || !catById(t.cat)) return fail('Wähl eine Kategorie');
  const base = { ...t, amount, note: $('#fNote').value.trim() };
  if (t.mode === 'rec') {
    base.every = +$('#fEvery').value; base.next = $('#fNext').value;
    if (!/^\d{4}-\d\d-\d\d$/.test(base.next)) return fail('Wähl ein Datum für die erste Buchung');
  }
  else { base.date = $('#fDate').value || todayISO(); base.repeat = $('#fRepeat') ? $('#fRepeat').checked : false; }
  return base;
}
async function commitTx() {
  const t = readSheet(); if (!t) return;
  const isNew = !t.id;
  const { mode, repeat, now, preset, ...data } = t;
  let msg;
  if (mode === 'rec') {
    const base = { type: data.type, amount: data.amount, cat: data.cat, note: data.note, every: data.every };
    const day = +data.next.slice(8), start = monthOf(data.next);
    let r;
    if (isNew) { r = { id: uid(), ...base, day, start, last: null }; S.rec.push(r); }
    else {
      r = recById(data.id); Object.assign(r, base);
      // Nur wenn das nächste Datum geändert wurde, neu ausrichten
      if (data.next !== nextDue(r)) { r.day = day; r.start = start; r.last = null; }
    }
    const n = materialize();
    msg = isNew ? `Fixkosten gespeichert${n ? ' – erste Buchung angelegt' : ''}` : 'Fixkosten geändert';
    await save(); closeSheet(); renderFixed(); toast(msg); return;
  }
  if (isNew) {
    data.id = uid(); data.created = Date.now();
    if (repeat) {
      const r = { id: uid(), type: data.type, amount: data.amount, cat: data.cat, every: 1, day: +data.date.slice(8), note: data.note, start: monthOf(data.date), last: monthOf(data.date) };
      S.rec.push(r); data.recId = r.id;
    }
    S.tx.push(data);
    if (repeat) materialize();
    msg = `${money(data.amount)} · ${catById(data.cat)?.name} gespeichert${repeat ? ' – ab jetzt monatlich (siehe Fixkosten)' : ''}`;
  } else {
    S.tx[S.tx.findIndex(x => x.id === data.id)] = data;
    msg = 'Änderung gespeichert';
  }
  await save();
  closeSheet();
  UI.cur = monthOf(data.date);
  if (UI.filter && UI.filter !== data.cat) UI.filter = null;
  if (location.hash.startsWith('#/stats')) renderStats(); else { location.hash = '#/'; route(); }
  toast(msg);
}
function closeSheet() {
  $('#sheet').hidden = true; UI.sheet = null;
  document.body.style.overflow = '';
  if (UI.confirm) { const r = UI.confirm; UI.confirm = null; r(false); }
}
// Bestätigung im eigenen Fenster (große, gut lesbare Knöpfe)
function askConfirm({ title, text, ok }) {
  return new Promise(resolve => {
    if (UI.confirm) UI.confirm(false);
    UI.confirm = resolve; UI.sheet = null;
    $('#sheetTitle').textContent = title;
    $('#sheet .sheet-body').innerHTML = `<p class="confirm-t">${text}</p>
      <div class="sheet-foot"><button class="btn wide" data-a="confirmNo">Abbrechen</button><button class="btn danger-solid wide" data-a="confirmYes">${esc(ok)}</button></div>`;
    $('#toast').hidden = true;
    $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
    $('[data-a="confirmNo"]').focus();
  });
}

/* ---------- Einstellungen ---------- */
function renderSettings() {
  $('#nav').hidden = false; setTab('settings');
  const out = activeCats('out'), inc = activeCats('in');
  const sum = out.reduce((a, c) => a + (c.budget || 0), 0);
  const theme = (() => { try { return localStorage.getItem('budget.theme') || 'auto'; } catch (e) { return 'auto'; } })();
  const fs = document.documentElement.dataset.fs || 'm';
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
    <div class="sec-h"><h2>Daten</h2></div>
    <div class="card">
      <div class="data-btns">
        <button class="btn" data-a="backup">Backup speichern</button>
        <button class="btn" data-a="restore">Backup laden</button>
        <button class="btn" data-a="csv">CSV exportieren</button>
      </div>
      <p class="note">${S.lastBackup ? `Letztes Backup: ${new Date(S.lastBackup).toLocaleDateString('de-AT')}.` : 'Noch kein Backup gespeichert.'} Deine Daten liegen nur auf diesem Gerät. Zum Übertragen aufs andere Gerät: hier Backup speichern, dort Backup laden.</p>
    </div>
    <div class="sec-h"><h2>Darstellung</h2></div>
    <div class="card">
      <p class="pick-h" style="margin:14px 2px 0">Schriftgröße</p>
      <div class="theme fs">
        ${[['m', 'Normal'], ['l', 'Groß'], ['xl', 'Sehr groß']].map(([k, l]) => `<button data-a="fs" data-f="${k}" class="${fs === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <p class="pick-h" style="margin:6px 2px 0">Farben</p>
      <div class="theme">
        ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([k, l]) => `<button data-a="theme" data-t="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
    </div>
    <p class="note">Version ${APP_VER}</p>`;
}

/* ---------- Verlauf einer Kategorie ---------- */
function openHistory(id) {
  const c = catById(id); if (!c) return;
  UI.sheet = null; UI.hist = id;
  const ym = UI.cur, b = c.budget || 0;
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(ym, -i));
  const sums = months.map(m => S.tx.filter(t => t.cat === id && monthOf(t.date) === m).reduce((a, t) => a + t.amount, 0));
  const max = Math.max(b, ...sums, 1);
  const s = sums[0], p = b ? s / b : 0, warn = b && p >= .8 && s !== b;
  const all = S.tx.filter(t => t.cat === id).sort((a, x) => x.date.localeCompare(a.date) || (x.created || 0) - (a.created || 0));
  const shown = UI.histAll ? all : all.slice(0, 30);
  let lastM = '', list = '';
  for (const t of shown) {
    const m = monthOf(t.date);
    if (m !== lastM) { list += `<div class="hist-h">${monthLabel(m)}</div>`; lastM = m; }
    list += txRow(t);
  }
  const avg = sums.filter(Boolean).length ? sums.filter(Boolean).reduce((a, v) => a + v, 0) / sums.filter(Boolean).length : 0;
  $('#sheetTitle').innerHTML = `<span class="dot" style="background:${c.color};display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:10px"></span>${esc(c.name)}`;
  $('#sheet .sheet-body').innerHTML = `
    <div class="hist-sum">
      <p class="hero-l">Ausgegeben im ${monthName(ym)}</p>
      <p class="hist-n num"${warn || (b && s > b) ? ' style="color:var(--danger)"' : ''}>${money(s)}</p>
      <p class="hero-s">${b ? (s > b ? `<b class="num" style="color:var(--danger)">${money0(s - b)}</b> über ${money0(b)}` : `noch <b class="num">${money0(b - s)}</b> von ${money0(b)}`) : 'ohne Monatsbudget'}</p>
    </div>
    <div class="sec-h" style="margin-top:18px"><h2>Letzte 6 Monate</h2><span>Ø ${money0(avg)}</span></div>
    <div class="hist-ms">
      ${months.map((m, i) => `<div class="hist-m${i === 0 ? ' cur' : ''}">
        <span class="hist-ml">${MON3[+m.slice(5) - 1]}${m.slice(0, 4) !== ym.slice(0, 4) ? ' ' + m.slice(2, 4) : ''}</span>
        <span class="hist-mb"><span style="width:${(sums[i] / max * 100).toFixed(1)}%;background:${b && sums[i] > b ? 'var(--danger)' : c.color}"></span>${b ? `<i style="left:${(b / max * 100).toFixed(1)}%"></i>` : ''}</span>
        <span class="hist-mv num">${money0(sums[i])}</span>
      </div>`).join('')}
    </div>
    ${b ? '<p class="note" style="padding:6px 0 0">Der Strich zeigt dein Monatsbudget.</p>' : ''}
    <div class="sec-h"><h2>Alle Buchungen</h2><span>${all.length}</span></div>
    <div class="hist-list">${list || '<div class="empty"><b>Noch keine Buchungen</b>Mit dem Knopf unten fügst du die erste hinzu.</div>'}
      ${all.length > shown.length ? `<button class="more-btn" data-a="histAll">Alle ${all.length} anzeigen</button>` : ''}</div>
    <div class="sheet-foot hist-foot"><button class="btn primary wide" data-a="addTo" data-id="${c.id}">+ Ausgabe zu ${esc(c.name)}</button></div>`;
  $('#toast').hidden = true;
  $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
  $('#sheet .sheet-card').scrollTop = 0;
}

/* ---------- Fixkosten ---------- */
function renderFixed() {
  $('#nav').hidden = false; setTab('fixed');
  const out = S.rec.filter(r => r.type === 'out'), inc = S.rec.filter(r => r.type === 'in');
  const pm = out.reduce((a, r) => a + perMonth(r), 0);
  const budget = activeCats('out').reduce((a, c) => a + (c.budget || 0), 0);
  const row = r => {
    const c = catById(r.cat) || { name: '?', color: '#888' }, n = nextDue(r), e = every(r);
    return `<button class="tx fx" data-a="editRec" data-id="${r.id}">
      <span class="tx-ic" style="background:${c.color};color:${inkOn(c.color)}">${esc(c.name[0] || '?')}</span>
      <span class="tx-m">
        <div class="tx-t">${esc(r.note || c.name)}</div>
        <div class="fx-d"><b>${EVERY[e]}</b> · ${esc(c.name)}</div>
        <div class="fx-d">nächste am ${longDate(n)}</div>
      </span>
      <span class="fx-a"><span class="tx-a num${r.type === 'in' ? ' in' : ''}">${r.type === 'in' ? '+' : '−'}${money(r.amount)}</span>${e > 1 ? `<span class="fx-pm num">≈ ${money0(perMonth(r))} / Monat</span>` : ''}</span>
    </button>`;
  };
  const sorted = list => list.slice().sort((a, b) => nextDue(a).localeCompare(nextDue(b)));
  $('#view').innerHTML = `
    <h1 class="page-h">Fixkosten</h1>
    <section class="hero" style="padding-top:0">
      <p class="hero-l">Fixkosten pro Monat</p>
      <p class="hero-n num">${money(pm)}</p>
      <p class="hero-s">${out.length ? `<b class="num">${money0(pm * 12)}</b> im Jahr${budget ? ` · ${Math.round(pm / budget * 100)} % deines Budgets` : ''}` : 'Miete, Versicherung, Abos – einmal eintragen, dann bucht die App sie selbst.'}</p>
    </section>
    <button class="btn primary" style="width:100%;margin-bottom:8px" data-a="addRec">+ Fixkosten hinzufügen</button>
    <div class="sec-h"><h2>Ausgaben</h2><span>nach Fälligkeit</span></div>
    <div class="card">${out.length ? sorted(out).map(row).join('') : '<div class="empty"><b>Noch keine Fixkosten</b>Tipp oben auf „Fixkosten hinzufügen“.</div>'}</div>
    ${inc.length ? `<div class="sec-h"><h2>Feste Einnahmen</h2></div><div class="card">${sorted(inc).map(row).join('')}</div>` : ''}
    <p class="note">Bei Beträgen, die nicht monatlich anfallen, zeigt „≈ / Monat“, wie viel du dafür jeden Monat zur Seite legen solltest.</p>`;
}

/* ---------- Auswertung ---------- */
const MON3 = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function renderStats() {
  $('#nav').hidden = false; setTab('stats');
  const ym = UI.cur, d = monthData(ym);
  const budget = activeCats('out').reduce((a, c) => a + (c.budget || 0), 0);

  // Wohin ging das Geld – nach Betrag sortiert, jede Zeile beschriftet
  const rows = Object.entries(d.byCat).map(([id, v]) => ({ c: catById(id) || { name: 'Ohne Kategorie', color: '#888' }, v })).sort((a, b) => b.v - a.v);
  const max = rows[0]?.v || 1;
  const share = rows.map(({ c, v }) => `
    <div class="sh">
      <div class="cat-top"><span class="cat-n"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}</span><span class="cat-v num">${money0(v)}</span></div>
      <div class="sh-row"><div class="sh-bar"><div style="width:${(v / max * 100).toFixed(1)}%;background:${c.color}"></div></div><span class="sh-p num">${Math.round(v / d.spent * 100)} %</span></div>
    </div>`).join('');

  // 12 Monate bis zum gewählten Monat
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(ym, i - 11));
  const vals = months.map(m => monthData(m).spent);
  const withData = vals.filter(v => v > 0);
  const avg = withData.length ? withData.reduce((a, v) => a + v, 0) / withData.length : 0;
  const hiI = vals.indexOf(Math.max(...vals));
  const W = 340, H = 190, top = 26, base = H - 26, slot = W / 12, bw = Math.min(20, slot - 8);
  const vmax = Math.max(budget, ...vals, 1) * 1.08;
  const y = v => base - (v / vmax) * (base - top);
  const bars = months.map((m, i) => {
    const v = vals[i], x = i * slot + (slot - bw) / 2, h = base - y(v), sel = m === ym;
    const over = budget && v > budget;
    const r = Math.min(4, h);
    const path = h > 0 ? `M${x},${base}V${base - h + r}q0,-${r} ${r},-${r}h${bw - 2 * r}q${r},0 ${r},${r}V${base}Z` : '';
    return `<g class="col${sel ? ' sel' : ''}" data-a="pickMonth" data-m="${m}" role="button" aria-label="${monthLabel(m)}: ${money0(v)}">
      <title>${monthLabel(m)}: ${money(v)}</title>
      <rect x="${i * slot}" y="0" width="${slot}" height="${H}" fill="transparent"/>
      ${path ? `<path d="${path}" class="${over ? 'over' : ''}"/>` : ''}
      ${sel && v ? `<text x="${x + bw / 2}" y="${y(v) - 8}" text-anchor="middle" class="val">${money0(v)}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="lbl">${MON3[+m.slice(5) - 1]}</text>
    </g>`;
  }).join('');
  const budLine = budget ? `<line x1="0" x2="${W}" y1="${y(budget)}" y2="${y(budget)}" class="bud-l"/><text x="0" y="${y(budget) - 6}" class="bud-t">Budget ${money0(budget)}</text>` : '';

  $('#view').innerHTML = `
    ${monthBar(ym)}
    <div class="sec-h"><h2>Wohin ging das Geld</h2><span class="num">${money0(d.spent)}</span></div>
    <div class="card">${share || '<div class="empty"><b>Keine Ausgaben</b>In diesem Monat ist noch nichts gebucht.</div>'}</div>
    <div class="sec-h"><h2>Ausgaben der letzten 12 Monate</h2></div>
    <div class="card chart">
      <svg viewBox="0 0 ${W} ${H}" class="cols" role="img" aria-label="Monatsausgaben der letzten 12 Monate">${budLine}<line x1="0" x2="${W}" y1="${base}" y2="${base}" class="axis"/>${bars}</svg>
      <div class="chart-sum">
        <div><span>Durchschnitt</span><b class="num">${money0(avg)}</b></div>
        <div><span>Höchster Monat</span><b class="num">${vals[hiI] ? `${MON3[+months[hiI].slice(5) - 1]} · ${money0(vals[hiI])}` : '–'}</b></div>
      </div>
      ${budget && vals.some(v => v > budget) ? '<p class="note" style="padding:4px 0 10px"><span class="key-over"></span>Rot = über dem Monatsbudget</p>' : ''}
      <p class="note" style="padding:0 0 12px">Tipp auf einen Monat, um ihn oben anzuzeigen.</p>
    </div>
    <details class="card tbl"><summary>Als Tabelle</summary>
      <table><thead><tr><th>Monat</th><th>Ausgaben</th><th>Einnahmen</th></tr></thead><tbody>
      ${months.slice().reverse().map(m => { const md = monthData(m); return `<tr><td>${monthLabel(m)}</td><td class="num">${money(md.spent)}</td><td class="num">${money(md.income)}</td></tr>`; }).join('')}
      </tbody></table></details>`;
}

/* ---------- Export, Backup ---------- */
async function shareOrDownload(blob, name) {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare) {
    const f = new File([blob], name, { type: blob.type });
    if (navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f] }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
function csvText() {
  const q = s => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const rows = S.tx.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => {
    const [Y, M, D] = t.date.split('-');
    const amt = ((t.type === 'in' ? 1 : -1) * t.amount / 100).toFixed(2).replace('.', ',');
    return [`${D}.${M}.${Y}`, t.type === 'in' ? 'Einnahme' : 'Ausgabe', q(catById(t.cat)?.name || ''), amt, q(t.note || '')].join(';');
  });
  return '﻿' + ['Datum;Typ;Kategorie;Betrag;Notiz', ...rows].join('\r\n');
}
function checkBackup(data) {
  if (!data || data.app !== 'budget' || !Array.isArray(data.cats) || !Array.isArray(data.tx)) throw new Error('kein Budget-Backup');
  if (!data.cats.every(c => c && c.id && c.name) || !data.tx.every(t => t && t.id && t.cat && /^\d{4}-\d\d-\d\d$/.test(t.date) && Number.isInteger(t.amount))) throw new Error('beschädigt');
}
function applyBackup(data) {
  checkBackup(data);
  S.cats = data.cats; S.tx = data.tx; S.rec = Array.isArray(data.rec) ? data.rec : [];
  S.setup = true; S.firstUse = S.firstUse || Date.now();
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
  addTo(el) { openAdd(null, el.dataset.id); },
  catHist(el) { UI.histAll = false; openHistory(el.dataset.id); },
  histAll() { UI.histAll = true; openHistory(UI.hist); },
  sugg(el) {
    const t = UI.sheet; if (!t) return;
    $('#fNote').value = el.dataset.note;
    if (!t.cat && catById(el.dataset.cat)) { t.cat = el.dataset.cat; t.preset = true; drawAdd(true); }
    document.querySelectorAll('#fSugg button').forEach(b => b.classList.toggle('on', b.dataset.note === el.dataset.note));
    const a = $('#fAmt'); if (!a.value) a.focus();
  },
  confirmYes() { const r = UI.confirm; UI.confirm = null; closeSheet(); r && r(true); },
  confirmNo() { closeSheet(); },
  fs(el) {
    const f = el.dataset.f;
    try { f === 'm' ? localStorage.removeItem('budget.fs') : localStorage.setItem('budget.fs', f); } catch (e) {}
    if (f === 'm') delete document.documentElement.dataset.fs; else document.documentElement.dataset.fs = f;
    renderSettings();
  },
  closeSheet,
  edit(el) { const t = S.tx.find(x => x.id === el.dataset.id); if (t) openAdd(t); },
  type(el) {
    const t = UI.sheet; if (t.type === el.dataset.t) return;
    t.type = el.dataset.t; t.cat = null; drawAdd(true);
  },
  pick(el) {
    UI.sheet.cat = el.dataset.id;
    if (UI.sheet.id || UI.sheet.mode === 'rec' || UI.sheet.preset) { document.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); $('#fErr').hidden = true; $('#fSugg').innerHTML = suggHtml(); return; }
    commitTx();
  },
  saveTx: commitTx,
  async delTx() {
    const t = S.tx.find(x => x.id === UI.sheet.id); if (!t) return;
    S.tx = S.tx.filter(x => x !== t); await save(); closeSheet(); route();
    toast('Buchung gelöscht', { label: 'Rückgängig', fn: async () => { S.tx.push(t); await save(); route(); } });
  },
  month(el) { UI.cur = shiftMonth(UI.cur, +el.dataset.d); UI.filter = null; UI.showAll = false; location.hash.startsWith('#/stats') ? renderStats() : renderHome(); },
  pickMonth(el) { UI.cur = el.dataset.m; renderStats(); },
  addRec() { openRec(); },
  editRec(el) { const r = recById(el.dataset.id); if (r) openRec(r); },
  async delRec() {
    const r = recById(UI.sheet.id); if (!r) return;
    S.rec = S.rec.filter(x => x !== r); await save(); closeSheet(); renderFixed();
    toast('Fixkosten entfernt', { label: 'Rückgängig', fn: async () => { S.rec.push(r); await save(); renderFixed(); } });
  },
  async backup() {
    const data = { app: 'budget', version: 1, exported: new Date().toISOString(), cats: S.cats, tx: S.tx, rec: S.rec };
    const ok = await shareOrDownload(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `budget-backup-${todayISO()}.json`);
    if (!ok) return;
    S.lastBackup = Date.now(); S.snooze = 0; await save(); route(); toast('Backup gespeichert');
  },
  restore() { $('#fileBackup').value = ''; $('#fileBackup').click(); },
  async csv() {
    if (!S.tx.length) return toast('Noch keine Buchungen zum Exportieren');
    await shareOrDownload(new Blob([csvText()], { type: 'text/csv' }), `budget-${todayISO()}.csv`);
  },
  async snooze() { S.snooze = Date.now() + 7 * DAY; await save(); renderHome(); },
  filter(el) { const id = el.dataset.id || null; UI.filter = UI.filter === id ? null : id; UI.showAll = false; renderHome(); },
  showAll() { UI.showAll = true; renderHome(); },
  async finishSetup() {
    document.querySelectorAll('[data-bud]').forEach(i => { const c = catById(i.dataset.bud); const v = parseMoney(i.value); c.budget = v > 0 ? v : 0; });
    S.setup = true; S.firstUse = Date.now(); await save(); location.hash = '#/'; route();
  },
  async color(el) {
    const c = catById(el.dataset.id); c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length];
    el.style.background = c.color; await save();
  },
  async delCat(el) {
    const c = catById(el.dataset.id);
    if (activeCats(c.kind).length <= 1) return toast('Mindestens eine Kategorie muss bleiben');
    const n = S.tx.filter(t => t.cat === c.id).length, used = n > 0;
    const recs = S.rec.filter(r => r.cat === c.id).length;
    const ok = await askConfirm({
      title: `„${c.name}“ entfernen?`,
      text: (used ? `${n} Buchung${n > 1 ? 'en gehören' : ' gehört'} zu dieser Kategorie. Sie bleiben erhalten und zählen weiter in die Auswertung.` : 'Zu dieser Kategorie gibt es noch keine Buchungen.')
        + (recs ? `<br><br><b>${recs} Fixkosten-Eintr${recs > 1 ? 'äge laufen' : 'ag läuft'} weiter über diese Kategorie.</b> Entferne ${recs > 1 ? 'sie' : 'ihn'} im Reiter Fixkosten, wenn nichts mehr gebucht werden soll.` : ''),
      ok: 'Entfernen'
    });
    if (!ok) return;
    if (used || recs) c.archived = true; else S.cats = S.cats.filter(x => x !== c);
    await save(); renderSettings();
    toast(`${c.name} entfernt`, { label: 'Rückgängig', fn: async () => { if (c.archived) delete c.archived; else S.cats.push(c); await save(); renderSettings(); } });
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
document.addEventListener('change', async e => {
  if (e.target.id === 'fNext') { const h = $('#fNextHint'); if (h) h.textContent = nextHint(e.target.value); }
  if (e.target.id === 'fileBackup' && e.target.files[0]) {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      checkBackup(data);
      const when = data.exported ? new Date(data.exported).toLocaleDateString('de-AT') : 'unbekannt';
      if (S.tx.length && !confirm(`Backup vom ${when} mit ${data.tx?.length ?? 0} Buchungen laden?\n\nEs ersetzt die ${S.tx.length} Buchungen auf diesem Gerät.`)) return;
      applyBackup(data); materialize(); await save(); location.hash = '#/'; route();
      toast(`Backup geladen · ${S.tx.length} Buchungen`);
    } catch (err) { toast('Diese Datei ist kein gültiges Budget-Backup'); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  if (e.key === 'Enter' && UI.sheet && e.target.closest('#sheet') && e.target.tagName === 'INPUT' && (UI.sheet.id || UI.sheet.preset || UI.sheet.mode === 'rec')) { e.preventDefault(); commitTx(); }
  // Mac: „n" öffnet Erfassen
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey && S.setup && $('#sheet').hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); openAdd(); }
});
window.addEventListener('hashchange', () => { if (!$('#sheet').hidden) closeSheet(); route(); });
// Neuer Tag / neuer Monat, wenn die App lange offen bleibt
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#sheet').hidden && S.setup) { materialize(); route(); } });

/* ---------- Start ---------- */
(async () => {
  await load();
  if (S.setup) materialize();
  route();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js?v=' + APP_VER).catch(() => {});
})();
