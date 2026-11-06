# Rule Rumble – Meilensteine

Reihenfolge ist verbindlich. Jeder Meilenstein endet mit Bericht und Stopp (siehe `CLAUDE.md`). Spec-Verweise beziehen sich auf `docs/SPEC.md`.

---

## v0.1 – Grundspiel

**Ziel:** Ein komplettes Spiel läuft vom Startbildschirm über die Lobby bis zum Ergebnis, mit Bots, Bewegung, Angriff und Sieg. Noch ohne Feld-Aktionen und Regeln.

**Spec lesen:** 2, 2.1, 2.2, 3, 4 (ohne 4.1), 6.2 (nur Kampf/Figuren), 7, 8, 8.1, 8.2, 9

### Projekt-Setup
- [x] Vite + React + TypeScript (strict), ESLint, Prettier, Vitest, Testing Library
- [x] npm-Skripte laut `CLAUDE.md`
- [x] i18next mit `src/locales/de.json` und `en.json`, Sprachumschalter in den Einstellungen
- [x] `src/ui/theme.css` mit allen Design-Tokens aus SPEC 8, Schrift Fredoka (Google Fonts)
- [x] GitHub Actions: CI (typecheck, lint, test, build) bei jedem Push und PR
- [x] GitHub Actions: Deployment auf GitHub Pages bei Push auf `main`, Vite `base` gesetzt
- [x] `docs/DECISIONS.md` angelegt

### Engine (`src/engine`)
- [x] Typen: `GameState`, `Settings`, `Tile`, `Figure`, `Npc` (vorbereitet), `Action`, `GameEvent`, `LogEntry` – alles JSON-serialisierbar
- [x] `settings.ts`: vollständiger `Settings`-Typ laut SPEC 2.2 mit Standardwerten und den sechs Vorlagen; in v0.1 nicht wirksame Werte sind trotzdem im Typ
- [x] `rng.ts`: deterministischer Seed-RNG (z. B. mulberry32), Zustand im `GameState`
- [x] `board.ts`: Startbrett nach Settings, Nachbarn (orthogonal), erreichbare Felder für 0–N Schritte, Zusammenhangsprüfung (Flood-Fill) schon jetzt mit Tests
- [x] Zugfolge: Helden in Sitzreihenfolge, Boss, NPCs (Liste leer in v0.1); tote Figuren werden übersprungen
- [x] Phasen pro Zug: `move` → `action`; Bewegung bis zur Bewegungsweite, Stehenbleiben erlaubt, keine Bewegung durch fehlende Felder
- [x] Aktion Angreifen: nur auf demselben Feld, Ziel wählbar bei mehreren, Treffer nach `settings.wheelChance`, Treffer = 1 Schaden, beendet den Zug
- [x] Aktion Passen; Feld +/−, Regel als Aktionstypen definiert, aber in v0.1 deaktiviert
- [x] Helden dürfen sich angreifen, wenn `settings.friendlyFire` an ist
- [x] Tod, Siegbedingungen (Helden / Boss / Unentschieden), Rundenlimit aus Settings
- [x] Boss-Leben nach Settings (fest oder × Helden), Solo-Sonderwert laut SPEC
- [x] `applyAction(state, action) → { state, events }` als einziger Einstieg, ungültige Aktionen geben einen typisierten Fehler zurück
- [x] Ereignis-Log mit i18n-Schlüsseln statt fertigem Text

### Bots (`src/bots`)
- [x] Bewertungsfunktion laut SPEC 7, Schwierigkeit Normal
- [x] Helden-Bot und Boss-Bot wählen Bewegung + Aktion nur über `applyAction`
- [x] Bots nutzen den Spiel-RNG, damit Spiele reproduzierbar bleiben

### UI (`src/ui`)
- [x] Startbildschirm laut Referenz: Avatar (Upload mit Kreis-Zuschnitt oder Farbe + Initialen), Name, „Lobby erstellen“, „Beitreten“ (deaktiviert, Hinweis „bald online“), „So geht's“ (Platzhalter), Ton-Knopf
- [x] Lobby laut Referenz: Spielerliste mit Rollen, Bot hinzufügen/entfernen mit Schwierigkeit, Einladen-Knopf (deaktiviert mit Hinweis), Lobby-Code als Anzeige
- [x] Lobby-Reiter „Vorlagen“ (sechs Karten) und „Eigene Einstellungen“ (gruppiert, einklappbar); Werte, die erst später wirken, sind sichtbar, aber mit „ab vX“ markiert und deaktiviert
- [x] Geschätzte Spieldauer, „Als Vorlage speichern“ (localStorage), Start nur mit mindestens 1 Held und genau 1 Boss
- [x] Spielbrett laut Referenz: SVG-Brett, Phase oben, Spieler-Leiste links und Regel/Verlauf-Leiste rechts einklappbar, Aktionsleiste mit Hotkeys 1–5, Pfeiltasten zum Bewegen
- [x] Gültige Ziel-Felder bei der Bewegung hervorheben; nicht mögliche Aktionen ausgegraut mit Grund im Tooltip
- [x] Feld-Tooltip beim Darüberfahren; Zoom und Verschieben des Bretts
- [x] Angriffs-Rad als Overlay mit Animation (~2 s), Leertaste dreht
- [x] Bot-Züge animiert (Tempo aus Settings)
- [x] Ergebnis-Screen mit Sieger, kurzer Statistik, „Nochmal“ (zurück in dieselbe Lobby)

