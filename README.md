# Budget – den Monat im Blick

Ausgaben in drei Taps erfassen: Plus, Betrag, Kategorie. Die Startseite zeigt groß, wie viel im Monat schon ausgegeben ist, darunter jede Kategorie mit Restbudget. Rot erscheint nur, wenn eine Kategorie über 80 % liegt.

**App:** https://florianhess77.github.io/budget/

## Installieren
- **iPhone:** in Safari öffnen → Teilen → **Zum Home-Bildschirm**
- **Mac:** in Safari öffnen → Ablage → **Zum Dock hinzufügen**

Danach startet Budget ohne Browserleiste und funktioniert offline. Die Daten liegen nur auf dem jeweiligen Gerät.

## Funktionen (Stufe 1)
- Erfassen: Ausgabe oder Einnahme, Betrag, Datum, Notiz – Kategorie antippen speichert sofort
- Übersicht pro Monat: Ausgaben gesamt, Rest vom Budget, Einnahmen und Saldo
- Kategorien mit Monatsbudget, Fortschrittsbalken und Warnung ab 80 %
- Buchungen bearbeiten, löschen (mit Rückgängig), nach Kategorie filtern
- Kategorien anlegen, umbenennen, Farbe wechseln, entfernen
- Hell, Dunkel oder automatisch; am Mac Seitenleiste, Taste **N** öffnet Erfassen

## Technik
Reines HTML/CSS/JS ohne Build-Schritt. Daten in IndexedDB, Offline-Cache über `sw.js`. Bei Änderungen `APP_VER` in `app.js` hochzählen, damit iPhone und Mac das Update bekommen.

Test: `python3 tests/smoke.py` (Playwright, iPhone- und Mac-Format, legt Screenshots in `tests/_shots/` ab).
Symbole neu erzeugen: `python3 tools/render_icons.py`.
