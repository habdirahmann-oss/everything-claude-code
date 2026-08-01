'use strict';

/**
 * Small date helpers that treat a "day" as a calendar tuple
 * ({ year, month, day }) rather than an instant, so incrementing days never
 * drifts across daylight-saving boundaries.
 */

function pad(n, len) {
  return String(n).padStart(len || 2, '0');
}

/**
 * The current calendar date in a given IANA timezone.
 * `now` is injectable for deterministic tests.
 */
function todayInZone(timeZone, now) {
  const instant = now || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const get = type => parts.find(p => p.type === type).value;
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}

/** Add `n` calendar days to a { year, month, day } tuple. */
function addDays(date, n) {
  const base = Date.UTC(date.year, date.month - 1, date.day);
  const next = new Date(base + n * 86400000);
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

/** Parse an ISO 'YYYY-MM-DD' string into a { year, month, day } tuple. */
function parseISODate(str) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str).trim());
  if (!match) throw new Error(`Invalid date "${str}", expected YYYY-MM-DD`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Format a Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ. */
function formatICSDateUTC(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/** Compact YYYYMMDD tag for a calendar tuple (used in stable event UIDs). */
function dateTag(date) {
  return `${date.year}${pad(date.month)}${pad(date.day)}`;
}

module.exports = { pad, todayInZone, addDays, parseISODate, formatICSDateUTC, dateTag };
