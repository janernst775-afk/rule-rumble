# Rule Rumble – Anweisungen für Claude Code

Rule Rumble ist ein rundenbasiertes 2D-Brettspiel im Browser: 1–4 Helden kämpfen gegen einen Boss auf einem Brett, das die Spieler verändern, und erfinden dabei eigene Regeln, Effekte, Texturen und Sounds. Version 1 läuft lokal mit Bots; Online-Multiplayer kommt später.

## Wichtige Dateien

| Datei | Inhalt |
| --- | --- |
| `docs/SPEC.md` | Verbindliche Spezifikation: Spielregeln, Regel-Sprache, Balance, UI, Technik |
| `docs/MILESTONES.md` | Meilensteine mit Aufgaben und Abnahmekriterien, in dieser Reihenfolge |
| `docs/screens/*.png` | UI-Referenzbilder (Startbildschirm, Lobby, Spielbrett, Feld anlegen, Rad, Regel-Editor, Effekt-Werkstatt) |
| `docs/DECISIONS.md` | Von dir gepflegt: jede Abweichung von der Spec oder neue technische Entscheidung, 2–4 Zeilen pro Eintrag mit Datum |

Lies vor jedem Meilenstein den passenden Abschnitt in `docs/MILESTONES.md` und die dort genannten Spec-Abschnitte vollständig.

## Arbeitsweise

1. **Ein Meilenstein nach dem anderen.** Beginne nur den nächsten offenen Meilenstein aus `docs/MILESTONES.md`. Fang nie den folgenden an, ohne mein OK.
2. **Zuerst planen.** Schreibe zu Beginn eines Meilensteins einen kurzen Plan (Dateien, Typen, Reihenfolge, Risiken) und warte bei v0.1 auf mein OK. Ab v0.2 darfst du direkt loslegen, wenn der Plan keine Spec-Abweichung enthält.
3. **Bauen, testen, prüfen.** Vor dem Abschluss müssen `npm run typecheck`, `npm run lint`, `npm run test` und `npm run build` fehlerfrei laufen. Starte bei UI-Änderungen `npm run dev` und prüfe die betroffenen Screens selbst.
4. **Abhaken.** Hake erledigte Punkte in `docs/MILESTONES.md` ab (`- [x]`). Trage Abweichungen in `docs/DECISIONS.md` ein.
5. **Commit.** Ein oder mehrere sinnvolle Commits pro Meilenstein im Conventional-Commits-Stil (`feat(engine): …`, `test(lang): …`). Push nur, wenn ich es sage.
6. **Stoppen und berichten.** Am Ende eines Meilensteins: was fertig ist, wie ich es teste, welche Abnahmekriterien erfüllt sind, was offen oder abweichend ist. Dann warten.
7. **Bei Unklarheit fragen.** Wenn die Spec etwas offen lässt oder sich widerspricht, frag mich mit konkreten Optionen und deiner Empfehlung, statt zu raten. Kleine Details ohne Auswirkung auf Spielregeln oder Architektur entscheidest du selbst und notierst sie in `docs/DECISIONS.md`.

## Kommunikation

- Antworte auf Deutsch, knapp und technisch. Ich bin erfahren; erkläre Entscheidungen nur, wenn sie nicht offensichtlich sind.
- Code, Bezeichner, Kommentare und Commit-Messages auf Englisch.
- Alle UI-Texte über i18n (`src/locales/de.json`), Deutsch vollständig. `en.json` existiert, darf aber unvollständig sein.

## Tech-Stack

- Vite + React + TypeScript (`strict`, kein `any` ohne Begründungskommentar)
- Zustand für den UI-Zustand; die Engine ist ein reiner Reducer
- React + SVG für das Brett, normales DOM für Panels, Canvas nur im Malprogramm
- Vitest (+ Testing Library für UI-Komponenten), ESLint, Prettier
- i18next + react-i18next
- Web Audio API für synthetische Sounds und Musik
- Später: CodeMirror 6 (v0.6), `idb` für IndexedDB (v0.2)
- Hosting: GitHub Pages über GitHub Actions bei Push auf `main`

Weitere Abhängigkeiten nur nach Rückfrage. Bevorzuge kleine, gut gepflegte Pakete und eigenen Code, wo er unter ca. 100 Zeilen bleibt.

### npm-Skripte (in v0.1 anlegen)

| Skript | Zweck |
| --- | --- |
| `dev` | Vite-Dev-Server |
| `build` | Produktions-Build (inkl. Typecheck) |
| `preview` | Build lokal ansehen |
| `typecheck` | `tsc --noEmit` |
| `lint` | ESLint |
| `format` | Prettier |
| `test` | Vitest einmalig; `test:watch` im Watch-Modus |
| `sim` | (ab v0.8) Balance-Simulation Bot gegen Bot in Node |

