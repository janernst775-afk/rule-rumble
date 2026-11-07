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

## 2026-11-07 – Umsetzung v0.4

- **Textsprache der zusätzlichen Kontextwerte:** `von_feld` (en `from_tile`) und `<figur>.feld` (z. B. `angreifer.feld`, en `attacker.tile`) sind Teil der Sprache; `auslöser.feld.typ` fragt den Typ des Felds einer Figur ab. Feldtypen stehen ohne Anführungszeichen (`feld.typ = lava`), Texturnamen mit (`feld.textur = "Sumpf"`).
- **Englische Schlüsselwörter** (Auszug): RULE, IF, AND, OR, NOT, THEN, ELSE, DURATION, LIMIT … PER ROUND/TURN/GAME, EVERY n ROUNDS; Ereignisse ROUND_START, ENTERS tile / new_tile, HIT …; Aktionen SPAWN, DAMAGE, HEAL, MOVE, WHEEL, PUSH … AWAY_FROM, MAKE … INTO, ADD NEXT_TO, SET, SHOW. Feldtypen en: ice, spring, trap. Der AST speichert immer die deutschen Feldtyp-IDs.
- **Startbibliothek als Textdatei** `lang/library/start.regeln.txt`, beim Laden geparst (Vite `?raw`). Regel-IDs entstehen aus dem Namen (`start.<slug>`); dadurch heißen vier i18n-Schlüssel jetzt `heilquelle-entspringt`, `falle-schnappt-zu`, `sumpfig`, `die-flut`. Die TS-Fassung aus v0.3 bleibt als Testvorlage; ein Test prüft, dass beide dieselben ASTs ergeben.
- **Parser** erholt sich zeilenweise: pro Zeile höchstens ein Fehler, Folgefehler („WENN fehlt“) werden unterdrückt. Vorschläge per Levenshtein-Abstand (höchstens 2 bzw. ein Drittel der Wortlänge).
- **Validator-Fehler im Editor** werden über eine Zeilentabelle des Parsers einer Zeile bzw. einem Baustein zugeordnet; „Wert gibt es bei diesem Auslöser nicht“ schlägt den ersten verfügbaren Wert vor (oder `alle`).
- **Klartext:** `explain.ts` ist rein und bekommt eine Übersetzungsfunktion; Startregeln behalten ihre handgeschriebenen Beschreibungen, alle anderen Regeln werden erklärt.
- **Stärke-Anzeige:** Heuristik aus Auslöser-Häufigkeit, Effekt-Gewichten, Zielmenge, Zufall, Limit und Dauer. Bots fügen keine weitere „heftige“ Regel hinzu, sobald eine im Spiel ist.
- **Testlauf:** 10 Runden mit der schnellen Bot-Strategie auf einer Kopie (alle Figuren werden von Bots gespielt; außerhalb eines Spiels in einem Demo-Spiel). Ereignisse aus Regel-Effekten tragen dafür die Regel als `cause`.
- **Baustein-Ansicht:** einfache Bedingungen (Zufall, Vergleich Wert gegen Zahl/Text/Feldtyp) und alle Effekte mit Zahlwerten sind als Bausteine editierbar; verschachtelte Bedingungen (ODER, NICHT, Klammern) und berechnete Werte erscheinen als grauer Code-Baustein, der in die Text-Ansicht wechselt. Effekte lassen sich per Pfeil umsortieren.
- **Drag & Drop** nutzt HTML5-Drag-&-Drop; jeder Baustein lässt sich alternativ per Klick hinzufügen (Tastatur).
- **Text-Ansicht** ist in v0.4 ein Textfeld mit Zeilennummern und Fehlerliste; Syntax-Farben, Autovervollständigung und Inline-Fehler kommen mit CodeMirror in v0.6. Die farbige Vorschau „Als Text“ zeigt den normalisierten Text.
- **Sprache der Regel-Texte** ist eine Profil-Einstellung (Einstellungen → „Sprache der Regel-Texte“).
- **Bearbeiten von Startregeln** erzeugt eine Kopie mit neuer ID und dem eigenen Namen als Autor; eigene Regeln werden überschrieben.

## 2026-11-07 – Umsetzung v0.5

