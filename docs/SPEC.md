# Rule Rumble – Spezifikation

Verbindliche Spezifikation des Spiels. Arbeitsweise und Konventionen stehen in `CLAUDE.md`, die Meilensteine mit Abnahmekriterien in `docs/MILESTONES.md`. Die UI-Referenzbilder liegen in `docs/screens/`.

## 2. Spielidee & Ziel

Helden kämpfen allein oder im Team gegen einen Boss auf einem Spielbrett, das sie selbst verändern, und erfinden dabei laufend neue Spielregeln. Der Reiz liegt im Chaos aus selbstgebauten Regeln, ohne dass eine Regel das Spiel allein entscheiden kann.

**Spielmodi in Version 1** (alles lokal, ohne Netzwerk):

| Modus | Helden | Boss |
| --- | --- | --- |
| Solo | Du | Bot |
| Team | Du + 1–3 Bots | Bot |
| Boss-Modus | 1–4 Bots | Du |

**Sieg und Niederlage:**

- Der Boss stirbt → alle noch lebenden Helden gewinnen gemeinsam.
- Alle Helden sind tot → der Boss gewinnt.
- Helden dürfen sich für den Chaos-Faktor jederzeit gegenseitig angreifen. Wer dabei stirbt, ist raus und gewinnt nicht mit.
- Sterben der letzte Held und der Boss im selben Effekt, endet das Spiel unentschieden.

### 2.1 Startmenü & Lobby

Der Einstieg läuft wie bei bekannten Party-Spielen in drei Schritten: Startbildschirm, Lobby, Spiel.

1. **Startbildschirm**: Profilbild (Upload oder Farbe), Name, zwei große Knöpfe "Lobby erstellen" und "Beitreten" (Code eingeben, ab v1.x aktiv). Daneben "So geht's" (kurzes Tutorial) und Lautstärke.
2. **Lobby**: links die Teilnehmerliste mit Zähler (z. B. 4 / 5), Rolle pro Platz (Held / Boss), "Bot hinzufügen" mit Schwierigkeit und "Einladen" (Link kopieren). Rechts zwei Reiter: **Vorlagen** und **Eigene Einstellungen** (Abschnitt 2.2). Unten eine geschätzte Spieldauer und der Start-Knopf, den nur der Host drückt.
3. **Nach dem Spiel**: Ergebnis, "Regel-Album" (alle Regeln des Spiels mit Ersteller, zum Speichern in die Bibliothek), zurück in dieselbe Lobby.

In v1 ist die Lobby lokal: der Host füllt sie mit Bots. Der Einladen-Knopf ist sichtbar, zeigt aber "Online kommt bald". Lobby und Einstellungen sind so gebaut, dass sie später 1:1 vom Server synchronisiert werden.

### 2.2 Spiel-Einstellungen

Alle Zahlen dieses Dokuments sind Standardwerte. Der Host kann sie vor dem Spiel ändern und eigene Einstellungen als Vorlage speichern.

**Vorlagen** (Karten mit kurzer Beschreibung, Zahnrad öffnet ihre Einstellungen):

| Vorlage | Idee |
| --- | --- |
| Klassisch | alle Standardwerte |
| Chaos | 10 Regeln, mehr NPCs, Rad 40–60 %, PvP häufig |
| Taktik | 4 Regeln, kein Zufall in Regeln, kleineres Brett |
| Schnell | kleines Brett, Zugzeit 20 s, Boss weniger Leben |
| Baumeister | Feld-Aktionen zählen doppelt, Brett bis 100 Felder |
| Solo | 1 Held gegen Boss, Comeback an |

**Eigene Einstellungen** (gruppiert, jede Gruppe einklappbar):

| Gruppe | Einstellung | Standard | Optionen |
| --- | --- | --- | --- |
| Regeln | Max. aktive Regeln | 6 | 2–15 oder unbegrenzt |
| Regeln | Bei Überlauf | älteste fällt weg | älteste weg / Ersteller wählt, welche geht / neue Regel blockiert / Abstimmung |
| Regeln | Neue Regel aktiv ab | nächster Runde | sofort / nächste Runde / in 2 Runden |
| Regeln | Profi-Code erlaubt | an | an / aus |
| Regeln | Regel-Schaden pro Figur und Runde | 2 | 1–5 |
| Brett | Startgröße | 6 × 6 | 4 × 4 bis 10 × 10 |
| Brett | Min. / Max. Felder | 16 / 60 | 8–200 |
| Brett | Eigene Texturen | an | an / aus |
| Figuren | Helden-Leben | 3 | 1–10 |
| Figuren | Boss-Leben | 3 × Helden | fest oder × Helden |
| Figuren | Bewegung Held / Boss | 1 / 2 | 0–3 |
| Kampf | Rad-Chance | 50 % | 10–90 % |
| Kampf | Helden dürfen sich angreifen | an | an / aus |
| Kampf | Comeback bei 1 Leben | aus | an / aus |
| NPCs | Max. NPCs / Spawns pro Runde | 8 / 3 | 0–30 / 0–10 |
| Tempo | Zugzeit | unbegrenzt | 15 s – 3 min |
| Tempo | Rundenlimit | keins | 10–100, danach Boss gewinnt / Unentschieden |
| Bots | Bot-Tempo | normal | schnell / normal / langsam |

Die Engine liest alle Grenzen aus diesem Settings-Objekt, nicht aus Konstanten. Der Validator für Regeln und Effekte prüft gegen die Einstellungen des laufenden Spiels.

## 3. Spielablauf

Eine Runde besteht aus einem Zug pro Figur in der Zugfolge; NPCs, die durch Regeln entstehen, haben dort ebenfalls eigene Züge. Jeder Zug hat genau zwei Phasen: erst bewegen, dann eine Aktion.

**Rundenablauf:**

