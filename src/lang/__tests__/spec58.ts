// The Profi-Code examples from SPEC 5.8 and 5.7, verbatim.
export const SCHWAECHSTE_GEIST_FLUT = `FUNKTION schwächste(menge)
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
ENDE`;

export const ERDBEBEN_TEXT = `EFFEKT "Erdbeben" (stärke: Zahl)
  SPIELE "rumpeln"
  FÜR JEDES f IN nachbarfelder(feld, stärke)
    WENN ZUFALL 30% UND anzahl(figuren_auf(f)) = 0
      ENTFERNE f
    ENDE
  ENDE
ENDE

REGEL "Beben bei Treffer"
WENN TREFFER
DANN Erdbeben(1)`;
