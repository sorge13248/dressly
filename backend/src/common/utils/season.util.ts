export type AstronomicalSeason = 'Primavera' | 'Estate' | 'Autunno' | 'Inverno';

/**
 * Computes the current astronomical season in the Northern Hemisphere:
 * - Primavera: 21 March – 20 June
 * - Estate: 21 June – 20 September
 * - Autunno: 21 September – 20 December
 * - Inverno: 21 December – 20 March
 */
export function getCurrentAstronomicalSeason(date = new Date()): AstronomicalSeason {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 11 = Dec
  const day = date.getDate();

  if ((month === 2 && day >= 21) || month === 3 || month === 4 || (month === 5 && day <= 20)) {
    return 'Primavera';
  }
  if ((month === 5 && day >= 21) || month === 6 || month === 7 || (month === 8 && day <= 20)) {
    return 'Estate';
  }
  if ((month === 8 && day >= 21) || month === 9 || month === 10 || (month === 11 && day <= 20)) {
    return 'Autunno';
  }
  return 'Inverno';
}

/**
 * Backward compatibility alias for getCurrentAstronomicalSeason
 */
export const getCurrentSeasonName = getCurrentAstronomicalSeason;