- **Implizite Werte in Effekten:** Im Effekt-Körper ist nur `feld` (Ort des auslösenden Ereignisses) implizit verfügbar; Figuren und alles Weitere kommen über Parameter. So bleiben Effekte unabhängig vom Auslöser der aufrufenden Regel.
- **Effekte werden über ihren Namen aufgerufen** (eindeutig, ohne Groß-/Kleinschreibung, nur Buchstaben/Ziffern/_). In der Regel-Sprache: `DANN Erdbeben(1)`. Selbstaufrufe sind erlaubt und durch die Aufruftiefe begrenzt.
- **Bundle:** Eine Regel trägt die von ihr genutzten eigenen Effekte und NPC-Typen mit (`RuleDefinition.bundle`); beim Einfügen ins Spiel werden sie in `GameState.effects`/`npcTypes` übernommen und gegen die Einstellungen geprüft. Damit sind Spiele und exportierte Regeln in sich vollständig.
- **Interpreter:** Regel-Auswertung und Effekt-Körper laufen im selben Interpreter (`lang/interpreter.ts`) mit einem Budget pro Regel-Auslösung: 10 000 Schritte, Aufruftiefe 5, Listen ≤ 200, Wiederhole ≤ 10 (feste Schutzwerte in `EFFECT_LIMITS`). Abbruch erzeugt `effectAborted` und eine Verlaufsmeldung; bis dahin ausgeführte Grundaktionen bleiben bestehen.
- **Ursachen-Verfolgung** (Kettentiefe, Testlauf) nutzt den vorhandenen `cause`-Stapel des Event-Bus; Aktionen in Effekten zählen zur aufrufenden Regel.
- **NPC-Werte:** SPEC 5.9 (Leben 1–3, Bewegung 0–3) gilt statt der abweichenden Angabe in SPEC 5.2; die Grenzen stehen in `NPC_LIMITS`.
- **Speicherort:** Eigene Effekte und NPC-Typen liegen in `localStorage` (`rr.workshop`); die Werkstatt ist über Bibliothek und Regel-Editor erreichbar. Eingebaute NPC-Typen sind sichtbar, aber nicht änderbar.
- **Bausteine der Werkstatt:** Ausdrücke werden über Auswahllisten verschachtelt (Abfrage → Argumente). Für eine Textform von Effekt-Körpern gibt es noch keine Syntax; sie kommt mit dem Profi-Modus (v0.6).
- **Kompakte Auswahllisten** nutzen `field-sizing: content` (Chromium); andere Browser zeigen breitere Listen, funktional gleich.

## 2026-11-07 – Umsetzung v0.6

- **Ergänzungen für die SPEC-5.8-Beispiele:**
  - Neuer Feldtyp `wasser` (en `water`). Wie alle Feldtypen ist er nur ein Kennzeichen; Wirkung bekommt er erst durch Regeln.
  - Neue Abfrage `felder_am_rand`: Felder mit weniger als vier Nachbarn.
  - `selbst` gibt es nur im NPC-Zug.
  - `TELEPORT ziel NEBEN feld` springt auf ein zufälliges freies Nachbarfeld.
- **Zwei Tiefen-Grenzen:**
  - Effekt-Aufrufe: höchstens 5 tief (SPEC 5.7).
  - Funktions-Rekursion: höchstens 20 (SPEC 5.8).
  - Weitere feste Schutzwerte in `CODE_LIMITS`:
    - `NACH` 1–10 Runden
    - höchstens 20 wartende Blöcke
    - 200 Anweisungen und 10 Ebenen je Code-Definition (Baustein-Effekte bleiben bei 40/6)
    - Texte bis 200 Zeichen
- **Ein Parser für alles:** `parseProgram` liest Regeln, `EFFEKT`, `FUNKTION` und `NPC "…" ZUG` aus einem Text.
  - Regeln bleiben zeilenbasiert. Ein `DANN`/`SONST` darf eine Code-Anweisung oder einen Block (`DANN WENN … ENDE`) enthalten; das wird ein Effekt `{ kind: 'code' }`.
  - Lokale Variablen und Parameter verdecken Wörter der Regel-Sprache (`ziel`, `menge`).
  - `WENN … DANN` im Block ist optional mit `DANN`; `FÜR JEDE/JEDES/JEDEN` sind gleichwertig.
  - Parametertypen im Kopf: `Zahl, Text, Figur, Feld, Figuren, Felder, NPC_Typ, Textur, Sound`.