1. Rundenstart: Regeln mit Auslöser `RUNDENSTART` feuern. Regeln, die in der letzten Runde hinzugefügt wurden, werden jetzt aktiv.
2. Zugfolge: Helden in Sitzreihenfolge, dann der Boss, dann NPCs in der Reihenfolge ihres Erscheinens.
3. NPC-Züge: Jeder NPC zieht wie eine Figur (bewegen, dann angreifen, wenn möglich). Ein neuer NPC wird hinten eingereiht und zieht erst in der nächsten Runde.
4. Rundenende: Regeln mit Auslöser `RUNDENENDE` feuern, Dauer-Effekte zählen herunter.

**Ein Zug:**

1. **Bewegen** (immer zuerst): Held bis zu 1 Feld, Boss bis zu 2 Felder, nur orthogonal (oben, unten, links, rechts). Stehenbleiben ist erlaubt.
2. **Genau eine Aktion:**
   - **Angreifen**: nur wenn eine andere Figur oder ein NPC auf demselben Feld steht. Das Rad dreht 50/50; Treffer = 1 Leben Abzug, Fehlschlag = nichts. Ein Angriff beendet den Zug.
   - **Feld hinzufügen**: ein neues Feld orthogonal neben ein bestehendes Feld setzen, solange das Maximum nicht erreicht ist.
   - **Feld entfernen**: ein leeres Feld entfernen, solange das Brett zusammenhängend bleibt und das Minimum nicht unterschritten wird.
   - **Regel hinzufügen**: aus der Regel-Bibliothek wählen oder neu bauen (Abschnitt 5).
   - **Passen**.

**Lebenspunkte:**

| Figur | Leben | Bewegung |
| --- | --- | --- |
| Held | 3 | 1 Feld |
| Boss | 3 × Anzahl Helden (Solo: 4) | 2 Felder |
| NPC (Standard) | 1 | 1 Feld |

Mehrere Figuren dürfen auf demselben Feld stehen. Stehen mehrere andere Figuren dort, wählt der Angreifer sein Ziel.

## 4. Spielbrett

Das Brett ist ein quadratisches Gitter, das während des Spiels wächst und schrumpft, aber immer zwischen 16 und 60 Feldern bleibt und zusammenhängend sein muss.

| Wert | Standard |
| --- | --- |
| Startbrett | 6 × 6 = 36 Felder |
| Maximum | 60 Felder |
| Minimum | 16 Felder |
| Startpositionen | Helden in einer Ecke, Boss in der gegenüberliegenden |

- **Hinzufügen**: nur an eine freie Position, die orthogonal an ein bestehendes Feld grenzt. Das Brett darf dadurch über den Startrahmen hinauswachsen.
- **Entfernen**: nur ein Feld ohne Figuren und NPCs. Die Engine prüft per Flood-Fill, dass danach alle Felder verbunden bleiben, sonst ist das Feld ausgegraut.
- **Feld-Eigenschaften**: Jedes Feld hat `besucht_von` (Liste der Figuren, die es schon betreten haben, für "neues Feld"-Regeln) und optional einen `typ` (normal, lava, eis, heilquelle, falle). Typen entstehen nur durch Regeln.
- Im UI zeigen gestrichelte Platzhalter die möglichen neuen Felder, sobald "Feld hinzufügen" gewählt ist.

### 4.1 Feld-Texturen

Wer ein Feld anlegt, kann ihm sofort eine eigene Textur geben. Texturen sind zuerst Optik, können aber von Regeln abgefragt werden (`feld.textur = "Sumpf"`), damit Spieler mit ihnen spielen können.

- **Selbst zeichnen**: Mini-Malprogramm im Dialog "Feld anlegen". Leinwand 128 × 128 px, Pinsel (3 Größen), Radierer, Fülleimer, Pipette, Farbpalette (16 Farben + eigene), Rückgängig/Wiederholen, Raster-Hilfe und "Nahtlos"-Vorschau (zeigt 3 × 3 Kacheln nebeneinander).
- **Bild hochladen**: PNG/JPG/GIF/WebP bis 2 MB, quadratischer Zuschnitt mit Zoom, verkleinert auf 128 × 128 px.
- **Name**: Jede Textur bekommt einen Namen (z. B. "Sumpf"), damit Regeln sie ansprechen können.
- **Textur-Bibliothek**: gespeichert in IndexedDB, wiederverwendbar für neue Felder und in Regel-Effekten (`TEXTUR feld "Sumpf"`).
- **Feldtyp vs. Textur**: Regel-Feldtypen wie Lava bleiben als farbiger Rand + kleines Symbol über der Textur sichtbar, damit das Brett lesbar bleibt.
- Der Host kann eigene Texturen in den Einstellungen abschalten (dann einfarbige Felder).

## 5. Regel-System (Kern des Spiels)

Jede Regel ist ein Satz aus Auslöser, optionalen Bedingungen und Effekten: **WENN** etwas passiert, **UND** Bedingungen stimmen, **DANN** passieren Effekte. Spieler bauen Regeln über Bausteine oder als Text; beides wird in denselben JSON-AST übersetzt, geprüft und von einer Engine ausgeführt.

### 5.1 Aufbau einer Regel

| Teil | Pflicht | Beispiel |
| --- | --- | --- |
| Name | ja | "Zombie-Land" |
| Auslöser (WENN) | ja, genau einer | eine Figur betritt ein neues Feld |
| Bedingungen (UND) | nein, beliebig viele | Zufall 30 %, Runde > 3 |
| Effekte (DANN) | ja, 1 bis 3 | spawne Zombie auf diesem Feld |
| Sonst (SONST) | nein | Effekte, wenn die Bedingung nicht stimmt |
| Dauer | nein | für 5 Runden, Standard: bis Spielende |
| Limit | nein | höchstens 1-mal pro Runde |

### 5.2 Bausteine

**Auslöser:**

