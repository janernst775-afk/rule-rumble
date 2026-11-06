# Entscheidungen

Abweichungen von der Spec und technische Entscheidungen, neueste unten.

## 2026-11-05 – Planung v0.1 (vom Projektinhaber freigegeben)

- **Boss-Modus schon in v0.1** (SPEC 10 nannte v0.8). Die Engine ist rollenneutral, der Mensch kann in der Lobby den Boss-Platz übernehmen.
- **Boss-Leben:** `bossHp` ist `{ mode: 'perHero', perHero: 3, solo: 4 }` oder `{ mode: 'fixed', value }`. Der Faktor hängt nicht an `heroHp`; der Solo-Wert gilt bei genau einem Helden.
- **Rad-Chance:** Die Grenze 25–75 % (SPEC 6.2) gilt nur für Regel-Modifikatoren: `clamp(base + mod, min(base, 25), max(base, 75))`. Neues Setting `combat.wheelChanceSpread` (Standard 0): Die Chance wird pro Dreh gleichverteilt aus `base ± spread` gezogen; Chaos nutzt 50 ± 10.
- **NPCs sind Figuren** (`Figure.kind = 'npc'`) im selben `figures`-Record statt eines eigenen `npcs`-Arrays. Ziele, Zugfolge und Schaden laufen damit einheitlich.
- **Bewegung als Pfad:** `move { path: Pos[] }`. Die Engine sendet `tileLeft`/`tileEntered` pro Schritt (für `BETRITT`/`VERLÄSST` ab v0.3).
- **Neue Settings für Vorlagen:** `rules.allowRandom` (Taktik), `board.tileActionsPerAction` (Baumeister), `bots.heroChaos` (Standard 5 %, SPEC 7).
- **Kein Framer Motion:** Rad und Figuren nutzen CSS-Transitions.
- **Zugzeit schon in v0.1:** Timer nur im UI, bei Ablauf wird `pass` ausgelöst.
- **Lokale Vorlieben getrennt vom Spiel:** Lautstärke, Sprache und Panel-Zustand liegen in `localStorage` (`rr.prefs`), nicht in `Settings`.
- **Zahnrad statt Sonne** auf dem Startbildschirm: öffnet Sprache und Lautstärke. „Bibliothek“ und „So geht's“ zeigen einen Hinweis auf v0.3 / v0.8.
- **Bot-Schwierigkeit:** Leicht/Schwer sind sichtbar, aber bis v0.8 deaktiviert.

## 2026-11-05 – Umsetzung v0.1

- **Prozentwerte als ganze Zahlen** (50 statt 0.5), damit es in deterministischen Spielen keine Rundungsdrift gibt.
- **Startpositionen:** Helden verteilen sich auf die vier Felder der Ecke oben links (A1, B1, A2, B2), damit sie nicht alle auf einem Feld beginnen; der Boss steht in der Ecke gegenüber.
- **Feld-Bezeichnung** („C2“) wird aus der aktuellen Bounding-Box berechnet; wächst das Brett nach links oder oben, verschieben sich die Bezeichnungen.
- **Bot-Zufall:** Bots ziehen ihren Zufall aus `deriveRng(state.rng, figureId:round:turnIndex)` und verändern `state.rng` nicht. Die Spiel-RNG wird nur in der Engine (Rad) weitergeschaltet.
- **Bot-Struktur:** Statt `heroBot.ts`/`bossBot.ts` gibt es `bots/evaluate.ts` (Bewertung je Figurtyp) und `bots/chooseTurn.ts` (probiert alle Bewegung × Aktion über `applyAction`). Angriffe werden mit Erwartungswert bewertet, nicht ausgewürfelt.
- **Spieler-Daten getrennt:** Name, Avatar und Controller liegen in `GameState.participants`, nicht in `Figure`, damit Regeln ab v0.3 nie an Identität kommen.
- **Unentschieden** („letzter Held und Boss sterben im selben Effekt“) ist in v0.1 über Angriffe nicht erreichbar; `checkVictory` deckt den Fall ab und ist getestet.
- **Offscreen-Canvas** nur zum Verkleinern des Profilbilds (256 × 256); gerendert wird damit nichts (SPEC 9: „kein Canvas außer im Malprogramm“).
- **Grenzregel-Durchsetzung per ESLint:** `src/engine`, `src/bots`, `src/lobby`, `src/lang` dürfen weder React/Zustand/i18next noch `window`, `document`, `localStorage`, `Date`, `Math.random` usw. verwenden. Testdateien sind ausgenommen.
- **Prettier formatiert keine Markdown-Dateien** (`docs/`, `*.md` in `.prettierignore`), damit Spec und Meilensteine unverändert bleiben.
- **Fehlende Englisch-Texte** fallen auf Deutsch zurück (`fallbackLng: 'de'`).

