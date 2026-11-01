import { hexToHsl, normalizeHexColor, sortColorsByHex } from './color.utils';

describe('color.utils', () => {
  describe('normalizeHexColor', () => {
    it('should add # prefix if missing', () => {
      expect(normalizeHexColor('ffffff')).toBe('#ffffff');
      expect(normalizeHexColor('#ffffff')).toBe('#ffffff');
    });

    it('should return fallback if input is empty or null', () => {
      expect(normalizeHexColor(null)).toBe('#9aa8ba');
      expect(normalizeHexColor('')).toBe('#9aa8ba');
      expect(normalizeHexColor(undefined, '#123456')).toBe('#123456');
    });
  });

  describe('hexToHsl', () => {
    it('should convert pure red #ff0000 correctly', () => {
      const hsl = hexToHsl('#ff0000');
      expect(hsl).not.toBeNull();
      expect(hsl?.h).toBeCloseTo(0, 0);
      expect(hsl?.s).toBeCloseTo(1, 1);
      expect(hsl?.l).toBeCloseTo(0.5, 1);
      expect(hsl?.isAchromatic).toBe(false);
    });

    it('should identify white, gray and black as achromatic', () => {
      const white = hexToHsl('#ffffff');
      expect(white?.isAchromatic).toBe(true);

      const black = hexToHsl('#000000');
      expect(black?.isAchromatic).toBe(true);

      const gray = hexToHsl('#808080');
      expect(gray?.isAchromatic).toBe(true);
    });

    it('should handle 3-digit hex strings', () => {
      const green = hexToHsl('#0f0');
      expect(green).not.toBeNull();
      expect(green?.h).toBeCloseTo(120, 0);
    });

    it('should return null for invalid hex', () => {
      expect(hexToHsl(null)).toBeNull();
      expect(hexToHsl('invalid')).toBeNull();
    });
  });

  describe('sortColorsByHex', () => {
    it('should sort colors grouping chromatics by hue, then neutrals, then null hex', () => {
      const colors = [
        { id: '1', name: 'Multicolore', hexCode: null },
        { id: '2', name: 'Bianco', hexCode: '#FFFFFF' },
        { id: '3', name: 'Nero', hexCode: '#000000' },
        { id: '4', name: 'Grigio', hexCode: '#808080' },
        { id: '5', name: 'Blu', hexCode: '#0000FF' },
        { id: '6', name: 'Verde', hexCode: '#00FF00' },
        { id: '7', name: 'Rosso', hexCode: '#FF0000' },
        { id: '8', name: 'Giallo', hexCode: '#FFFF00' },
      ];

      const sorted = sortColorsByHex(colors);

      // Chromatic first: Rosso (0°), Giallo (60°), Verde (120°), Blu (240°)
      expect(sorted[0].name).toBe('Rosso');
      expect(sorted[1].name).toBe('Giallo');
      expect(sorted[2].name).toBe('Verde');
      expect(sorted[3].name).toBe('Blu');

      // Achromatic second (sorted by Lightness: Nero -> Grigio -> Bianco)
      expect(sorted[4].name).toBe('Nero');
      expect(sorted[5].name).toBe('Grigio');
      expect(sorted[6].name).toBe('Bianco');

      // Special (null hex) last
      expect(sorted[7].name).toBe('Multicolore');
    });

    it('should group similar shades together (e.g. blues, greens)', () => {
      const colors = [
        { id: '1', name: 'Blu navy', hexCode: '#000080' },
        { id: '2', name: 'Verde scuro', hexCode: '#006400' },
        { id: '3', name: 'Blu reale', hexCode: '#4169E1' },
        { id: '4', name: 'Verde', hexCode: '#008000' },
      ];

      const sorted = sortColorsByHex(colors);
      const names = sorted.map((c) => c.name);

      // Greens (Hue ~120°) should be grouped together before Blues (Hue ~220-240°)
      expect(names.slice(0, 2)).toEqual(expect.arrayContaining(['Verde', 'Verde scuro']));
      expect(names.slice(2, 4)).toEqual(expect.arrayContaining(['Blu navy', 'Blu reale']));
    });
  });
});