| Auslöser | Text-Schlüsselwort | Verfügbare Kontextwerte |
| --- | --- | --- |
| Runde beginnt | `RUNDENSTART` | `runde` |
| Runde endet | `RUNDENENDE` | `runde` |
| Zug einer Figur beginnt / endet | `ZUGSTART`, `ZUGENDE` | `auslöser` |
| Figur betritt ein Feld | `BETRITT feld` | `auslöser`, `feld` |
| Figur betritt ein Feld zum ersten Mal | `BETRITT neues_feld` | `auslöser`, `feld` |
| Figur verlässt ein Feld | `VERLÄSST feld` | `auslöser`, `feld` |
| Angriff (vor dem Rad) | `ANGRIFF` | `angreifer`, `ziel` |
| Treffer / Fehlschlag | `TREFFER`, `FEHLSCHLAG` | `angreifer`, `ziel` |
| Figur verliert Leben | `SCHADEN` | `auslöser`, `menge` |
| Figur oder NPC stirbt | `STIRBT` | `auslöser`, `feld` |
| Feld hinzugefügt / entfernt | `FELD_NEU`, `FELD_WEG` | `auslöser`, `feld` |
| Alle N Runden | `ALLE 3 RUNDEN` | `runde` |

**Ziele** (immer relativ zum Ereignis, nie ein bestimmter Spieler und nie "nur Boss" oder "nur Helden", siehe Balance): `auslöser`, `angreifer`, `ziel`, `alle_auf_feld`, `nachbarn` (Figuren auf angrenzenden Feldern), `nächste_figur`, `zufällige_figur`, `alle`, `alle_npcs`.

**Feld-Ziele** für Feld-Effekte: `feld` (Feld des Ereignisses), `nachbarfelder`, `zufälliges_feld`, `zufälliges_leeres_feld`, `alle_felder_typ lava`.

**Bedingungen:**

- `ZUFALL 30%`
- Vergleiche auf Werte: `auslöser.leben`, `auslöser.bewegung`, `runde`, `feld.typ`, `feld.anzahl_figuren`, `anzahl_felder`, `anzahl_npcs`, eigene Variablen
- Verknüpfungen: `UND`, `ODER`, `NICHT`, Klammern

**Effekte:**

| Effekt | Text | Obergrenze |
| --- | --- | --- |
| NPC erzeugen | `SPAWNE zombie AUF feld` | siehe Balance |
| Schaden | `SCHADEN ziel 1` | 1 pro Effekt |
| Heilen | `HEILE ziel 1` | 1, nie über Max-Leben |
| Bewegung ändern | `BEWEGUNG ziel +1 FÜR 1 RUNDE` | Ergebnis 0 bis 3 |
| Teleport | `TELEPORT ziel ZUFÄLLIG` | – |
| Schieben | `SCHIEBE ziel WEG_VON feld 1` | 1 Feld |
| Aussetzen | `AUSSETZEN ziel 1` | 1 Zug |
| Schild | `SCHILD ziel 1` | blockt nächsten Treffer |
| Feldtyp setzen | `MACHE feld ZU lava` | – |
| Feld entfernen / anlegen | `ENTFERNE feld`, `ANLEGE NEBEN feld` | Brett-Limits gelten |
| Rad-Chance ändern | `RADCHANCE ziel +10% FÜR 2 RUNDEN` | gesamt 25 % bis 75 % |
| Variable setzen | `SETZE auslöser.seelen + 1` | Zahl −1000 bis 1000 |
| Nachricht | `ZEIGE "Die Toten erheben sich!"` | 80 Zeichen |

**Eigene NPC-Typen**: Spieler können im Editor einen NPC-Typ definieren (Name, Symbol oder Bild, Leben 1–2, Bewegung 0–2, Verhalten: verfolgt nächste Figur / wandert zufällig / steht still). NPCs sind feindlich zu allen Figuren, auch zum Boss.

**Eigene Variablen**: Zahlen an Figuren (`auslöser.seelen`) oder global (`welt.flut`). Sie ermöglichen Regeln wie "Bei 3 Seelen +1 Leben".

### 5.3 Text-Mini-Sprache

Die Sprache ist deutsch, zeilenbasiert und nicht case-sensitiv. Jede Zeile beginnt mit einem Schlüsselwort. Kommentare beginnen mit `#`.

```
REGEL "Zombie-Land"
WENN BETRITT neues_feld
DANN SPAWNE zombie AUF feld
LIMIT 1 PRO RUNDE
```

```
REGEL "Lava steigt"
WENN ALLE 3 RUNDEN
DANN MACHE zufälliges_feld ZU lava

REGEL "Lava brennt"
WENN BETRITT feld
UND feld.typ = lava
DANN SCHADEN auslöser 1
```

```
REGEL "Seelensammler"
WENN STIRBT
DANN SETZE nachbarn.seelen + 1

REGEL "Seelen einlösen"
WENN ZUGSTART
UND auslöser.seelen >= 3
DANN HEILE auslöser 1
DANN SETZE auslöser.seelen = 0
```

```
REGEL "Glücksspiel"
WENN FEHLSCHLAG
UND ZUFALL 50%
DANN SCHADEN angreifer 1
SONST RADCHANCE angreifer +10% FÜR 1 RUNDE
DAUER 5 RUNDEN
```

**Grammatik (vereinfacht, EBNF):**

```
regel      = "REGEL" string NL ausloeser NL { bedingung NL } effekt NL { effekt NL } [ sonst ] [ dauer ] [ limit ]
ausloeser  = "WENN" ereignis
bedingung  = "UND" ausdruck
effekt     = "DANN" aktion
sonst      = "SONST" aktion NL { "SONST" aktion NL }
dauer      = "DAUER" zahl "RUNDEN"
limit      = "LIMIT" zahl "PRO" ( "RUNDE" | "ZUG" | "SPIEL" )
ausdruck   = vergleich { ( "UND" | "ODER" ) vergleich } | "NICHT" ausdruck | "(" ausdruck ")" | "ZUFALL" zahl "%"
vergleich  = wert ( "=" | "!=" | "<" | ">" | "<=" | ">=" ) wert
wert       = zahl | string | pfad
pfad       = name { "." name }
```

