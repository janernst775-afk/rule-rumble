import { lazy, Suspense } from 'react';

// The workshop brings the code editor (CodeMirror); it loads only when opened.
const EffectWorkshop = lazy(() =>
  import('./EffectWorkshop').then((m) => ({ default: m.EffectWorkshop })),
);

export function LazyWorkshop({ onClose }: { onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <EffectWorkshop onClose={onClose} />
    </Suspense>
  );
}
