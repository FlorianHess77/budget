'use strict';
// Hilfe – einfache Anleitungen, als aufklappbare Abschnitte
const HELP = [
  {
    id: 'start', t: 'Erste Schritte', b: `
    <p>Budget zeigt dir, wie viel du im Monat ausgibst und wie viel von deinem Budget noch übrig ist.</p>
    <ol>
      <li>Öffne <b>Einstellungen</b>.</li>
      <li>Trag bei jeder Kategorie ein, wie viel du pro Monat ausgeben willst, zum Beispiel 380 bei Lebensmittel.</li>
      <li>Erfass ab jetzt jede Ausgabe – fertig.</li>
    </ol>
    <p class="tip">Ohne Budget funktioniert die App auch. Du siehst dann nur, wie viel du ausgegeben hast.</p>`
  },
  {
    id: 'add', t: 'Ausgabe erfassen', b: `
    <p>Es gibt zwei Wege:</p>
    <ol>
      <li><b>Großes Plus</b> unten (am Mac: „Erfassen“ links oben). Betrag eintippen, dann die <b>Kategorie antippen</b> – das speichert sofort.</li>
      <li><b>Farbiges Plus</b> neben einer Kategorie auf der Übersicht. Die Kategorie ist dann schon gewählt. Betrag eintippen und <b>Speichern</b> drücken (oder die Eingabetaste).</li>
    </ol>
    <p>Ins große Feld <b>Notiz</b> schreibst du, wofür das Geld war, z. B. „Billa“ – dann findest du die Buchung später leicht wieder. Das Datum kannst du ändern, sonst gilt heute.</p>
    <p>Unter dem Notizfeld stehen deine <b>häufigsten Notizen</b>. Ein Tipp darauf füllt die Notiz aus – und wählt beim großen Plus gleich die passende Kategorie. Dann nur noch <b>Speichern</b> drücken.</p>
    <p class="tip">Am Mac öffnet die Taste <b>N</b> das Erfassen.</p>`
  },
  {
    id: 'income', t: 'Einnahme erfassen', b: `
    <ol>
      <li>Großes Plus antippen.</li>
      <li>Oben auf <b>Einnahme</b> umschalten.</li>
      <li>Betrag eintippen und z. B. <b>Gehalt</b> antippen.</li>
    </ol>
    <p>Einnahmen erscheinen auf der Übersicht unter der großen Zahl, zusammen mit dem <b>Saldo</b> (Einnahmen minus Ausgaben).</p>`
  },
  {
    id: 'edit', t: 'Buchung ändern oder löschen', b: `
    <ol>
      <li>Auf der Übersicht unter <b>Buchungen</b> die Buchung antippen.</li>
      <li>Betrag, Datum, Notiz oder Kategorie ändern und <b>Speichern</b> drücken.</li>
      <li>Oder <b>Löschen</b> drücken.</li>
    </ol>
    <p class="tip">Versehentlich gelöscht? Unten erscheint kurz <b>Rückgängig</b> – einfach antippen.</p>`
  },
  {
    id: 'overview', t: 'Die Übersicht verstehen', b: `
    <ul>
      <li><b>Große Zahl:</b> so viel hast du in diesem Monat ausgegeben.</li>
      <li><b>Darunter:</b> wie viel vom Budget noch übrig ist.</li>
      <li><b>Kategorien:</b> rechts steht, wie viel du schon ausgegeben hast, darunter, wie viel noch übrig ist.</li>
      <li><b>Rot</b> bedeutet: mehr als 80 % verbraucht oder schon darüber. Ist ein Budget genau aufgebraucht (z. B. die Miete), bleibt es grün.</li>
      <li><b>Kategorie antippen</b> öffnet ihren Verlauf: die letzten 6 Monate und alle Buchungen. Eine Buchung darin antippen, um sie zu ändern.</li>
      <li>Mit den <b>Pfeilen</b> neben dem Monat blätterst du zu früheren Monaten.</li>
    </ul>`
  },
  {
    id: 'rec', t: 'Fixkosten (Miete, Versicherung, Abos …)', b: `
    <p>Fixkosten trägst du nur einmal ein. Die App bucht sie dann automatisch, sobald sie fällig sind – auch wenn sie nur alle paar Monate anfallen.</p>
    <ol>
      <li>Reiter <b>Fixkosten</b> öffnen → <b>Fixkosten hinzufügen</b>.</li>
      <li>Betrag und Notiz eintragen, z. B. „Haushaltsversicherung“.</li>
      <li>Bei <b>Wie oft</b> wählen: monatlich, alle 2 Monate, vierteljährlich, halbjährlich oder jährlich.</li>
      <li>Bei <b>Erstes Mal am</b> das Datum der nächsten Zahlung wählen.</li>
      <li>Kategorie antippen und <b>Speichern</b> drücken.</li>
    </ol>
    <p>Oben im Reiter siehst du, was deine Fixkosten <b>pro Monat</b> und <b>pro Jahr</b> ausmachen. Bei jährlichen Beträgen steht dabei, wie viel du dafür jeden Monat zur Seite legen solltest.</p>
    <p><b>Ändern oder beenden:</b> im Reiter Fixkosten den Eintrag antippen. Änderungen gelten ab dem nächsten Mal. Was schon gebucht ist, bleibt.</p>
    <p class="tip">Schneller für monatliche Beträge: beim normalen Erfassen den Haken <b>Jeden Monat wiederholen</b> setzen.</p>`
  },
  {
    id: 'stats', t: 'Auswertung', b: `
    <ul>
      <li><b>Wohin ging das Geld:</b> alle Kategorien des Monats, die teuerste zuerst, mit Anteil in Prozent.</li>
      <li><b>Letzte 12 Monate:</b> eine Säule pro Monat. Die Linie zeigt dein Monatsbudget. Rote Säulen liegen darüber.</li>
      <li>Eine <b>Säule antippen</b> zeigt diesen Monat oben an.</li>
      <li><b>Als Tabelle</b> zeigt alle Zahlen zum Nachlesen.</li>
    </ul>`
  },
  {
    id: 'cats', t: 'Kategorien verwalten', b: `
    <p>Alles in den <b>Einstellungen</b>:</p>
    <ul>
      <li><b>Neue Kategorie:</b> Namen ins Feld „Neue Kategorie“ schreiben und <b>Hinzufügen</b> drücken.</li>
      <li><b>Umbenennen:</b> auf den Namen tippen und überschreiben.</li>
      <li><b>Farbe ändern:</b> den farbigen Punkt antippen, bis die Farbe passt.</li>
      <li><b>Budget ändern:</b> den Betrag rechts überschreiben. Es wird sofort gespeichert.</li>
      <li><b>Entfernen:</b> den Mülleimer antippen und bestätigen. Bisherige Buchungen bleiben erhalten.</li>
    </ul>`
  },
  {
    id: 'backup', t: 'Backup – wo sind meine Daten?', b: `
    <p>Deine Daten liegen <b>nur auf diesem Gerät</b>, nicht im Internet. Mach deshalb ab und zu ein Backup. Die App erinnert dich, wenn das letzte über 30 Tage alt ist.</p>
    <ol>
      <li>Einstellungen → <b>Backup speichern</b>.</li>
      <li><b>iPhone:</b> Im Teilen-Menü „In Dateien sichern“ wählen, am besten <b>iCloud Drive</b>.<br><b>Mac:</b> Die Datei landet im Ordner <b>Downloads</b>.</li>
    </ol>
    <p>Die Datei heißt z. B. <b>budget-backup-2026-11-13.json</b>.</p>
    <p><b>Zurückholen:</b> Einstellungen → <b>Backup laden</b> → Datei auswählen.</p>
    <p class="tip warn">Achtung: Backup laden <b>ersetzt</b> alle Daten auf dem Gerät.</p>`
  },
  {
    id: 'sync', t: 'Zwischen iPhone und Mac übertragen', b: `
    <p>iPhone und Mac gleichen sich nicht automatisch ab. So bringst du die Daten rüber:</p>
    <ol>
      <li>Auf dem Gerät mit den aktuellen Daten: <b>Backup speichern</b> in iCloud Drive (oder per AirDrop schicken).</li>
      <li>Auf dem anderen Gerät: <b>Backup laden</b> und die Datei auswählen.</li>
    </ol>
    <p class="tip">Am einfachsten: Buchungen hauptsächlich auf einem Gerät erfassen, das andere nur zum Ansehen nutzen.</p>`
  },
  {
    id: 'csv', t: 'In Excel öffnen (CSV)', b: `
    <ol>
      <li>Einstellungen → <b>CSV exportieren</b>.</li>
      <li>Datei speichern und mit Excel oder Numbers öffnen.</li>
    </ol>
    <p>Die Tabelle enthält alle Buchungen mit Datum, Typ, Kategorie, Betrag und Notiz.</p>`
  },
  {
    id: 'look', t: 'Schriftgröße und Farben', b: `
    <p>Einstellungen → <b>Darstellung</b>:</p>
    <ul>
      <li><b>Schriftgröße:</b> Normal, Groß oder Sehr groß.</li>
      <li><b>Farben:</b> Automatisch (wie dein Gerät), Hell oder Dunkel.</li>
    </ul>`
  },
  {
    id: 'install', t: 'App installieren und aktualisieren', b: `
    <p><b>iPhone:</b> In Safari öffnen → <b>Teilen</b> → <b>Zum Home-Bildschirm</b>.</p>
    <p><b>Mac:</b> In Safari öffnen → Menü <b>Ablage</b> → <b>Zum Dock hinzufügen</b>.</p>
    <p>Die App funktioniert danach auch <b>ohne Internet</b>.</p>
    <p><b>Updates:</b> kommen automatisch. Falls etwas Neues fehlt, die App ganz schließen und wieder öffnen.</p>`
  }
];

function renderHelp() {
  $('#nav').hidden = false; setTab('help');
  const open = UI.helpOpen || null;
  $('#view').innerHTML = `
    <h1 class="page-h">Hilfe</h1>
    <p class="lead">Tipp auf ein Thema, um die Anleitung zu öffnen.</p>
    <div class="card help">
      ${HELP.map(h => `<details data-id="${h.id}"${open === h.id ? ' open' : ''}><summary>${h.t}</summary><div class="help-b">${h.b}</div></details>`).join('')}
    </div>
    <p class="note">Version ${APP_VER}</p>`;
  // nur ein Thema gleichzeitig offen – bleibt übersichtlich
  document.querySelectorAll('.help details').forEach(d => d.addEventListener('toggle', () => {
    if (!d.open) { if (UI.helpOpen === d.dataset.id) UI.helpOpen = null; return; }
    UI.helpOpen = d.dataset.id;
    document.querySelectorAll('.help details[open]').forEach(o => { if (o !== d) o.open = false; });
  }));
}