### 5.4 Baustein-Editor

- Drei Spalten wie Puzzleteile: WENN (gelb), UND (blau), DANN (grün), farblich mit den Text-Schlüsselwörtern verbunden.
- Bausteine werden aus einer Palette gezogen; Werte (Zahlen, Ziele, NPC-Typ) per Dropdown oder Zahlenfeld.
- Umschalter "Bausteine ⇄ Text": wechselt live zwischen beiden Ansichten desselben AST. Text mit Fehlern lässt sich nicht zurück in Bausteine umschalten, bis er geprüft ist.
- Unter dem Editor steht immer eine **Klartext-Vorschau** ("Wenn jemand ein neues Feld betritt, erscheint dort ein Zombie, höchstens einmal pro Runde."), automatisch aus dem AST erzeugt.
- **Fehlermeldungen** sind freundlich und zeigen Zeile + Vorschlag: "Zeile 3: `auslöser` gibt es bei RUNDENSTART nicht. Meintest du `alle`?"
- **Testlauf-Knopf**: simuliert die Regel 10 Runden lang auf einer Kopie des aktuellen Spielstands und zeigt, wie oft sie feuert und wen sie trifft.

### 5.5 Regel-Bibliothek

- Jede einmal gespielte Regel wird lokal gespeichert (localStorage, später Konto) und kann wieder ausgewählt werden.
- Mitgeliefert: 15–20 Startregeln (z. B. Zombie-Land, Lava steigt, Eisflächen rutschen 1 Feld weiter, Heilquelle, Falle, Erdbeben entfernt zufälliges leeres Feld).
- Filter nach Auslöser und Effekt, Suche nach Name, Export und Import als JSON-Text zum Teilen.

### 5.6 Technische Umsetzung

- **Tokenizer + Recursive-Descent-Parser** für den Text, ergibt `RuleAST`. Der Baustein-Editor erzeugt direkt `RuleAST`. Ein **Printer** macht aus `RuleAST` wieder Text, ein zweiter die Klartext-Vorschau.
- **Validator** prüft Typen, verfügbare Kontextwerte pro Auslöser und alle Obergrenzen aus Abschnitt 6. Ungültige Regeln können nicht gespeichert werden.
- **Engine**: Event-Bus. Jede Spielaktion sendet Ereignisse; aktive Regeln reagieren in der Reihenfolge, in der sie hinzugefügt wurden. Effekte können neue Ereignisse auslösen (Kettenreaktionen), begrenzt durch die Schutzregeln in Abschnitt 6.
- Kein `eval`, kein JavaScript aus Spielertext. Die Sprache ist eine reine Datenbeschreibung.

### 5.7 Eigene Effekte (Effekt-Werkstatt)

Spieler sind nicht auf die mitgelieferten Effekte beschränkt: In der Effekt-Werkstatt bauen sie eigene Effekte mit Namen und Parametern, die danach in jeder Regel wie ein eingebauter Effekt verwendet werden. Einsteiger nutzen Bausteine, Erfahrene schreiben Code; beides ergibt denselben Effekt-AST.

**Aufbau eines eigenen Effekts:**

- Name + Symbol (gezeichnet oder Vorlage), z. B. "Erdbeben"
- Parameter mit Typ: `Zahl`, `Figur`, `Feld`, `Menge` (von Figuren oder Feldern), `Text`, `NPC-Typ`, `Textur`, `Sound`
- Körper: eine Folge von Schritten aus Grundaktionen und Steuerbausteinen

**Grundaktionen** = alle Effekte aus 5.2 plus `SPIELE sound`, `TEXTUR feld "Name"`, `WARTE 0.5` (nur für Animation), `MERKE x = …` (lokale Variable).

**Steuerbausteine:**

| Baustein | Text | Grenze |
| --- | --- | --- |
| Wenn / Sonst | `WENN … DANN … SONST … ENDE` | – |
| Wiederhole | `WIEDERHOLE 3 MAL … ENDE` | max. 10 |
| Für jede Figur / jedes Feld | `FÜR JEDE f IN nachbarn(feld, 2) … ENDE` | max. 200 Elemente |
| Zufällige Auswahl | `WÄHLE ZUFÄLLIG f AUS alle_figuren` | – |
| Anderen Effekt aufrufen | `Erdbeben(2)` | Tiefe max. 5 |

**Abfragen** (liefern Werte oder Mengen): `figuren_auf(feld)`, `nachbarfelder(feld, radius)`, `felder_mit_typ(lava)`, `felder_mit_textur("Sumpf")`, `leere_felder`, `alle_figuren`, `alle_npcs`, `nächste_figur(feld)`, `entfernung(a, b)`, `zufallszahl(1, 6)`, `anzahl(menge)`.

**Beispiel in Bausteinen gedacht, als Text:**

```
EFFEKT "Erdbeben" (stärke: Zahl)
  SPIELE "rumpeln"
  FÜR JEDES f IN nachbarfelder(feld, stärke)
    WENN ZUFALL 30% UND anzahl(figuren_auf(f)) = 0
      ENTFERNE f
    ENDE
  ENDE
ENDE

REGEL "Beben bei Treffer"
WENN TREFFER
DANN Erdbeben(1)
```

### 5.8 Profi-Modus (Code)

Für erfahrene Spieler gibt es eine Code-Ansicht mit voller Programmierfreiheit. Die Profi-Sprache ist eine Erweiterung der Regel-Sprache um Funktionen, Schleifen, Listen und eigene Ereignisse. Sie läuft in einem eigenen Interpreter, nie als JavaScript.

**Schlüsselwörter:** Deutsch wie in der Regel-Sprache, jedes Schlüsselwort hat einen gleichwertigen englischen Alias (`WENN`/`IF`, `DANN`/`THEN`, `SONST`/`ELSE`, `FÜR JEDES`/`FOR EACH`, `SOLANGE`/`WHILE`, `FUNKTION`/`FUNCTION`, `GIB ZURÜCK`/`RETURN`, `ENDE`/`END` …). Groß-/Kleinschreibung egal, Umlaute auch als `UE`/`OE`/`AE` erlaubt. Der Printer gibt die Sprache aus, in der der Spieler schreibt (Einstellung pro Profil). Die Alias-Tabelle steht an genau einer Stelle im Code (`lang/keywords.ts`).