### Audio (`src/audio`)
- [x] Schnittstelle `playSfx(id)` / `setMusic(track)` mit synthetischer Umsetzung (Web Audio)
- [x] Sounds: Klick, Schritt, Rad-Ticken, Treffer, Daneben, Schaden, Tod, Sieg, Niederlage
- [x] Musik-Loops: Menü/Lobby, Spiel, Boss-Phase (unter 30 % Boss-Leben), weicher Übergang
- [x] Getrennte Lautstärke für Musik und Effekte, Stumm-Knopf, Werte in localStorage

### Abnahmekriterien v0.1
- [x] Team-Spiel (ich + 2 Bot-Helden gegen Boss-Bot) läuft ohne Fehler vom Startbildschirm bis zum Ergebnis
- [x] Solo- und Boss-Modus (ich als Boss gegen Bot-Helden) sind startbar und spielbar
- [x] Bot-gegen-Bot-Spiel mit festem Seed liefert zweimal den identischen Endzustand (Test)
- [x] Engine-Tests decken Bewegung, Angriff, Zugfolge, Tod und alle Siegbedingungen ab
- [x] Engine und Bots importieren nichts aus React oder DOM (per ESLint-Regel abgesichert)
- [x] Alle sichtbaren Texte kommen aus `de.json`
- [x] Die Seite ist auf GitHub Pages erreichbar

---

## v0.2 – Brettbau & Texturen

**Spec lesen:** 3 (Aktionen), 4, 4.1, 8.1

- [x] Aktion Feld hinzufügen: gestrichelte Platzhalter an gültigen Positionen, Grenzen aus Settings
- [x] Aktion Feld entfernen: nur leere Felder, Zusammenhang muss erhalten bleiben, ungültige Felder mit Grund ausgegraut
- [x] Dialog „Feld anlegen“ laut Referenz mit drei Reitern: Zeichnen, Bild hochladen, Meine Texturen
- [x] Malprogramm (Canvas 128 × 128): Pinsel in 3 Größen, Radierer, Fülleimer, Pipette, 16 Farben + eigene, Rückgängig/Wiederholen, Raster, Nahtlos-Vorschau 3 × 3
- [x] Bild-Upload mit quadratischem Zuschnitt und Zoom, Ausgabe 128 × 128 PNG
- [x] Textur hat einen Namen; Textur-Bibliothek in IndexedDB (`idb`), im Spielzustand nur eine Textur-ID
- [x] Einstellung „Eigene Texturen aus“ ⇒ einfarbige Felder
- [x] Bots nutzen Feld-Aktionen sinnvoll (Fluchtwege, Helden trennen)
- [x] Tests: Platzierung, Entfernen, Zusammenhang, Min/Max-Grenzen

**Abnahme:** Ein Feld mit selbst gezeichneter Textur lässt sich anlegen, erscheint im Spiel und in der Bibliothek, und ein Feld lässt sich nicht entfernen, wenn das Brett sonst zerfällt.

---

## v0.3 – Regel-Engine

**Spec lesen:** 5.1, 5.2, 5.5, 5.6, 6

- [x] `lang/ast.ts`: Regel-AST (Auslöser, Bedingungen, Effekte, Sonst, Dauer, Limit)
- [x] `engine/primitives.ts`: alle Effekte aus SPEC 5.2 als Grundaktionen mit Durchsetzung der Obergrenzen
- [x] Event-Bus und `lang/runtime.ts`: Regeln reagieren auf Ereignisse in Hinzufüge-Reihenfolge, Kettentiefe und Effekt-Budget laut SPEC 6
- [x] `lang/validator.ts`: Typen, Kontextwerte pro Auslöser, Obergrenzen, „für alle gleich“
- [x] Regel-Aktion im Spiel: aus Bibliothek wählen; Aktivierung laut Einstellung; Überlauf-Verhalten laut Einstellung (alle vier Varianten)
- [x] NPCs als generische Möglichkeit: eigene Züge in der Zugfolge, Standard-Verhaltensvorlagen
- [x] Startbibliothek mit 15–20 Regeln, die die Breite zeigen (höchstens 2 mit NPCs)
- [x] Regel-Panel: einklappbar, Regeln anheften, feuernde Regel leuchtet, Ereignis-Toasts
- [x] Tests: jede Grundaktion, jede Obergrenze, Kettenreaktionen, Überlauf-Varianten

**Abnahme:** Alle Startregeln funktionieren im Spiel; keine Regel kann die Grenzen aus Settings überschreiten (Tests).

