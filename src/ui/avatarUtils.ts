export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const AVATAR_SIZE = 256;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Validates an uploaded image file; returns an i18n error key or null. */
export function checkImageFile(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'avatar.wrongType';
  if (file.size > MAX_UPLOAD_BYTES) return 'avatar.tooLarge';
  return null;
}