**Zusätzlich zu 5.7:**

- `FUNKTION name(a, b) … GIB ZURÜCK wert … ENDE` (eigene Berechnungen, keine Weltveränderung erlaubt)
- `SOLANGE bedingung … ENDE`, Listen `[1, 2, 3]`, `liste.füge_hinzu(x)`, `liste.länge`, Text-Verkettung
- Eigene Ereignisse: `SENDE "vulkan_ausbruch"` und als Auslöser `WENN EREIGNIS "vulkan_ausbruch"`
- Zeitverzögert: `NACH 2 RUNDEN … ENDE`
- Welt-Variablen über Regeln hinweg: `welt.flut`, `welt.rundenzähler`
- Eigenes NPC-Verhalten: `NPC "Geist" ZUG … ENDE` ersetzt das Standardverhalten des NPC-Typs

```
FUNKTION schwächste(menge)
  MERKE beste = KEINE
  FÜR JEDE f IN menge
    WENN beste = KEINE ODER f.leben < beste.leben
      MERKE beste = f
    ENDE
  ENDE
  GIB ZURÜCK beste
ENDE

NPC "Geist" ZUG
  MERKE ziel = schwächste(alle_figuren)
  TELEPORT selbst NEBEN ziel.feld
  SPIELE "buh"
ENDE

REGEL "Flut"
WENN RUNDENENDE
DANN SETZE welt.flut + 1
DANN WENN welt.flut >= 4
  FÜR JEDES f IN felder_am_rand
    MACHE f ZU wasser
  ENDE
  SENDE "flut"
  SETZE welt.flut = 0
ENDE
```

**Sicherheit und Balance trotz voller Freiheit:**

- Die Welt lässt sich nur über die Grundaktionen verändern. Jede Grundaktion geht durch dieselben Obergrenzen wie in Abschnitt 6, egal ob aus Baustein, Text oder Code.
- Rolle und Name einer Figur sind im Code nicht lesbar; "für alle gleich" gilt auch hier.
- Rechenbudget: max. 10 000 Schritte pro Auslösung, Rekursion max. 20, Listen max. 200 Elemente. Bei Überschreitung bricht der Effekt ab, Änderungen bis dahin bleiben, das Log zeigt warum.
- Kein Zugriff auf Netzwerk, Dateien, DOM oder JavaScript.

**Bausteine ⇄ Code:** Alles aus Bausteinen lässt sich als Code anzeigen. Code, der Profi-Funktionen nutzt, erscheint in der Baustein-Ansicht als grauer "Code-Baustein", der sich per Klick in der Code-Ansicht öffnet. So können Einsteiger Profi-Effekte trotzdem benutzen.

**Code-Editor:** CodeMirror 6 mit Syntax-Farben, Autovervollständigung (Schlüsselwörter, Kontextwerte, eigene Effekte und Texturen), Fehlern direkt in der Zeile, Testlauf und Schritt-für-Schritt-Ausführung mit Variablen-Ansicht.

### 5.9 Eigene NPC-Typen und Pakete

- **NPC-Typ**: Name, Aussehen (zeichnen wie Texturen oder Bild hochladen), Sound (aufnehmen), Leben 1–3, Bewegung 0–3, Verhalten aus Vorlage (verfolgt, wandert, steht, flieht) oder eigenes Verhalten per Code.
- **Regel-Paket**: Regeln, Effekte, NPC-Typen, Texturen und Sounds lassen sich zusammen als eine Datei exportieren und importieren (JSON, Bilder und Sounds eingebettet). Damit können Spieler ganze "Spielmodi" teilen.

**Gewichtung:** NPCs sind nur eine von vielen Möglichkeiten, kein Kern des Spiels. Zombies sind lediglich ein Beispiel. Die Startbibliothek soll die Breite zeigen: Brett verändern, Bewegung, Rad-Chancen, Variablen, Texturen, Teleport, Schilde. Höchstens 2 der Startregeln erzeugen NPCs.

## 6. Balance

Zwei Prinzipien halten das Spiel fair: Jede Regel wirkt auf alle gleich, und harte Obergrenzen im Validator und in der Engine verhindern, dass eine Regel oder eine Kettenreaktion das Spiel sofort entscheidet.

Alle Werte in 6.2 sind Standardwerte aus den Spiel-Einstellungen (2.2). Fest im Code bleiben nur die Schutzregeln, die nie abschaltbar sind: kein Sofort-Tod, Regeln für alle gleich, Kettenreaktions- und Rechenzeit-Grenzen.

### 6.1 Regeln gelten für alle gleich

- Ziele sind nur relativ zum Ereignis (`auslöser`, `ziel`, `nachbarn` …). Es gibt keine Ziele wie "Spieler Anna", "nur der Boss", "nur Helden" oder "der Ersteller".
- Bedingungen dürfen nicht nach Rolle oder Name filtern (`auslöser.rolle` existiert nicht).
- Eine neue Regel wird erst zum **nächsten Rundenstart** aktiv, damit der Ersteller sie nicht im selben Zug ausnutzt.
- Der Ersteller wird in der Regel-Liste angezeigt, hat aber keinen Vorteil.

### 6.2 Feste Obergrenzen

