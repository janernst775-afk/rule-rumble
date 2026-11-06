import { useTranslation } from 'react-i18next';
import type { Avatar as AvatarData } from '../../engine/types';
import { initials } from '../avatarUtils';
import { CrownIcon } from './Icons';

interface Props {
  name: string;
  avatar: AvatarData;
  size?: number;
  boss?: boolean;
  dimmed?: boolean;
  border?: number;
}

export function Avatar({ name, avatar, size = 48, boss = false, dimmed = false, border }: Props) {
  const { t } = useTranslation();
  const bw = border ?? Math.max(2, Math.round(size / 18));
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: avatar.color,
        borderWidth: bw,
        fontSize: size * 0.36,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {avatar.image ? (
        <img src={avatar.image} alt={t('avatar.alt', { name })} draggable={false} />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
      {boss && (
        <span className="avatar-crown" style={{ width: size * 0.5, top: -size * 0.28 }}>
          <CrownIcon size={size * 0.5} />
        </span>
      )}
    </span>
  );
}