---

## v0.4 – Regel-Editor

**Spec lesen:** 5.3, 5.4

- [ ] `lang/keywords.ts`: deutsche Schlüsselwörter + englische Aliase, `UE/OE/AE`-Schreibweise
- [ ] Lexer + Recursive-Descent-Parser für die Regel-Sprache laut Grammatik
- [ ] Printer (AST → Text, in der Sprache des Spielers) und Klartext-Erklärung (AST → Satz, über i18n)
- [ ] Fehlermeldungen mit Zeile, Spalte und Vorschlag („Meintest du …?“)
- [ ] Baustein-Editor laut Referenz: Palette, Drag & Drop, Werte per Dropdown/Zahl, live umschaltbar zu Text
- [ ] Stärke-Anzeige (harmlos / spannend / heftig) und Testlauf (10 Runden auf einer Kopie des Zustands)
- [ ] Regeln speichern, exportieren, importieren
- [ ] Tests: Parser-Round-Trip für alle Startregeln, Fehlermeldungen, Aliase

**Abnahme:** Jede Startregel lässt sich als Text und als Bausteine bearbeiten, und beide Ansichten bleiben synchron.

---

## v0.5 – Effekt-Werkstatt (Bausteine)

**Spec lesen:** 5.7, 5.9

- [ ] Effekt-AST mit Parametern und Typen; Steuerbausteine (Wenn/Sonst, Wiederhole, Für jede, zufällige Auswahl, Effekt aufrufen) und Abfragen laut SPEC
- [ ] `lang/interpreter.ts` mit Schritt-Budget, Rekursionsgrenze, Listen-Grenze
- [ ] Effekt-Werkstatt-Screen (Bausteine-Ansicht), eigene Effekte in Regeln nutzbar wie eingebaute
- [ ] Eigene NPC-Typen mit Aussehen (Malprogramm/Upload) und Verhaltensvorlage
- [ ] Tests: Budget-Abbruch, Grenzen, Parameter-Typen

**Abnahme:** Das Beispiel „Erdbeben“ aus SPEC 5.7 lässt sich in Bausteinen bauen und in einer Regel nutzen.

---

## v0.6 – Profi-Modus

**Spec lesen:** 5.8

- [ ] Funktionen, Solange, Listen, Text, eigene Ereignisse (`SENDE`/`WENN EREIGNIS`), `NACH n RUNDEN`, Welt-Variablen, eigenes NPC-Verhalten
- [ ] Code-Editor mit CodeMirror 6: Syntax-Farben, Autovervollständigung (Schlüsselwörter, Kontextwerte, eigene Effekte, Texturen, Sounds), Fehler in der Zeile
- [ ] Debugger: Schritt für Schritt, Variablen-Ansicht, Budget-Anzeige
- [ ] Profi-Code in der Baustein-Ansicht als grauer „Code-Baustein“
- [ ] Einstellung „Profi-Code erlaubt“ wird respektiert
- [ ] Regel-Pakete exportieren/importieren (Regeln, Effekte, NPC-Typen, Texturen, Sounds in einer JSON-Datei)
- [ ] Tests: alle Profi-Beispiele aus SPEC 5.8 laufen, Sicherheitsgrenzen greifen

**Abnahme:** Die Beispiele „schwächste()“, „Geist“ und „Flut“ aus SPEC 5.8 laufen unverändert.

---

## v0.7 – Eigene Sounds

**Spec lesen:** 8.2

- [ ] Mikrofon-Aufnahme bis 3 s mit MediaRecorder, Zuschneiden, Lautstärke, Name
- [ ] Sounds in IndexedDB, nutzbar in Regeln/Effekten (`SPIELE`) und als NPC-Sound
- [ ] Option „Eigene Sounds anderer Spieler stumm“ (für später online)
- [ ] Alle Spielereignisse haben einen synthetischen Standard-Sound

**Abnahme:** Ein aufgenommener Sound wird durch eine eigene Regel im Spiel abgespielt.

---

## v0.8 – Feinschliff & Balance

- [ ] Schwierigkeiten Leicht und Schwer für Bots
- [ ] `npm run sim`: 1000 Bot-gegen-Bot-Spiele mit zufälligen Bibliotheksregeln, Ausgabe der Boss-Siegquote je Vorlage
- [ ] Standardwerte so justiert, dass die Boss-Siegquote je Vorlage bei 40–60 % liegt
- [ ] „So geht's“-Tutorial, Animationen, Regel-Album auf dem Ergebnis-Screen
- [ ] Englische Übersetzung vervollständigen

**Abnahme:** Simulation im Zielbereich, alle Screens auf Deutsch und Englisch vollständig.

---

## v1.x – Online (nicht vor Freigabe beginnen)

Server mit derselben Engine, Einladungslink, Beitreten per Code, Lobby- und Spiel-Synchronisation, Moderation eigener Inhalte. Wird separat spezifiziert.