## Architekturregeln (nicht verhandelbar)

1. **Engine ist rein.** `src/engine` und `src/lang` importieren nichts aus React, DOM, `window`, `localStorage` oder `Date.now()`. Zufall nur über den Seed-RNG im Spielzustand. Gleicher Seed + gleiche Aktionen ⇒ gleicher Zustand. Die Engine muss später ohne Änderung auf einem Node-Server laufen.
2. **Zustand ist serialisierbar.** `GameState` ist reines JSON (keine Klassen, Maps, Funktionen). Aktionen sind ebenfalls JSON.
3. **Nur Grundaktionen verändern die Welt.** Regeln, eigene Effekte und Profi-Code rufen ausschließlich Funktionen aus `engine/primitives.ts` auf. Jede Grundaktion prüft dort die Obergrenzen aus `Settings` und die festen Schutzregeln (SPEC 6).
4. **Alle Grenzen kommen aus `Settings`.** Keine Spielwerte als Konstanten im Code, außer den festen Schutzregeln (Kettentiefe, Rechenbudget, kein Sofort-Tod, Regeln für alle gleich).
5. **Regeln gelten für alle gleich.** Rolle, Name und Controller einer Figur sind für Regeln und Profi-Code nicht lesbar. Der Validator lehnt alles ab, was darauf zugreift.
6. **Kein `eval`, kein `new Function`, kein JS aus Spielertext.** Regel-Sprache und Profi-Sprache werden geparst und von einem eigenen Interpreter mit Schritt-Budget ausgeführt.
7. **Ein AST für alles.** Baustein-Editor, Text-Sprache und Profi-Code erzeugen denselben AST (`lang/ast.ts`). Parser und Printer müssen Round-Trip-fest sein.
8. **Schlüsselwörter an einer Stelle.** Deutsche Schlüsselwörter mit englischen Aliasen nur in `lang/keywords.ts`.
9. **Netzwerk vorbereitet, nicht gebaut.** Lobby und Einstellungen sind JSON-Zustand, damit ein Server sie später synchronisieren kann. Kein Backend, kein WebSocket vor v1.x.
10. **Nur Desktop.** Mindestbreite 1280 px, Maus + Tastatur. Kein Touch- oder Handy-Layout.

## Spielinhalt – Gewichtung

- Das Herzstück ist kreative Freiheit beim Erfinden von Regeln und Effekten (SPEC 5). Hier lohnt sich die meiste Sorgfalt.
- NPCs (z. B. Zombies) sind nur eine Möglichkeit unter vielen und kein Schwerpunkt. Beispiele und Startregeln sollen die Breite zeigen: Brett verändern, Bewegung, Rad-Chancen, Variablen, Texturen, Teleport, Schilde.
- NPCs haben eigene Züge in der Zugfolge (nach dem Boss, in Reihenfolge ihres Erscheinens).

## UI

- Halte dich an die Design-Tokens aus SPEC 8 und die Referenzbilder. Lege die Tokens als CSS-Variablen in `src/ui/theme.css` an.
- Stil: verspielt wie ein Party-Zeichenspiel. Übernimm keine Logos, Namen, Grafiken oder Sounds bestehender Spiele.
- Das Brett hat immer Vorrang; Seitenleisten sind einklappbar (Zustand in localStorage).
- Echte `<button>`-, `<input>`- und `<label>`-Elemente, sichtbarer Fokus, Tastaturkürzel laut SPEC 8.1.
- Avatare: Bild-Upload (Kreis-Zuschnitt, 256 px, Data-URL) oder farbiger Kreis mit Initialen; Boss Rot `#E5383B` mit Krone.

## Tests

- Engine und Sprache sind testgetrieben: jede Spielregel, jede Grundaktion, jede Obergrenze hat mindestens einen Test.
- Parser: Round-Trip-Tests (`print(parse(text))` ergibt normalisierten Text), Fehlermeldungen mit Zeile und Vorschlag.
- Determinismus-Test: gleiches Spiel zweimal mit gleichem Seed ⇒ identischer Zustand.
- UI: Smoke-Tests pro Screen reichen; keine Snapshot-Tests von großen DOM-Bäumen.

## Definition of Done (pro Meilenstein)

- Alle Abnahmekriterien in `docs/MILESTONES.md` erfüllt und abgehakt
- typecheck, lint, test, build grün; CI grün
- Keine `TODO` ohne Verweis auf einen späteren Meilenstein
- `docs/DECISIONS.md` aktuell
- Kurzer Bericht an mich, dann warten
