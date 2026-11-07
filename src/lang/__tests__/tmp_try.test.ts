import { it } from 'vitest';
import { parseProgram } from '../parser';
import { printProgram } from '../printer';
import { SCHWAECHSTE_GEIST_FLUT, ERDBEBEN_TEXT } from './spec58';
it('try', () => {
  for (const t of [SCHWAECHSTE_GEIST_FLUT, ERDBEBEN_TEXT]) {
    const r = parseProgram(t);
    console.log(JSON.stringify(r.errors));
    console.log(printProgram(r.parsed.program));
    console.log(
      JSON.stringify(r.parsed.program.effects[0]?.body ?? r.parsed.program.npcCode, null, 0),
    );
  }
});
