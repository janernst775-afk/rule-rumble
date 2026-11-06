import { useTranslation } from 'react-i18next';
import type { FigureId, GameState } from '../../engine/types';
import { ruleDescription } from '../ruleText';
import { Dialog } from './Dialog';

interface Props {
  game: GameState;
  voter: FigureId;
  onVote: (ruleId: string) => void;
}

/** Overflow "Abstimmung": which active rule has to make room for the new one? */
export function VoteDialog({ game, voter, onVote }: Props) {
  const { t } = useTranslation();
  const vote = game.pendingVote;
  if (!vote) return null;
  const author = game.participants[vote.authorId]?.name ?? '';
  const done = Object.keys(vote.votes).length;
  return (
    <Dialog title={t('rules.voteTitle')} width={560}>
      <p>{t('rules.voteIntro', { author, rule: vote.candidate.ast.name })}</p>
      <p className="hint">{ruleDescription(vote.candidate, t)}</p>
      <ul className="vote-list">
        {game.rules.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              className="btn vote-btn"
              disabled={!!vote.votes[voter]}
              onClick={() => onVote(r.id)}
            >
              {r.def.ast.name}
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">{t('rules.voteProgress', { done, total: vote.voters.length })}</p>
    </Dialog>
  );
}