## 2026-11-06 – Umsetzung v0.2

- **Baumeister („Feld-Aktionen zählen doppelt“)** = `board.tileActionsPerAction: 2`: Nach einer Feld-Aktion bleibt der Zug offen für eine zweite (Feld + oder Feld −) oder Passen. Angreifen ist nach einer Feld-Aktion nicht mehr möglich.
- **Neue Ereignisse** `tileAdded` / `tileRemoved` (für `FELD_NEU` / `FELD_WEG` ab v0.3) und Statistik `tilesAdded` / `tilesRemoved`. Die Prüfungen liegen in `engine/tiles.ts`; v0.3 ruft sie aus `primitives.ts` auf.
- **Figuren blockieren das Entfernen** nur, wenn sie leben; ein Feld, auf dem nur eine tote Figur lag, darf weg.
- **Texturen werden immer in IndexedDB gespeichert**, auch ohne Haken „In meine Textur-Bibliothek“ (`inLibrary: false`), damit Felder im laufenden Spiel ihr Bild behalten. „Aus der Bibliothek entfernen“ blendet nur aus, statt zu löschen.
- **Textur-Namen liegen noch nicht im Spielzustand** (nur `textureId` am Feld). Für `feld.textur = "Sumpf"` in v0.3 braucht die Engine den Namen: geplant ist ein Register `GameState.textures: Record<id, name>`, das beim Anlegen gefüllt wird.
- **Leeres Bild = einfarbiges Feld:** Ohne Zeichnung oder Upload legt „Feld anlegen“ ein Feld ohne Textur an; der Name ist dann nicht nötig.
- **Malprogramm:** 128 × 128 Canvas, 3-fach vergrößert mit `image-rendering: pixelated`; quadratischer Pinsel 2/5/10 px, Radierer macht transparent, Fülleimer = 4-Wege-Scanline-Fill (`assets/paint/raster.ts`, getestet), Rückgängig bis 40 Schritte, Raster alle 8 px.
- **Bild-Zuschnitt verallgemeinert** (`ImageCropper`): Kreis für Avatare (256 px), Quadrat für Texturen (128 px). Dabei behoben: Unter React StrictMode wurde die Bild-URL im Dev-Modus vor dem Laden widerrufen, der Avatar-Upload aus v0.1 funktionierte dort nicht.
- **Bots und Felder:** Der Boss bewertet den mittleren Laufweg zwischen den Helden (Trennen), Helden mit 1 Leben ihre Ausweichfelder (Fluchtwege). Feld-Aktionen werden nur für die drei besten Zielfelder geprüft und müssen das Passen um 0,75 Punkte schlagen. Bots legen Felder ohne Textur an.
- **Brett-Layout:** Die SVG-Fläche umfasst immer den Ring möglicher neuer Felder, damit das Brett beim Wechsel in „Feld +“ nicht springt.

## 2026-11-06 – Planung v0.3 (vom Projektinhaber freigegeben)

