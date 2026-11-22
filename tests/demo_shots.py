"""Beispielbilder mit Musterdaten (python3 tests/demo_shots.py) – legt PNGs in tests/_demo/ ab."""
import asyncio, os, json, threading, http.server, socketserver, functools, datetime, calendar
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', '_demo'); os.makedirs(OUT, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'

today = datetime.date.today()
ym = today.strftime('%Y-%m')
prev = (today.replace(day=1) - datetime.timedelta(days=1))
pym = prev.strftime('%Y-%m')
def d(day, m=ym):  # Tag im Monat, nie in der Zukunft
    y, mo = int(m[:4]), int(m[5:])
    day = min(day, calendar.monthrange(y, mo)[1])
    if m == ym: day = min(day, today.day)
    return f'{m}-{day:02d}'

cats = [
    {'id': 'c1', 'name': 'Lebensmittel', 'kind': 'out', 'color': '#2a78d6', 'budget': 40000},
    {'id': 'c2', 'name': 'Apotheke', 'kind': 'out', 'color': '#eb6834', 'budget': 6000},
    {'id': 'c3', 'name': 'Haushalt', 'kind': 'out', 'color': '#1baf7a', 'budget': 8000},
    {'id': 'c4', 'name': 'Freizeit', 'kind': 'out', 'color': '#eda100', 'budget': 10000},
    {'id': 'c5', 'name': 'Geschenke', 'kind': 'out', 'color': '#e87ba4', 'budget': 5000},
    {'id': 'i1', 'name': 'Pension', 'kind': 'in', 'color': '#1baf7a', 'budget': 0},
]
n = 0
def tx(amount, cat, note, date, typ='out', **kw):
    global n; n += 1
    return {'id': f't{n}', 'type': typ, 'amount': amount, 'cat': cat, 'date': date, 'note': note, 'created': n, **kw}
txs = [
    tx(198000, 'i1', 'Pension', d(1), 'in'),
    tx(4280, 'c1', 'Billa', d(3)), tx(2315, 'c1', 'Spar', d(6)), tx(3760, 'c1', 'Hofer', d(10)),
    tx(2890, 'c1', 'Billa', d(15)), tx(1890, 'c2', 'Apotheke', d(8)), tx(2540, 'c2', 'Apotheke', d(17)),
    tx(1530, 'c3', 'Drogerie', d(12)), tx(3200, 'c4', 'Friseur', d(9)), tx(840, 'c4', 'Café', d(14)),
    tx(1250, 'c5', 'Blumen', d(19)), tx(4170, 'c1', 'Spar', d(21)),
    # Vormonat
    tx(198000, 'i1', 'Pension', d(1, pym), 'in'), tx(31200, 'c1', 'Billa', d(10, pym)), tx(2400, 'c2', 'Apotheke', d(5, pym)),
]
# Fixkosten
recs = [
    {'id': 'r1', 'type': 'out', 'note': 'Miete', 'amount': 52000, 'every': 1, 'day': 1, 'start': pym, 'last': None, 'skip': []},
    {'id': 'r2', 'type': 'out', 'note': 'Kredit', 'amount': 11500, 'every': 1, 'day': 28, 'start': pym, 'last': None, 'skip': []},
    {'id': 'r3', 'type': 'out', 'note': 'Strom', 'vary': True, 'amount': 6430, 'every': 1, 'day': 15, 'start': pym, 'last': None, 'skip': []},
    {'id': 'r4', 'type': 'out', 'note': 'Telefon', 'vary': True, 'amount': 2990, 'every': 1, 'day': 20, 'start': pym, 'last': None, 'skip': []},
    {'id': 'r5', 'type': 'out', 'note': 'Haushaltsversicherung', 'amount': 18600, 'every': 12, 'day': 1, 'start': f'{today.year + 1}-02', 'last': None, 'skip': []},
]
txs += [
    tx(5810, 'fix', 'Strom', d(15, pym), fixed=True, recId='r3', dueM=pym),
    tx(6430, 'fix', 'Strom', d(15), fixed=True, recId='r3', dueM=ym),
    tx(2990, 'fix', 'Telefon', d(20, pym), fixed=True, recId='r4', dueM=pym),
]
state = {'cats': cats, 'tx': txs, 'rec': recs, 'setup': True, 'firstUse': 0, 'lastBackup': 0, 'snooze': 0}

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def page(theme, w, h, mobile):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=mobile, is_mobile=mobile, locale='de-AT', color_scheme=theme)
            pg = await ctx.new_page()
            await pg.goto(BASE); await pg.wait_for_timeout(300)
            await pg.evaluate("s => { Object.assign(S, s); S.firstUse = Date.now(); S.lastBackup = Date.now(); migrate(); materialize(); return save(); }", state)
            await pg.reload(); await pg.wait_for_timeout(500)
            return pg
        pg = await page('light', 390, 1500, True)
        await pg.screenshot(path=f'{OUT}/1-iphone-laufende-kosten.png')
        await pg.goto(BASE + '#/fixed'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/2-iphone-fixkosten.png')
        await pg.goto(BASE + '#/stats'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/3-iphone-statistik.png')
        pg = await page('dark', 390, 1500, True)
        await pg.goto(BASE + '#/fixed'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/4-iphone-fixkosten-dunkel.png')
        pg = await page('light', 1280, 900, False)
        await pg.screenshot(path=f'{OUT}/5-mac-laufende-kosten.png')
        await pg.goto(BASE + '#/fixed'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/6-mac-fixkosten.png')
        await pg.goto(BASE + '#/stats'); await pg.wait_for_timeout(400)
        await pg.set_viewport_size({'width': 1280, 'height': 1250}); await pg.wait_for_timeout(200)
        await pg.screenshot(path=f'{OUT}/7-mac-auswertung-laufend.png')
        await pg.click('.seg3 [data-m="fix"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/8-mac-auswertung-fix.png')
        await pg.click('.seg3 [data-m="all"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/9-mac-auswertung-gesamt.png')
        await b.close()

asyncio.run(main())
print('\n'.join(sorted(os.listdir(OUT))))
