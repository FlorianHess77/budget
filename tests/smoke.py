"""Durchklick-Test am iPhone- und Mac-Format mit Screenshots (python3 tests/smoke.py)."""
import asyncio, os, threading, http.server, socketserver, functools, datetime
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('SHOTS', os.path.join(ROOT, 'tests', '_shots')); os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'
errors = []
def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: errors.append(msg)

today = datetime.date.today()
last_month = (today.replace(day=1) - datetime.timedelta(days=1)).isoformat()
early = today.replace(day=1).isoformat()
prev_first = (today.replace(day=1) - datetime.timedelta(days=1)).replace(day=1).isoformat()

async def add(pg, amount, cat, note='', date=None, income=False, repeat=False):
    await pg.click('.nav-add'); await pg.wait_for_timeout(150)
    if income: await pg.click('.seg [data-t="in"]')
    await pg.fill('#fAmt', amount)
    if note: await pg.fill('#fNote', note)
    if date: await pg.fill('#fDate', date)
    if repeat: await pg.check('#fRepeat')
    await pg.click(f'.chip:has-text("{cat}")'); await pg.wait_for_timeout(200)

async def run(theme):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True,
                                  locale='de-AT', color_scheme=theme)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append(f'{theme}: JS-Fehler {e}'))
        pg.on('console', lambda m: m.type == 'error' and 'fonts.g' not in (m.location.get('url') or '') and errors.append(f'{theme}: console {m.text}'))
        shot = lambda n: pg.screenshot(path=f'{OUT}/{theme}-{n}.png', full_page=True)
        await pg.goto(BASE); await pg.wait_for_timeout(400)
        await shot('01-willkommen')
        for cat, v in [('Wohnen', '650'), ('Lebensmittel', '380'), ('Auto', '200'), ('Freizeit', '120'), ('Abos', '60')]:
            await pg.fill(f'.set-row:has-text("{cat}") input', v)
        await pg.click('[data-a="finishSetup"]'); await pg.wait_for_timeout(300)
        await shot('02-leer')
        check(await pg.locator('.cat').count() == 5, f'{theme}: 5 Kategorien in der Übersicht')

        # Ohne Betrag → Hinweis, nichts gespeichert
        await pg.click('.nav-add'); await pg.wait_for_timeout(150)
        await pg.click('.chip:has-text("Auto")'); await pg.wait_for_timeout(100)
        check(await pg.locator('#fErr').is_visible(), f'{theme}: Hinweis bei fehlendem Betrag')
        await shot('03-erfassen')
        await pg.click('.sheet-head [data-a="closeSheet"]')

        # Miete monatlich ab Vormonat → dieser Monat wird automatisch gebucht
        await add(pg, '650', 'Wohnen', 'Miete', prev_first, repeat=True)
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Miete').length") == 2, f'{theme}: Miete für Vormonat und diesen Monat gebucht')
        check(await pg.locator('.rec-mark').count() >= 1, f'{theme}: Kennzeichnung „monatlich“')
        await add(pg, '84,30', 'Lebensmittel', 'Billa')
        await add(pg, '1.234,56', 'Freizeit', 'Urlaub Anzahlung', early)
        await add(pg, '170', 'Auto', 'Service')
        await add(pg, '12.99', 'Abos', 'Netflix')
        await add(pg, '2400', 'Gehalt', 'Lohn', early, income=True)
        await add(pg, '55', 'Lebensmittel', 'Spar', last_month)
        check(await pg.locator('h1').inner_text() == ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][int(last_month[5:7])-1] + ' ' + last_month[:4], f'{theme}: springt in den Monat der Buchung')
        await pg.click('[data-a="month"][data-d="1"]'); await pg.wait_for_timeout(200)
        spent = await pg.inner_text('#spent')
        check(spent.replace(' ', ' ') == '2.151,85 €', f'{theme}: Monatsausgaben 2.151,85 € (ist {spent})')
        check(await pg.locator('.cat.warn').count() == 2, f'{theme}: Auto und Freizeit als Warnung')
        check('Saldo' in await pg.inner_text('.hero'), f'{theme}: Einnahmen und Saldo angezeigt')
        await shot('04-uebersicht')

        # Bearbeiten
        await pg.click('.tx:has-text("Billa")'); await pg.wait_for_timeout(150)
        await shot('05-bearbeiten')
        await pg.fill('#fAmt', '90')
        await pg.click('[data-a="saveTx"]'); await pg.wait_for_timeout(200)
        check((await pg.inner_text('#spent')).replace(' ', ' ') == '2.157,55 €', f'{theme}: Bearbeiten ändert die Summe')
        # Löschen + Rückgängig
        await pg.click('.tx:has-text("Netflix")'); await pg.wait_for_timeout(150)
        await pg.click('[data-a="delTx"]'); await pg.wait_for_timeout(200)
        check(await pg.locator('.tx:has-text("Netflix")').count() == 0, f'{theme}: Löschen')
        await pg.click('#toast button'); await pg.wait_for_timeout(200)
        check(await pg.locator('.tx:has-text("Netflix")').count() == 1, f'{theme}: Rückgängig nach Löschen')
        # Filter
        await pg.click('.cat:has-text("Lebensmittel") .cat-main'); await pg.wait_for_timeout(150)
        check(await pg.locator('.tx').count() == 1, f'{theme}: Filter nach Kategorie')
        await pg.click('.cat:has-text("Lebensmittel") .cat-main'); await pg.wait_for_timeout(150)

        # Plus direkt bei der Kategorie
        await pg.click('.cat:has-text("Abos") .cat-add'); await pg.wait_for_timeout(150)
        check(await pg.locator('.chip.on:has-text("Abos")').count() == 1, f'{theme}: Plus wählt die Kategorie vor')
        await pg.fill('#fAmt', '9,99'); await pg.press('#fAmt', 'Enter'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("S.tx.filter(t=>t.amount===999).length") == 1 and await pg.locator('#sheet').is_hidden(), f'{theme}: Betrag + Enter speichert')
        await pg.evaluate("S.tx = S.tx.filter(t=>t.amount!==999); save(); renderHome()")
        await shot('04d-plus')

        # Bleibt nach Neuladen erhalten
        await pg.reload(); await pg.wait_for_timeout(400)
        check(await pg.locator('.tx').count() == 6, f'{theme}: Daten bleiben nach Neuladen')
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Miete').length") == 2, f'{theme}: keine doppelte Miete nach Neuladen')

        # Einstellungen
        # Backup-Erinnerung
        await pg.evaluate("S.firstUse = Date.now() - 40*864e5; renderHome()")
        check(await pg.locator('.nag').count() == 1, f'{theme}: Backup-Erinnerung nach 30 Tagen')
        await shot('04c-erinnerung')
        await pg.click('[data-a="snooze"]'); await pg.wait_for_timeout(150)
        check(await pg.locator('.nag').count() == 0, f'{theme}: „Später“ blendet Erinnerung aus')

        # Auswertung
        await pg.click('[data-tab="stats"]'); await pg.wait_for_timeout(250)
        check(await pg.locator('.sh').count() == 5, f'{theme}: 5 Kategorien in „Wohin ging das Geld“')
        check(await pg.locator('.col').count() == 12, f'{theme}: 12 Monatssäulen')
        check(await pg.locator('.col path.over').count() == 1, f'{theme}: aktueller Monat rot (über Budget)')
        await shot('09-auswertung')
        await pg.locator('.col').nth(10).click(); await pg.wait_for_timeout(200)
        check('Wohnen' in await pg.inner_text('.card') and await pg.locator('.sh').count() == 2, f'{theme}: Tipp auf Säule zeigt Vormonat')
        await pg.click('[data-a="month"][data-d="1"]'); await pg.wait_for_timeout(150)

        # CSV und Backup
        csv = await pg.evaluate("csvText()")
        check(csv.splitlines()[0].endswith('Datum;Typ;Kategorie;Betrag;Notiz') and len(csv.splitlines()) == 9 and '-1234,56' in csv, f'{theme}: CSV mit 8 Buchungen')
        backup = await pg.evaluate("JSON.stringify({app:'budget',version:1,exported:new Date().toISOString(),cats:S.cats,tx:S.tx,rec:S.rec})")
        bfile = os.path.join(OUT, f'{theme}-backup.json'); open(bfile, 'w').write(backup)
        await pg.evaluate("S.tx = S.tx.slice(0,2); save(); route()")
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.set_input_files('#fileBackup', bfile); await pg.wait_for_timeout(400)
        check(await pg.evaluate("S.tx.length") == 8, f'{theme}: Backup laden stellt alle Buchungen wieder her')
        bad = os.path.join(OUT, 'bad.json'); open(bad, 'w').write('{"hallo":1}')
        await pg.set_input_files('#fileBackup', bad); await pg.wait_for_timeout(300)
        check(await pg.evaluate("S.tx.length") == 8 and 'kein gültiges' in await pg.inner_text('#toast'), f'{theme}: ungültige Datei wird abgelehnt')

        await pg.click('[data-tab="settings"]'); await pg.wait_for_timeout(200)
        # Fixkosten-Reiter: vierteljährlich, erstes Mal heute → sofort gebucht; jährlich in der Zukunft → noch nicht
        await pg.click('[data-tab="fixed"]'); await pg.wait_for_timeout(200)
        check(await pg.locator('.fx').count() == 1, f'{theme}: Miete im Reiter Fixkosten')
        await pg.click('[data-a="addRec"]'); await pg.wait_for_timeout(150)
        await pg.fill('#fAmt', '45'); await pg.fill('#fNote', 'Versicherung'); await pg.select_option('#fEvery', '3')
        await pg.fill('#fNext', today.isoformat())
        await pg.click('.chip:has-text("Auto")')
        await shot('10-fixkosten-neu')
        await pg.click('[data-a="saveTx"]'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Versicherung').length") == 1, f'{theme}: Versicherung sofort gebucht')
        nxt = await pg.evaluate("nextDue(S.rec.find(r=>r.note==='Versicherung'))")
        check(nxt[:7] == (lambda d: f'{d.year + (d.month + 2) // 12}-{(d.month + 2) % 12 + 1:02d}')(today), f'{theme}: nächste Versicherung in 3 Monaten ({nxt})')
        await pg.evaluate("materialize()")
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Versicherung').length") == 1, f'{theme}: keine doppelte Buchung')
        await pg.click('[data-a="addRec"]'); await pg.wait_for_timeout(150)
        future = (today + datetime.timedelta(days=40)).isoformat()
        await pg.fill('#fAmt', '240'); await pg.fill('#fNote', 'Vignette'); await pg.select_option('#fEvery', '12'); await pg.fill('#fNext', future)
        await pg.click('.chip:has-text("Auto")'); await pg.click('[data-a="saveTx"]'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Vignette').length") == 0, f'{theme}: jährliche Fixkosten in der Zukunft noch nicht gebucht')
        check('≈ 20 € / Monat' in (await pg.inner_text('#view')).replace('\u00a0', ' '), f'{theme}: jährlich 240 € ≈ 20 € pro Monat')
        check(await pg.locator('.fx').count() == 3, f'{theme}: 3 Fixkosten in der Liste')
        await shot('10b-fixkosten')
        # Datum ändern bucht nicht doppelt
        await pg.click('.fx:has-text("Versicherung")'); await pg.wait_for_timeout(150)
        await pg.fill('#fNext', today.replace(day=1).isoformat()); await pg.click('[data-a="saveTx"]'); await pg.wait_for_timeout(200)
        check(await pg.evaluate("S.tx.filter(t=>t.note==='Versicherung').length") == 1, f'{theme}: Datum ändern bucht nicht doppelt')
        await pg.click('[data-tab="settings"]'); await pg.wait_for_timeout(200)
        await pg.fill('.add-cat[data-form="out"] input', 'Kleidung'); await pg.click('.add-cat[data-form="out"] button'); await pg.wait_for_timeout(200)
        await pg.fill('.set-row:has(input[value="Kleidung"]) [data-bud]', '80'); await pg.wait_for_timeout(100)
        check((await pg.inner_text('#budSum')).replace(' ', ' ') == '1.490 €', f'{theme}: Budgetsumme aktualisiert')
        await shot('06-einstellungen')
        # Kategorie entfernen nur nach Bestätigung
        await pg.click('.set-row:has(input[value="Kleidung"]) [data-a="delCat"]'); await pg.wait_for_timeout(150)
        check(await pg.locator('[data-a="confirmYes"]').is_visible(), f'{theme}: Bestätigung vor dem Entfernen')
        await shot('06c-bestaetigung')
        await pg.click('[data-a="confirmNo"]'); await pg.wait_for_timeout(150)
        check(await pg.locator('input[value="Kleidung"]').count() == 1, f'{theme}: Abbrechen behält die Kategorie')
        await pg.click('.set-row:has(input[value="Abos"]) [data-a="delCat"]'); await pg.wait_for_timeout(150)
        await pg.click('[data-a="confirmYes"]'); await pg.wait_for_timeout(150)
        check(await pg.locator('input[value="Abos"]').count() == 0 and await pg.evaluate("S.cats.find(c=>c.name==='Abos').archived") == True, f'{theme}: Entfernen nach Bestätigung, Buchungen bleiben')
        await pg.click('#toast button'); await pg.wait_for_timeout(150)
        check(await pg.locator('input[value="Abos"]').count() == 1, f'{theme}: Rückgängig holt die Kategorie zurück')
        await pg.click('[data-a="fs"][data-f="xl"]'); await pg.wait_for_timeout(100)
        check(await pg.evaluate("document.documentElement.dataset.fs") == 'xl', f'{theme}: Schriftgröße „Sehr groß“')
        await pg.reload(); await pg.wait_for_timeout(300)
        check(await pg.evaluate("document.documentElement.dataset.fs") == 'xl', f'{theme}: Schriftgröße bleibt nach Neuladen')
        await pg.goto(BASE + '#/'); await pg.wait_for_timeout(300)
        await shot('06b-sehr-gross')
        await pg.goto(BASE + '#/settings'); await pg.wait_for_timeout(200)
        await pg.click('[data-a="fs"][data-f="m"]'); await pg.wait_for_timeout(100)
        await pg.click('[data-tab="home"]'); await pg.wait_for_timeout(200)
        check(await pg.locator('.cat').count() == 6, f'{theme}: neue Kategorie in der Übersicht')

        # Hilfe
        await pg.click('[data-tab="help"]'); await pg.wait_for_timeout(200)
        check(await pg.locator('.help details').count() == 13, f'{theme}: 13 Hilfethemen')
        await pg.click('.help summary:has-text("Backup")'); await pg.wait_for_timeout(100)
        await pg.click('.help summary:has-text("Fixkosten")'); await pg.wait_for_timeout(100)
        check(await pg.locator('.help details[open]').count() == 1 and 'automatisch' in await pg.inner_text('.help details[open]'), f'{theme}: immer nur ein Thema offen')
        await shot('11-hilfe')
        await pg.click('[data-tab="home"]'); await pg.wait_for_timeout(200)

        # Mac-Format
        await pg.set_viewport_size({'width': 1280, 'height': 860}); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{OUT}/{theme}-07-mac.png')
        await pg.click('.nav-add'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{OUT}/{theme}-08-mac-erfassen.png')
        await b.close()

asyncio.run(run('light'))
asyncio.run(run('dark'))
print('\n' + ('ALLES OK' if not errors else f'{len(errors)} Fehler:\n' + '\n'.join(errors)))