- **Überlauf „Abstimmung“:** Alle lebenden Helden und der Boss stimmen ab, NPCs nicht. Mehrheit entscheidet, bei Gleichstand fällt die älteste Regel. Während der Abstimmung ist nur `voteRule` erlaubt, unabhängig davon, wer am Zug ist.
- **Überlauf „Ersteller wählt“:** Die Aktion `addRule` trägt dann `replaceRuleId`.
- **„Neue Regel aktiv: sofort“** bleibt als Einstellung erhalten (Widerspruch zu SPEC 6.1); Standard ist „nächste Runde“. Aktive und wartende Regeln zählen beide gegen das Maximum.
- **Feste Schutzregeln** in `engine/limits.ts`: 3 Effekte (+3 SONST), 1 Schaden/Heilung/Schild pro Effekt, Bewegung 0–3, Rad 25–75 %, Aussetzen 1 Zug, Kettentiefe 3, 50 Effekte pro Zug, Comeback-Ausweichen 50 %. Einstellbar bleiben nur die Werte aus SPEC 2.2.
- **Startregeln als AST in TypeScript** (`lang/library/startRules.ts`, mit Bau-Helfern in `lang/build.ts`); in v0.4 werden daraus Textdateien mit Round-Trip-Test.
- **SCHILD** blockt nur Rad-Treffer, keinen Regel-Schaden.
- **Neuer Kontextwert `von_feld`** (`fromTile`) bei BETRITT/VERLÄSST, damit „Eis rutscht“ die Laufrichtung kennt. Außerdem `figur.feld` (`figureTile`) als Feld-Bezug, z. B. für „Rückstoß“ (`angreifer.feld`).
- **Effekt-Budget:** Jede ausgeführte Effekt-Zeile zählt 1, egal wie viele Ziele sie trifft.
- **NPC-Züge** als Engine-Aktion `npcAct`; das Verhalten (verfolgt / wandert / steht / flieht) berechnet die Engine deterministisch. NPCs greifen Helden und Boss an, keine anderen NPCs. Ihr Tod entscheidet das Spiel nicht.
- **Beschreibungen der Startregeln** stehen in `de.json` (`startRules.*`); andere Regeln bekommen bis zur generierten Erklärung in v0.4 eine Kurzfassung aus Auslöser und Effekten.

## 2026-11-06 – Umsetzung v0.3

- **Event-Bus statt Ereignisliste:** Alle Engine-Funktionen senden Ereignisse über `emit(bus, event)`; die Runtime reagiert sofort darauf (Kettenreaktion = verschachtelter Aufruf mit `bus.depth`). `createGame`, Reducer und Zugablauf laufen alle über den Bus.
- **Bewegung, Schieben und Teleport** laufen über `movement.stepFigure` und senden VERLÄSST/BETRITT pro Schritt. Wird eine Figur unterwegs geschoben, getötet oder teleportiert, endet der restliche Weg.
- **Siegprüfung** nach jeder Aktion und an Zug-/Rundengrenzen, damit Regeln das Spiel mitten im Zug entscheiden können; „letzter Held und Boss im selben Effekt“ ergibt Unentschieden (getestet).
- **Regel-Schaden** zählt pro Figur und Runde (`ruleDamage`), Angriffe zählen nicht. Spawns zählen pro Runde (`spawnsThisRound`). Beides wird zu Rundenbeginn zurückgesetzt.
- **AUSSETZEN** verbraucht den Zug zu Zugbeginn (ohne ZUGSTART-Auslöser) und setzt eine Sperre, die bis zum Ende des nächsten normalen Zugs hält.
- **Textur-Namen** stehen jetzt im Spielzustand (`textureNames`), die Aktion `addTile` trägt den Namen mit. Regeln vergleichen Texte ohne Groß-/Kleinschreibung.
- **Variablen** sind Zahlen, Namen klein geschrieben; Identitätsnamen wie `rolle`, `name`, `ersteller` lehnt der Validator ab.
- **Regelwahl der Bots:** Nur wenn der beste Plan „Passen“ wäre, mit 35 % Chance; 5 zufällige passende Bibliotheksregeln werden mit 2 Runden Vorausschau (schnelle Zugstrategie) gegen „ohne Regel“ verglichen, Mindestgewinn 1,5 Punkte. Bots stimmen für die älteste Regel eines anderen Erstellers.
- **Regel-Bibliothek** in `localStorage` (`rr.library`): jede gespielte Regel wird gespeichert; Import/Export als JSON (`rule-rumble/rules`, Version 1); importierte Regeln werden gegen die Standard-Einstellungen geprüft, ungültige abgelehnt. Erreichbar über „Bibliothek“ auf dem Startbildschirm.
- **Anheften** merkt sich die Bibliotheks-ID der Regel (bleibt über Spiele hinweg erhalten).

