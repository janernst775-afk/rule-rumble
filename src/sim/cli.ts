// `npm run sim` (SPEC 6.3): bot-against-bot games per template in worker threads.
// Options: --games 1000 (total, split over the templates), --template classic,
// --seed 1, --difficulty normal, --workers 8, --set figures.heroHp=4 (repeatable; changes
// a setting of every template, for balancing experiments).
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { TEMPLATES, TEMPLATE_IDS, cloneSettings, type TemplateId } from '../engine/settings';
import type { Difficulty, Settings } from '../engine/types';
import {
  DEFAULT_SIM,
  inTarget,
  simulateRange,
  summarize,
  type SimCounts,
  type SimOptions,
} from './simulation';

interface Job {
  template: TemplateId;
  opts: SimOptions;
  from: number;
  to: number;
  overrides: [string, number | boolean][];
}

function overridesOf(argv: string[]): [string, number | boolean][] {
  const out: [string, number | boolean][] = [];
  argv.forEach((a, i) => {
    if (a !== '--set') return;
    const [path, raw] = (argv[i + 1] ?? '').split('=');
    if (!path || raw === undefined) return;
    out.push([path, raw === 'true' ? true : raw === 'false' ? false : Number(raw)]);
  });
  return out;
}

function applyOverrides(settings: Settings, overrides: [string, number | boolean][]): Settings {
  const s = cloneSettings(settings);
  for (const [path, value] of overrides) {
    const keys = path.split('.');
    let obj = s as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
    obj[keys.at(-1) ?? ''] = value;
  }
  return s;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const total = Number(arg('games') ?? DEFAULT_SIM.games);
  const only = arg('template') as TemplateId | undefined;
  const templates = only ? [only] : [...TEMPLATE_IDS];
  const perTemplate = Math.max(1, Math.round(total / templates.length));
  const opts: SimOptions = {
    ...DEFAULT_SIM,
    games: perTemplate,
    seed: Number(arg('seed') ?? DEFAULT_SIM.seed),
    difficulty: (arg('difficulty') as Difficulty | undefined) ?? DEFAULT_SIM.difficulty,
  };
  const workers = Number(arg('workers') ?? Math.max(1, availableParallelism() - 1));
  // Small batches keep all threads busy until the end.
  const chunk = Math.max(1, Math.ceil((perTemplate * templates.length) / (workers * 6)));
  const overrides = overridesOf(process.argv);
  if (overrides.length > 0) {
    console.log(`Geänderte Werte: ${overrides.map(([p, v]) => `${p}=${String(v)}`).join(', ')}`);
  }
  const jobs: Job[] = [];
  for (const template of templates) {
    for (let from = 0; from < perTemplate; from += chunk) {
      jobs.push({ template, opts, from, to: Math.min(perTemplate, from + chunk), overrides });
    }
  }
  console.log(
    `Rule Rumble – Simulation: ${perTemplate} Spiele je Vorlage, ${templates.length} Vorlagen, ${workers} Threads, Bots „${opts.difficulty}“`,
  );
  const started = Date.now();
  const results = new Map<TemplateId, SimCounts[]>();
  let next = 0;
  let done = 0;
  const runWorker = () =>
    new Promise<void>((resolve, reject) => {
      const take = (w: Worker) => {
        const job = jobs[next++];
        if (!job) {
          void w.terminate();
          resolve();
          return;
        }
        w.postMessage(job);
      };
      const w = new Worker(new URL(import.meta.url), { workerData: { worker: true } });
      w.on('message', (msg: { job: Job; counts: SimCounts }) => {
        results.set(msg.job.template, [...(results.get(msg.job.template) ?? []), msg.counts]);
        done++;
        process.stdout.write(`\r${done}/${jobs.length} Pakete fertig`);
        take(w);
      });
      w.on('error', reject);
      take(w);
    });
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, runWorker));
  process.stdout.write('\n\n');
  const rows = templates.map((t) => summarize(t, perTemplate, results.get(t) ?? []));
  console.log('Vorlage      Spiele  Boss   Helden  Unentsch.  offen  Ø Runden  Boss-Quote');
  for (const r of rows) {
    console.log(
      `${r.template.padEnd(12)} ${String(r.games).padStart(6)}  ${String(r.bossWins).padStart(4)}  ${String(r.heroWins).padStart(6)}  ${String(r.draws).padStart(9)}  ${String(r.unfinished).padStart(5)}  ${String(r.avgRounds).padStart(8)}  ${(r.bossRate * 100).toFixed(1).padStart(8)} % ${inTarget(r) ? '✓' : '✗'}`,
    );
  }
  console.log(`\nZiel: 40–60 % Boss-Siege · Dauer ${Math.round((Date.now() - started) / 1000)} s`);
  if (!rows.every(inTarget)) process.exitCode = 1;
}

if (isMainThread) {
  void main();
} else if ((workerData as { worker?: boolean } | null)?.worker) {
  parentPort?.on('message', (job: Job) => {
    const settings = applyOverrides(TEMPLATES[job.template], job.overrides);
    const counts = simulateRange(job.template, job.opts, job.from, job.to, settings);
    parentPort?.postMessage({ job, counts });
  });
}
