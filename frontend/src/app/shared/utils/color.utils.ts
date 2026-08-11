export function normalizeHexColor(hexCode: string | null | undefined, fallback = '#9aa8ba') {
  const normalized = hexCode?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}