- **Regeln mit Code:** Ein Code-`DANN` zählt als ein Effekt (Grenze 3). Jede Grundaktion darin läuft weiter durch die Primitives und deren Grenzen.
- **Eigene Ereignisse** (`SENDE`/`WENN EREIGNIS`) haben keine Kontextwerte (wie `RUNDENSTART`) und unterliegen der Kettentiefe 3.
- **`NACH n RUNDEN`** speichert Block, lokale Variablen und Kontext als JSON in `GameState.delayed`. Der Block läuft beim Rundenstart vor den Regeln. Ist seine Regel nicht mehr im Spiel, entfällt er.
- **NPC-Code** (`NpcType.code`) ersetzt nur die Bewegungsvorlage; der automatische Angriff auf dem eigenen Feld bleibt. Kontext: `selbst`, `feld` = Feld des NPCs.
- **Funktionen sind rein:** Der Validator verbietet Grundaktionen, `SPIELE`, `TEXTUR`, `WARTE`, `SENDE`, `NACH` und `ZEIGE`; die Laufzeit ignoriert sie zusätzlich. Funktionen reisen im Bundle mit (`bundle.functions`, auch transitiv über NPC-Code).
- **Texte behalten ihre Schreibweise:** Vergleiche bleiben ohne Groß-/Kleinschreibung. Dadurch heißt eine per `TEXTUR` erzeugte Textur jetzt „Sumpf“ statt „sumpf“.
- **Einstellung „Profi-Code erlaubt“:** Ist sie aus, lehnt der Validator jede Profi-Konstruktion ab (`proCodeDisabled`). Normale Regeln und Baustein-Effekte bleiben erlaubt.
- **Debugger:** Der Interpreter zeichnet je Anweisung Zeile, lokale Variablen und Budget auf (höchstens 2000 Schritte). Die UI spielt die Aufzeichnung ab („Schritt“/„Weiter“).
  - Testgrundlage ist ein Demo-Spiel: Effekte laufen mit dem ersten Helden als Auslöser, NPC-Code mit einem frisch erschienenen NPC.
  - Die Variablen-Ansicht zeigt Figurennamen. Für den Code selbst bleiben Namen unlesbar.
- **Code-Editor:** CodeMirror 6 (`@codemirror/state, view, commands, language, autocomplete, lint` plus `@lezer/highlight`).
  - Syntax-Farben über einen StreamLanguage-Tokenizer, dessen Wörter aus `keywords.ts` kommen.
  - Die Werkstatt wird erst beim Öffnen nachgeladen (eigener Chunk).
- **Werkstatt-Aufbau:**
  - Umschalter „Bausteine | Profi-Code“ je Effekt. Code mit Fehlern lässt sich nicht zurück in Bausteine schalten.
  - Funktionen gibt es nur als Code.
  - Neue „Code-Datei“ für ganze Programme wie die SPEC-Beispiele. „Übernehmen“ verteilt Effekte und Funktionen in die Werkstatt, NPC-Verhalten an eigene NPC-Typen (die es schon geben muss) und Regeln in die Bibliothek.
- **Grauer Code-Baustein:** Anweisungen mit Profi-Teilen (Rechnen, Listen, Funktionsaufrufe, `SOLANGE`, `SENDE`, `NACH`, `ZEIGE` mit Ausdruck, `NEBEN`) erscheinen in der Baustein-Ansicht als grauer Block. Ein Klick öffnet die Code-Ansicht. Im Regel-Editor erscheint ein Code-`DANN` als graues Code-Feld.
- **Regel-Pakete** (`rule-rumble/package`, Version 1) enthalten Regeln, Effekte, Funktionen, NPC-Typen (mit Bild und Code), Texturen und `sounds` (bis v0.7 leer).
  - Texturen kommen nur mit, wenn ihr Name in einem Text der Regeln oder des Codes vorkommt.
  - „Als Paket speichern“ exportiert die gewählte Regel. „Alles als Paket“ exportiert alle eigenen Regeln samt Werkstatt.
  - Beim Import wird jedes Teil geprüft, ungültige werden gezählt und verworfen. Gleichnamige Effekte, Funktionen und NPC-Typen werden überschrieben. Regeln mit vergebener ID bekommen eine neue.