| Bereich | Grenze |
| --- | --- |
| Aktive Regeln gleichzeitig | Einstellung (Standard 6); was bei Überlauf passiert, ist ebenfalls einstellbar |
| Effekte pro Regel | 3 (+ 3 im SONST-Zweig) |
| Schaden pro Effekt | 1 |
| Regel-Schaden pro Figur und Runde | 2 (Angriffe zählen nicht dazu) |
| Heilung | 1 pro Effekt, nie über Max-Leben |
| Max-Leben ändern | nicht erlaubt |
| Bewegung | Ergebnis immer 0 bis 3 |
| Rad-Chance | Ergebnis immer 25 % bis 75 % |
| Aussetzen | höchstens 1 Zug am Stück, dieselbe Figur nicht 2 Züge hintereinander |
| Spawns | max. 3 pro Runde, max. 8 NPCs gleichzeitig auf dem Brett |
| Brettgröße | Regeln halten sich an 16–60 Felder und Zusammenhang |
| Kettenreaktionen | max. Tiefe 3, max. 50 Effekte pro Zug; danach stoppt die Kette mit Hinweis |
| Sofort-Sieg / Sofort-Tod | nicht ausdrückbar (kein "setze Leben = 0") |

Die Engine erzwingt die Grenzen auch zur Laufzeit (z. B. wenn zwei Regeln zusammen mehr als 2 Schaden würden): überschüssige Effekte verfallen und erscheinen im Log.

### 6.3 Weitere Balance-Hebel

- **Stärke-Anzeige** (nur Info): Der Editor zeigt eine Einschätzung "harmlos / spannend / heftig", berechnet aus Effekten, Zufall und Auslöserhäufigkeit. Bots nutzen sie, um keine "heftigen" Regeln zu stapeln.
- **Comeback**: Eine Figur mit 1 Leben bekommt bei Regel-Schaden 50 % Ausweichchance. (Kann in den Einstellungen abgeschaltet werden.)
- **Simulations-Test** im Entwickler-Modus: 1000 Bot-gegen-Bot-Spiele mit zufälligen Bibliotheksregeln; Ziel ist eine Boss-Siegquote von 40–60 %. Damit werden Lebenspunkte und Grenzen feinjustiert.

## 7. Bots

Bots treffen Entscheidungen über eine einfache Bewertungsfunktion: Sie probieren alle gültigen Züge (Bewegung × Aktion) auf einer Kopie des Spielstands durch und wählen den mit der besten Punktzahl. Zufall verhindert, dass sie vorhersehbar werden.

| Schwierigkeit | Verhalten |
| --- | --- |
| Leicht | 40 % zufällige Aktion, wählt nur Bibliotheksregeln |
| Normal | Bewertungsfunktion, 15 % Zufall |
| Schwer | Bewertungsfunktion mit 1 Zug Vorausschau, nutzt eigene Regeln aus Vorlagen |

**Boss-Bot**: läuft auf den schwächsten erreichbaren Helden zu, greift an, wenn möglich, entfernt Felder, um Helden zu trennen, und wählt Regeln, die mehrere Figuren gleichzeitig treffen.

**Helden-Bot**: hält Abstand, solange er 1 Leben hat, sucht sonst gemeinsam mit anderen Helden den Boss, legt Felder für Fluchtwege an. Greift andere Helden nur selten an (Chaos-Wert 5 %, einstellbar).

**Regelwahl der Bots**: Sie bewerten Regeln mit dem Testlauf aus 5.4 und nehmen die, die laut Simulation ihnen am meisten nützt. Da Regeln für alle gelten, ist das automatisch begrenzt.

Bots ziehen mit kurzer Animation (ca. 0,6 s pro Schritt), damit man ihre Züge verfolgen kann.

## 8. UI-Stil & Profilbilder

Der Look orientiert sich an verspielten Party-Zeichenspielen: kräftiger lila Verlauf mit Kritzel-Muster, weiße Karten mit großen Rundungen, dicke runde Schrift und große, "drückbare" Knöpfe mit hartem Schatten. Logos, Namen und Grafiken bestehender Spiele werden nicht übernommen.

| Token | Wert |
| --- | --- |
| Hintergrund | Verlauf #6C3BD9 → #9B5CF6, darauf helles Kritzel-Muster mit 8 % Deckkraft |
| Karten | #FFFFFF, Radius 24 px, Schatten 0 6 px 0 rgba(0,0,0,.18) |
| Primärknopf | #FFC83D, Text #2B1A4A, Radius 16 px, Schatten 0 5 px 0 #C9951A |
| Akzente | Grün #34C77B, Blau #3DA5FF, Rot #FF5A5F, Pink #FF7AC6 |
| Schrift | "Baloo 2" oder "Fredoka" (Google Fonts), Überschriften 800 |
| Felder | Weiß mit 3 px dunkellila Rand, neue Felder gestrichelt |

**Profilbilder**

- In der Lobby klickt man auf den Avatar und wählt ein Bild vom PC (PNG, JPG, GIF, WebP, max. 2 MB).
- Das Bild wird kreisrund zugeschnitten (einfacher Zuschnitt-Dialog mit Zoom), auf 256 × 256 px verkleinert und als Data-URL in localStorage gespeichert.
- Ohne Bild bekommt jede Figur einen farbigen Kreis mit Initialen. Helden erhalten nacheinander Grün, Blau, Pink, Orange; der Boss bekommt Rot #E5383B mit Kronen-Symbol. Die Farbe ist in der Lobby änderbar.
- Auch der Boss kann ein eigenes Bild bekommen.

**Screens**

1. **Startbildschirm**: Profilbild, Name, "Lobby erstellen", "Beitreten" (ab v1.x), "So geht's", Lautstärke.
2. **Lobby**: Teilnehmer links (Bots hinzufügen, Einladen), rechts Reiter "Vorlagen" / "Eigene Einstellungen", unten Spieldauer und Start.
3. **Spielbrett**: Brett in der Mitte, oben wer am Zug ist und welche Phase. Spieler, aktive Regeln und Verlauf als einklappbare Seitenleisten, unten die Aktionsleiste (Angreifen, Feld +, Feld −, Regel, Passen).
4. **Feld anlegen**: Platz wählen, Textur zeichnen oder hochladen, Name.
5. **Angriffs-Rad**: Overlay mit zweifarbigem Rad, dreht ca. 2 s.
6. **Regel-Editor**: Bausteine/Text, Palette, Klartext-Vorschau, Stärke, Testlauf.
7. **Effekt-Werkstatt**: eigene Effekte und NPC-Typen, Bausteine oder Profi-Code, Testlauf mit Variablen-Ansicht.
8. **Bibliothek**: Regeln, Effekte, Texturen, Sounds, Pakete; Suche, Filter, Import/Export.
9. **Ergebnis**: Sieger, Statistik, Regel-Album, zurück in die Lobby.

