export function normalizeHexColor(hexCode: string | null | undefined, fallback = '#9aa8ba'): string {
  const normalized = hexCode?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized.startsWith('#') ? normalized : `#${normalized}`;
}

export type HslColor = {
  h: number; // 0 to 360
  s: number; // 0 to 1
  l: number; // 0 to 1
  isAchromatic: boolean;
};

export function hexToHsl(hexCode: string | null | undefined): HslColor | null {
  if (!hexCode) {
    return null;
  }

  const cleaned = hexCode.replace(/^#/, '').trim();
  let r = 0;
  let g = 0;
  let b = 0;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return null;
  }

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }

  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;

  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  const l = (max + min) / 2;
  let s = 0;
  let h = 0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    if (max === rf) {
      h = ((gf - bf) / delta) + (gf < bf ? 6 : 0);
    } else if (max === gf) {
      h = ((bf - rf) / delta) + 2;
    } else {
      h = ((rf - gf) / delta) + 4;
    }
    h *= 60;
  }

  // Achromatic if very low saturation or extreme lightness
  const isAchromatic = s < 0.12 || l < 0.08 || l > 0.96;

  return { h, s, l, isAchromatic };
}

export function sortColorsByHex<T extends { hexCode?: string | null; name: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const hslA = hexToHsl(a.hexCode);
    const hslB = hexToHsl(b.hexCode);

    // Group 1: Chromatic colors
    // Group 2: Achromatic / Neutrals (Black, Gray, White)
    // Group 3: No hex / Multicolore
    const getGroup = (hsl: HslColor | null): number => {
      if (!hsl) return 3;
      if (hsl.isAchromatic) return 2;
      return 1;
    };

    const groupA = getGroup(hslA);
    const groupB = getGroup(hslB);

    if (groupA !== groupB) {
      return groupA - groupB;
    }

    if (groupA === 1 && hslA && hslB) {
      // Sort chromatic by Hue, then Lightness, then Saturation
      const hueDiff = hslA.h - hslB.h;
      if (Math.abs(hueDiff) >= 4) {
        return hueDiff;
      }
      const lightnessDiff = hslA.l - hslB.l;
      if (Math.abs(lightnessDiff) >= 0.05) {
        return lightnessDiff;
      }
      return hslA.s - hslB.s;
    }

    if (groupA === 2 && hslA && hslB) {
      // Sort achromatic by Lightness (Black -> Gray -> White)
      const lightnessDiff = hslA.l - hslB.l;
      if (Math.abs(lightnessDiff) >= 0.03) {
        return lightnessDiff;
      }
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}
