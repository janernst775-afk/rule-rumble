import { useTranslation } from 'react-i18next';
import { AVATAR_SIZE } from '../avatarUtils';
import { Dialog } from './Dialog';
import { ImageCropper } from './ImageCropper';

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}

/** Circular avatar crop, output 256×256 PNG. */
export function AvatarCropDialog({ file, onCancel, onDone }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog title={t('avatar.cropTitle')} onClose={onCancel}>
      <ImageCropper
        file={file}
        shape="circle"
        outputSize={AVATAR_SIZE}
        applyLabel={t('avatar.apply')}
        onApply={onDone}
        onCancel={onCancel}
      />
    </Dialog>
  );
}