Die Referenzbilder im Projekt zeigen Startbildschirm, Lobby mit Einstellungen, Spielbrett, Feld anlegen mit Textur-Malprogramm, Regel-Editor, Effekt-Werkstatt (Profi-Code) und Angriffs-Rad.

### 8.1 Übersichtlichkeit

Das Brett hat immer Vorrang: Alles andere ist einklappbar oder erscheint nur bei Bedarf.

- **Einklappbare Seitenleisten**: Spieler (links), aktive Regeln und Verlauf (rechts). Eingeklappt bleibt nur eine schmale Leiste mit Symbolen und Zählern (z. B. "Regeln 3"). Der Zustand wird gespeichert.
- **Aktive Regeln**: eingeklappt als kurze Titel, ausgeklappt mit Klartext. Regeln lassen sich anheften; neue Regeln blinken einmal kurz, Regeln, die gerade feuern, leuchten auf.
- **Feld-Info bei Hover/Tipp**: Textur-Name, Feldtyp, wer darauf steht, welche Regeln hier wirken würden.
- **Klare Zugphase**: Oben steht immer, wer am Zug ist und was jetzt zu tun ist ("Bewege dich" / "Wähle eine Aktion"). Nicht mögliche Aktionen sind ausgegraut mit Grund im Tooltip.
- **Ereignis-Toasts**: kurze Meldungen am Brettrand, wenn Regeln feuern ("Zombie-Land: Zombie auf C2"); der volle Verlauf ist im Log.
- **Zoom & Verschieben** des Bretts, "Zentrieren"-Knopf; bei großen Brettern Mini-Karte.
- **Tastenkürzel**: Pfeile bewegen, 1–5 Aktionen, R Regeln ein/aus, Leertaste dreht das Rad.

### 8.2 Sound & Musik

- **Effekt-Sounds**: Schritt, Feld anlegen, Feld entfernen, Rad dreht (Ticken), Treffer, Daneben, Spawn, Regel aktiv, Regel feuert, Schaden, Tod, Sieg, Niederlage, Knopf-Klick.
- **Hintergrundmusik**: eigene Loops für Startmenü/Lobby, Spiel und "Boss-Phase" (startet, wenn der Boss unter 30 % Leben fällt). Weicher Übergang zwischen den Loops.
- **Mikrofon-Aufnahme**: im Sound-Dialog bis 3 s aufnehmen, Anfang und Ende zuschneiden, Lautstärke anpassen, benennen. Verwendbar in Regeln/Effekten (`SPIELE "zombie_stöhnen"`) und als NPC-Sound. Speicher in IndexedDB.
- **Einstellungen**: getrennte Regler für Musik und Effekte, Stumm-Knopf immer sichtbar oben rechts, Option "Eigene Sounds anderer Spieler stumm".
- **Technik**: Web Audio API für Synthese und Wiedergabe, MediaRecorder für Aufnahmen. Zum Start sind alle Sounds und Musik synthetisch erzeugt; später können CC0-Dateien sie ersetzen.

## 9. Technik & Datenmodell

Die Spiellogik ist ein eigenständiges TypeScript-Modul ohne UI, das nur Zustand + Aktion → neuen Zustand + Ereignisse berechnet. So kann sie später unverändert auf einem Server für Multiplayer laufen.

| Bereich | Wahl |
| --- | --- |
| Build | Vite + TypeScript (strict) |
| UI | React, Brett als SVG |
| Zustand | Zustand (Library) im UI, reiner Reducer in der Engine |
| Animation | CSS-Transitions, Framer Motion für Rad und Figuren |
| Tests | Vitest für Engine, Parser, Validator |
| Speicher | localStorage (Profile, Regel-Bibliothek, Einstellungen) |
| Zufall | Seed-basierter RNG in der Engine, damit Spiele reproduzierbar sind |

**Weitere technische Entscheidungen:**

- **Geräte**: nur Desktop-Browser (Chrome, Firefox, Edge, Safari aktuell), Maus + Tastatur, Mindestbreite 1280 px. Kein Touch- oder Handy-Layout.
- **Darstellung**: React + SVG für das Brett, normales DOM für Panels. Kein Canvas außer im Malprogramm.
- **Sprachen**: alle UI-Texte über i18n (`react-i18next`), Dateien `src/locales/de.json` und `en.json`. Deutsch ist vollständig, Englisch darf anfangs leer sein. Kein UI-Text direkt im Komponenten-Code.
- **Audio**: alle Sounds und Musik-Loops zunächst synthetisch mit der Web Audio API erzeugt (`src/audio/synth.ts`), hinter einer Schnittstelle, die später echte Dateien abspielen kann. Kein Howler.js nötig, solange keine Dateien genutzt werden.
- **Hosting**: Git-Repository auf GitHub, automatisches Deployment auf GitHub Pages per GitHub Actions bei jedem Push auf `main` (Vite `base` passend setzen). Ab v0.1.

**Ordnerstruktur:**

