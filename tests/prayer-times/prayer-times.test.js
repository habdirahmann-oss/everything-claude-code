'use strict';

/**
 * Tests for the prayer-time computation engine.
 *
 * Run with: node tests/prayer-times/prayer-times.test.js
 */

const assert = require('assert');
const { prayerTimesForDate } = require('../../prayer-times/lib/prayer-times');
const { julian, sunPosition } = require('../../prayer-times/lib/solar');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    failed++;
  }
}

// Amsterdam — a high-latitude city that exercises the twilight edge cases.
const AMSTERDAM = {
  location: { name: 'Amsterdam', latitude: 52.3676, longitude: 4.9041, elevation: 0 },
  timezone: 'Europe/Amsterdam',
  method: 'MWL',
  asr: 'Standard',
  highLats: 'AngleBased'
};

// Mecca — reference low-latitude location.
const MECCA = {
  location: { name: 'Mecca', latitude: 21.4225, longitude: 39.8262, elevation: 0 },
  timezone: 'Asia/Riyadh',
  method: 'Makkah',
  asr: 'Standard',
  highLats: 'None'
};

// Fractional UTC hour of a Date, for ordering assertions.
function utcHours(date) {
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}

console.log('\n=== Testing prayer-times.js ===\n');

console.log('Solar primitives:');

test('julian date matches the known J2000.0 epoch', () => {
  // 2000-01-01 12:00 UT === JD 2451545.0, so 0h UT that day is 2451544.5.
  assert.strictEqual(julian(2000, 1, 1), 2451544.5);
});

test('sun declination near zero at the March equinox', () => {
  const { declination } = sunPosition(julian(2026, 3, 20) + 0.5);
  assert.ok(Math.abs(declination) < 1.5, `declination ${declination} should be near 0`);
});

console.log('\nOrdering and structure:');

test('prayers are strictly ordered through the day', () => {
  const t = prayerTimesForDate({ year: 2026, month: 3, day: 20 }, AMSTERDAM);
  const seq = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (let i = 1; i < seq.length; i++) {
    assert.ok(t[seq[i]].getTime() > t[seq[i - 1]].getTime(), `${seq[i]} must come after ${seq[i - 1]}`);
  }
});

test('all five prayers plus sunrise/sunset are valid dates', () => {
  const t = prayerTimesForDate({ year: 2026, month: 6, day: 21 }, AMSTERDAM);
  for (const key of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha', 'sunset']) {
    assert.ok(t[key] instanceof Date && !Number.isNaN(t[key].getTime()), `${key} should be a valid Date`);
  }
});

test('Dhuhr sits close to solar noon', () => {
  // Solar noon (UTC) ~= 12 - eqt - lng/15.
  const date = { year: 2026, month: 3, day: 20 };
  const { equation } = sunPosition(julian(date.year, date.month, date.day));
  const expectedNoon = 12 - equation - AMSTERDAM.location.longitude / 15;
  const t = prayerTimesForDate(date, AMSTERDAM);
  assert.ok(Math.abs(utcHours(t.dhuhr) - expectedNoon) < 0.1, `Dhuhr ${utcHours(t.dhuhr)} vs noon ${expectedNoon}`);
});

console.log('\nHigh-latitude handling:');

test('Amsterdam midsummer still yields finite Fajr and Isha', () => {
  // Around the solstice, 52N never reaches the 18-degree depression angle;
  // the AngleBased correction must keep both times defined.
  const t = prayerTimesForDate({ year: 2026, month: 6, day: 21 }, AMSTERDAM);
  assert.ok(!Number.isNaN(t.fajr.getTime()), 'Fajr should be finite');
  assert.ok(!Number.isNaN(t.isha.getTime()), 'Isha should be finite');
  assert.ok(t.isha.getTime() > t.maghrib.getTime(), 'Isha after Maghrib');
  assert.ok(t.fajr.getTime() < t.sunrise.getTime(), 'Fajr before sunrise');
});

test('disabling high-lat correction can leave Isha undefined in midsummer', () => {
  const cfg = Object.assign({}, AMSTERDAM, { highLats: 'None' });
  const t = prayerTimesForDate({ year: 2026, month: 6, day: 21 }, cfg);
  assert.ok(Number.isNaN(t.isha.getTime()), 'Isha should be NaN without correction at this latitude/date');
});

console.log('\nMethod and school differences:');

test('ISNA Fajr (15deg) is later than MWL Fajr (18deg)', () => {
  const date = { year: 2026, month: 3, day: 20 };
  const mwl = prayerTimesForDate(date, AMSTERDAM);
  const isna = prayerTimesForDate(date, Object.assign({}, AMSTERDAM, { method: 'ISNA' }));
  assert.ok(isna.fajr.getTime() > mwl.fajr.getTime(), 'smaller depression angle -> later dawn');
});

test('Hanafi Asr is later than the standard Asr', () => {
  const date = { year: 2026, month: 3, day: 20 };
  const std = prayerTimesForDate(date, AMSTERDAM);
  const hanafi = prayerTimesForDate(date, Object.assign({}, AMSTERDAM, { asr: 'Hanafi' }));
  assert.ok(hanafi.asr.getTime() > std.asr.getTime(), 'Hanafi shadow factor -> later Asr');
});

test('positive tuning shifts a prayer later by the given minutes', () => {
  const date = { year: 2026, month: 3, day: 20 };
  const base = prayerTimesForDate(date, AMSTERDAM);
  const tuned = prayerTimesForDate(date, Object.assign({}, AMSTERDAM, { tune: { fajr: 5 } }));
  const deltaMin = (tuned.fajr.getTime() - base.fajr.getTime()) / 60000;
  assert.ok(Math.abs(deltaMin - 5) < 0.001, `expected +5 min, got ${deltaMin}`);
});

test('unknown method name throws a helpful error', () => {
  assert.throws(() => prayerTimesForDate({ year: 2026, month: 1, day: 1 }, Object.assign({}, AMSTERDAM, { method: 'Nope' })), /Unknown calculation method/);
});

console.log('\nRegression snapshot (Mecca, Makkah method, 2026-06-01):');

test('computed UTC times stay stable', () => {
  const t = prayerTimesForDate({ year: 2026, month: 6, day: 1 }, MECCA);
  const hhmm = date => `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  const snapshot = {
    fajr: hhmm(t.fajr),
    sunrise: hhmm(t.sunrise),
    dhuhr: hhmm(t.dhuhr),
    asr: hhmm(t.asr),
    maghrib: hhmm(t.maghrib),
    isha: hhmm(t.isha)
  };
  // Locked expected values (UTC). Mecca is UTC+3, so add 3h for local time,
  // e.g. Dhuhr 12:18 local. Cross-checked against published Umm al-Qura times.
  assert.deepStrictEqual(snapshot, {
    fajr: '01:11',
    sunrise: '02:38',
    dhuhr: '09:18',
    asr: '12:34',
    maghrib: '15:59',
    isha: '17:29'
  });
});

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}\n`);

process.exit(failed > 0 ? 1 : 0);
