import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NpcType } from '../../engine/types';
import type { EffectDef, FunctionDef } from '../../lang/ast';
import { soundList, useSounds } from '../../store/soundStore';
import { libraryTextures, useTextures } from '../../store/textureStore';
import type { CompletionWords } from './language';

/** Words for autocompletion: own effects, functions, NPC types and textures. */
export function useCompletionWords(
  effects: readonly EffectDef[],
  functions: readonly FunctionDef[],
  npcTypes: readonly NpcType[],
): CompletionWords {
  const { t } = useTranslation();
  const textures = useTextures((s) => s.textures);
  const sounds = useSounds((s) => s.sounds);
  return useMemo(
    () => ({
      effects: effects.map((e) => ({ name: e.name, params: e.params.map((p) => p.name) })),
      functions: functions.map((f) => ({ name: f.name, params: f.params })),
      textures: libraryTextures(textures).map((x) => x.name),
      sounds: soundList(sounds).map((s) => s.name),
      npcTypes: npcTypes.map((n) => n.id),
      labels: {
        keyword: t('workshop.complete.keyword'),
        action: t('workshop.complete.action'),
        value: t('workshop.complete.value'),
        effect: t('workshop.complete.effect'),
        function: t('workshop.complete.function'),
        texture: t('workshop.complete.texture'),
        sound: t('workshop.complete.sound'),
        npc: t('workshop.complete.npc'),
        prop: t('workshop.complete.prop'),
      },
    }),
    [effects, functions, npcTypes, textures, sounds, t],
  );
}
