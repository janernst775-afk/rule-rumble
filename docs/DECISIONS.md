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