```
src/
  engine/        # reine Spiellogik, keine React-Imports
    state.ts       GameState, Figure, Tile, Npc
    settings.ts    Settings-Typ, Standardwerte, Vorlagen (Klassisch, Chaos …)
    actions.ts     move, attack, addTile, removeTile, addRule, pass
    reducer.ts     applyAction(state, action) -> { state, events }
    primitives.ts  alle Grundaktionen + Durchsetzung der Obergrenzen
    events.ts      Event-Typen + Event-Bus
    rng.ts
    board.ts       Nachbarn, Zusammenhang (Flood-Fill), Limits
  lang/          # Regel-Sprache + Profi-Sprache
    ast.ts         RuleAST, EffectAST, ExprAST
    lexer.ts
    parser.ts      Text -> AST
    printer.ts     AST -> Text
    explain.ts     AST -> Klartext
    validator.ts   Typen, Kontextwerte, Obergrenzen, Profi-Code erlaubt?
    interpreter.ts Ausführung mit Schritt-Budget
    runtime.ts     verbindet Regeln mit Events
    library/       Startregeln + Starteffekte als Textdateien
  bots/
    evaluate.ts  heroBot.ts  bossBot.ts
  audio/
    sfx.ts  music.ts  recorder.ts
  assets/
    store.ts       IndexedDB: Texturen, Sounds, Pakete
    paint/         Mini-Malprogramm (Canvas)
  net/           # leer in v1, später Lobby-Sync + Server-Client
  ui/
    screens/       Start, Lobby, Game, TileCreate, RuleEditor, EffectWorkshop, Library, Result
    components/    Board, Tile, Avatar, ActionBar, Wheel, CollapsiblePanel, RuleCard, BlockCanvas, CodeEditor, Toast
    theme.css
```

**Zentrale Typen (Entwurf):**

```ts
type Pos = { x: number; y: number };

interface Tile {
  pos: Pos;
  type: 'normal' | 'lava' | 'eis' | 'heilquelle' | 'falle';
  visitedBy: string[];
}

interface Figure {
  id: string;
  name: string;
  role: 'hero' | 'boss';          // nur Engine intern, für Regeln unsichtbar
  controller: 'human' | 'bot';
  avatar: { image?: string; color: string };
  pos: Pos;
  hp: number; maxHp: number;
  move: number;                    // 1 Held, 2 Boss
  wheelChance: number;             // 0.5 Standard
  vars: Record<string, number>;
  statuses: Status[];              // Schild, Aussetzen, Bewegung +1 … mit Restdauer
  alive: boolean;
}

interface RuleAST {
  id: string; name: string; author: string;
  trigger: Trigger;
  conditions: Expr[];
  effects: Effect[];       // 1..3
  elseEffects?: Effect[];  // 0..3
  duration?: number;       // Runden
  limit?: { count: number; per: 'round' | 'turn' | 'game' };
}

interface GameState {
  seed: number; round: number; turnIndex: number;
  phase: 'move' | 'action' | 'npc' | 'over';
  tiles: Record<string, Tile>;   // Schlüssel "x,y"
  figures: Figure[]; npcs: Npc[]; npcTypes: NpcType[];
  rules: ActiveRule[];           // inkl. activeFromRound, firedThisRound
  log: LogEntry[];
  winner?: 'heroes' | 'boss' | 'draw';
}
```

## 10. Roadmap & offene Fragen

| Meilenstein | Inhalt | Fertig, wenn … |
| --- | --- | --- |
| v0.1 Grundspiel | Startbildschirm, lokale Lobby mit Bots und Einstellungen (Vorlagen), Brett, Bewegung, Angriff mit Rad, Leben, Sieg, Bots (Normal), einklappbare Panels | ein Spiel läuft vom Startbildschirm bis zum Ergebnis |
| v0.2 Brettbau & Texturen | Feld anlegen/entfernen, Mini-Malprogramm, Bild-Upload, Textur-Bibliothek | Felder mit eigenen Texturen im Spiel |
| v0.3 Regel-Engine | AST, Validator, Runtime, Obergrenzen aus Settings, Startregeln, Bibliothek | Startregeln wirken, Tests grün |
| v0.4 Regel-Editor | Text-Sprache, Baustein-Editor, Klartext, Testlauf | eigene Regeln per Text und Bausteinen |
| v0.5 Effekt-Werkstatt | eigene Effekte in Bausteinen, NPC-Typen, Interpreter mit Budget | eigener Effekt in einer Regel nutzbar |
| v0.6 Profi-Modus | Funktionen, Schleifen, Listen, Ereignisse, Code-Editor, Debugger, Pakete | Profi-Beispiele aus 5.8 laufen |
| v0.7 Sound | Effekt-Sounds, Musik, Mikrofon-Aufnahme, Lautstärke | alle Ereignisse hörbar, eigene Sounds in Regeln |
| v0.8 Feinschliff | Animationen, Schwierigkeiten, Boss-Modus für Menschen, Balance-Simulation, Tutorial | Simulation im Zielbereich |
| v1.x Online | Server mit derselben Engine, Einladungslink, Lobby-Sync, Beitreten per Code | Spiel mit Freunden online |

**Offene Fragen** (Annahmen in Klammern, bis du sie änderst):

- [ ] Ist Bewegen Pflicht, oder darf man stehen bleiben? (stehen bleiben erlaubt)
- [ ] Soll "Regel entfernen" eine eigene Aktion sein? (nein, älteste fällt bei 7 Regeln weg)
- [ ] Passen die Brettgrenzen 16–60 Felder und der Start mit 6 × 6?
- [ ] Boss-Leben im Solo-Modus: 4 genug, oder mehr?
- [x] Entschieden: NPCs haben eigene Züge in der Zugfolge.
- [ ] Comeback-Mechanik (Ausweichen bei 1 Leben) standardmäßig an oder aus?
- [ ] Endgültiger Spielname?

**Neu durch die Überarbeitung:**

- [x] Entschieden: Profi-Sprache deutsch mit englischen Aliasen.
- [ ] Sollen eigene Texturen und Sounds später online für andere Spieler sichtbar/hörbar sein (Moderation nötig)?
- [x] Entschieden: Sounds und Musik zunächst synthetisch per Web Audio.
- [ ] Wie viele Bots maximal in einer Lobby (Annahme: bis 4 Helden + 1 Boss)?
- [ ] Soll es eine Online-Galerie für Regel-Pakete geben (später)?