## 2026-11-07 – Umsetzung v0.7

- **Format der Aufnahmen:**
  - Gespeichert wird mono, 16 Bit, 22 050 Hz als WAV-Data-URL. Zuschnitt und Lautstärke sind beim Speichern schon eingerechnet; 3 s ergeben etwa 180 kB.
  - Die Aufnahme selbst läuft über MediaRecorder und Web Audio (`decodeAudioData`); die WAV-Kodierung ist eigener Code (`audio/wav.ts`).
  - Wer einen gespeicherten Sound bearbeitet, schneidet die gespeicherte Fassung erneut zu.
- **Speicher:** IndexedDB, Datenbank-Version 2 mit neuer Tabelle `sounds` neben `textures`.
- **Sound-Namen:**
  - Erlaubt sind Kleinbuchstaben, Ziffern und `_` (Umlaute erlaubt), höchstens 30 Zeichen. Jeder Name ist eindeutig.
  - `SPIELE "name"` sucht den Namen ohne Groß-/Kleinschreibung. Fehlt die Aufnahme, erklingt der synthetische Standard-Sound `ruleSound`.
- **NPC-Sound:** Feld `NpcType.sound` (Name eines Sounds). Er erklingt, wenn der NPC erscheint und wenn er am Zug ist. Die Engine merkt davon nichts; die UI spielt ihn zu den Ereignissen `spawned` und `turnStarted`.
- **„Eigene Sounds anderer Spieler stumm“:**
  - Lokale Vorliebe (`rr.prefs`), kein Spiel-Setting.
  - Ein Sound gilt als fremd, wenn sein Autor nicht der eigene Profilname ist (z. B. aus einem importierten Paket). Statt der Aufnahme spielt dann der synthetische Standard-Sound.
- **Ein Sound für jedes Spielereignis:** Alle Spielsounds kommen jetzt zentral aus den Ereignissen (`audio/eventSounds.ts`, als vollständige Tabelle über alle Ereignistypen).
  - Stumm bleiben nur Begleit-Ereignisse: `tileLeft`, `turnEnded`, `roundEnded`, `waited` und `gameOver` (Sieg-/Niederlage-Jingle auf dem Ergebnis).
  - Je Engine-Schritt spielen höchstens 4 verschiedene Sounds, leicht versetzt; ein angeforderter `SPIELE`-Sound hat Vorrang.
  - Die doppelten Feld-Sounds beim Klick und im Bot-Treiber sind entfallen.
- **`SPIELE` in Regeln ist kein Profi-Code:** Ein `DANN SPIELE "name"` wird als Code-Effekt gespeichert, zählt aber als Grundaktion (SPEC 5.7). Es ist also auch bei ausgeschaltetem Profi-Code erlaubt.
  - Im Regel-Editor gibt es dafür den Baustein „Sound abspielen“. Seine Auswahl bietet die eigenen Aufnahmen an; fehlende Namen sind als „nicht aufgenommen“ markiert.
- **Sound-Dialog** in der Effekt-Werkstatt („Sounds“, „+ Sound“):
  - Aufnahme bis 3 s, die nach 3 s automatisch stoppt.
  - Wellenform als SVG (kein Canvas), Anfang/Ende und Lautstärke (20–200 %) als Schieberegler.
  - Name, Abspielen, Speichern, Löschen.
  - Ohne Mikrofon oder ohne Erlaubnis erscheint eine Fehlermeldung.
- **Pakete:** `sounds` enthält Aufnahmen, deren Name in Regeln, Effekten, Funktionen oder NPC-Code als Text vorkommt oder die ein NPC-Typ als Sound nutzt.
  - Beim Import werden nur WAV-Data-URLs bis 600 kB und bis 3 s mit gültigem Namen angenommen.
  - Gleichnamige Sounds werden ersetzt, der Autor bleibt erhalten.
