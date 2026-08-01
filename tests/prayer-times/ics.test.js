'use strict';

/**
 * Tests for the iCalendar writer and the calendar generator.
 *
 * Run with: node tests/prayer-times/ics.test.js
 */

const assert = require('assert');
const { escapeText, foldLine, buildCalendar } = require('../../prayer-times/lib/ics');
const { generateICS } = require('../../prayer-times/lib/generate');

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

const CONFIG = {
  location: { name: 'Amsterdam', latitude: 52.3676, longitude: 4.9041, elevation: 0 },
  timezone: 'Europe/Amsterdam',
  method: 'MWL',
  asr: 'Standard',
  highLats: 'AngleBased',
  reminderMinutes: 10
};

// Deterministic generation inputs.
const GEN_OPTS = {
  start: { year: 2026, month: 3, day: 20 },
  horizonDays: 3,
  now: new Date(Date.UTC(2026, 2, 20, 0, 0, 0)),
  dtstamp: new Date(Date.UTC(2026, 2, 20, 0, 0, 0))
};

console.log('\n=== Testing ics.js ===\n');

console.log('Text escaping and folding:');

test('escapeText escapes commas, semicolons, backslashes and newlines', () => {
  assert.strictEqual(escapeText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
});

test('foldLine leaves short lines untouched', () => {
  assert.strictEqual(foldLine('SHORT:value'), 'SHORT:value');
});

test('foldLine wraps long lines with a leading-space continuation', () => {
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = foldLine(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1, 'should split into multiple lines');
  for (const line of parts) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line exceeds 75 octets: ${line.length}`);
  }
  for (let i = 1; i < parts.length; i++) {
    assert.strictEqual(parts[i][0], ' ', 'continuation lines start with a space');
  }
  // Unfolding restores the original.
  assert.strictEqual(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join(''), long);
});

test('foldLine never splits a multi-byte character', () => {
  const mosque = String.fromCodePoint(0x1f54c); // built at runtime, see generate.js
  const replacementChar = String.fromCodePoint(0xfffd);
  const line = 'SUMMARY:' + mosque.repeat(40);
  const folded = foldLine(line);
  // A broken UTF-8 sequence would introduce the replacement character.
  assert.ok(!folded.includes(replacementChar), 'no broken code points');
  for (const part of folded.split('\r\n')) {
    assert.ok(Buffer.byteLength(part, 'utf8') <= 75);
  }
});

console.log('\nCalendar assembly:');

test('buildCalendar wraps events in a VCALENDAR envelope', () => {
  const ics = buildCalendar({
    name: 'Test',
    timezone: 'UTC',
    refreshHours: 12,
    events: [
      {
        uid: 'x@test',
        dtstamp: '20260320T000000Z',
        dtstart: '20260320T050000Z',
        dtend: '20260320T052500Z',
        summary: 'Fajr'
      }
    ]
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'), 'starts with VCALENDAR');
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'), 'ends with VCALENDAR');
  assert.ok(ics.includes('REFRESH-INTERVAL;VALUE=DURATION:PT12H'), 'declares a refresh interval');
});

test('all lines use CRLF endings', () => {
  const ics = generateICS(CONFIG, GEN_OPTS);
  const withoutCRLF = ics.replace(/\r\n/g, '');
  assert.ok(!withoutCRLF.includes('\n'), 'no bare LF should remain');
});

console.log('\nGenerated prayer-times feed:');

test('emits one event per prayer per day', () => {
  const ics = generateICS(CONFIG, GEN_OPTS);
  const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
  assert.strictEqual(count, 5 * 3, 'five prayers over three days');
});

test('event UIDs are stable and unique', () => {
  const ics = generateICS(CONFIG, GEN_OPTS);
  const uids = (ics.match(/UID:[^\r\n]+/g) || []).map(l => l.slice(4));
  assert.strictEqual(uids.length, 15);
  assert.strictEqual(new Set(uids).size, 15, 'no duplicate UIDs');
  assert.ok(uids.includes('fajr-20260320@ecc-prayer-times'), 'UID encodes prayer and date');
});

test('reminders become VALARM blocks with the configured lead time', () => {
  const ics = generateICS(CONFIG, GEN_OPTS);
  const alarms = (ics.match(/BEGIN:VALARM/g) || []).length;
  assert.strictEqual(alarms, 15, 'one alarm per prayer event');
  assert.ok(ics.includes('TRIGGER:-PT10M'), 'uses the 10-minute reminder');
});

test('sunrise entries are informational (no reminder)', () => {
  const ics = generateICS(Object.assign({}, CONFIG, { includeSunrise: true }), GEN_OPTS);
  const events = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const alarms = (ics.match(/BEGIN:VALARM/g) || []).length;
  assert.strictEqual(events, 6 * 3, 'six entries including sunrise');
  assert.strictEqual(alarms, 5 * 3, 'sunrise carries no alarm');
});

test('location names with commas are escaped in output', () => {
  const cfg = Object.assign({}, CONFIG, { location: Object.assign({}, CONFIG.location, { name: 'Den Haag, NL' }) });
  const ics = generateICS(cfg, GEN_OPTS);
  assert.ok(ics.includes('Den Haag\\, NL'), 'comma should be escaped');
});

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}\n`);

process.exit(failed > 0 ? 1 : 0);
