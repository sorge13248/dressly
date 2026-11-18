import assert from 'node:assert/strict';
import { getCurrentAstronomicalSeason, getCurrentSeasonName } from './season.util';

console.log('--- Running Season Utility Unit Tests ---');

// Test 1: Primavera boundaries
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 2, 21)), 'Primavera');
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 5, 20)), 'Primavera');

// Test 2: Estate boundaries
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 5, 21)), 'Estate');
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 8, 20)), 'Estate');

// Test 3: Autunno boundaries
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 8, 21)), 'Autunno');
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 11, 20)), 'Autunno');

// Test 4: Inverno boundaries
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 11, 21)), 'Inverno');
assert.equal(getCurrentAstronomicalSeason(new Date(2026, 2, 20)), 'Inverno');

// Test 5: Alias
assert.equal(getCurrentSeasonName(new Date(2026, 6, 15)), 'Estate');

console.log('🎉 ALL SEASON UTIL TESTS PASSED! 🎉');
