import { describe, expect, it } from 'vitest';
import { getCurrentAstronomicalSeason } from './season.utils';

describe('Season Utilities', () => {
  it('correctly classifies Primavera dates', () => {
    expect(getCurrentAstronomicalSeason(new Date(2026, 2, 21))).toBe('Primavera'); // 21 March
    expect(getCurrentAstronomicalSeason(new Date(2026, 3, 15))).toBe('Primavera'); // 15 April
    expect(getCurrentAstronomicalSeason(new Date(2026, 4, 30))).toBe('Primavera'); // 30 May
    expect(getCurrentAstronomicalSeason(new Date(2026, 5, 20))).toBe('Primavera'); // 20 June
  });

  it('correctly classifies Estate dates', () => {
    expect(getCurrentAstronomicalSeason(new Date(2026, 5, 21))).toBe('Estate'); // 21 June
    expect(getCurrentAstronomicalSeason(new Date(2026, 6, 15))).toBe('Estate'); // 15 July
    expect(getCurrentAstronomicalSeason(new Date(2026, 7, 10))).toBe('Estate'); // 10 August
    expect(getCurrentAstronomicalSeason(new Date(2026, 8, 20))).toBe('Estate'); // 20 September
  });

  it('correctly classifies Autunno dates', () => {
    expect(getCurrentAstronomicalSeason(new Date(2026, 8, 21))).toBe('Autunno'); // 21 September
    expect(getCurrentAstronomicalSeason(new Date(2026, 9, 31))).toBe('Autunno'); // 31 October
    expect(getCurrentAstronomicalSeason(new Date(2026, 10, 15))).toBe('Autunno'); // 15 November
    expect(getCurrentAstronomicalSeason(new Date(2026, 11, 20))).toBe('Autunno'); // 20 December
  });

  it('correctly classifies Inverno dates', () => {
    expect(getCurrentAstronomicalSeason(new Date(2026, 11, 21))).toBe('Inverno'); // 21 December
    expect(getCurrentAstronomicalSeason(new Date(2026, 0, 15))).toBe('Inverno'); // 15 January
    expect(getCurrentAstronomicalSeason(new Date(2026, 1, 28))).toBe('Inverno'); // 28 February
    expect(getCurrentAstronomicalSeason(new Date(2026, 2, 20))).toBe('Inverno'); // 20 March
  });
});
