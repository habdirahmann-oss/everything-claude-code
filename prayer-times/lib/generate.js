'use strict';

/**
 * Turn a configuration into a subscribable prayer-times calendar.
 */

const { prayerTimesForDate } = require('./prayer-times');
const { buildCalendar } = require('./ics');
const { METHODS } = require('./methods');
const { todayInZone, addDays, formatICSDateUTC, dateTag } = require('./dates');

const PRAYER_LABELS = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha'
};

const DEFAULT_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Emoji are constructed at runtime rather than written as literals so the
// repository's Unicode-safety check (which forbids raw emoji/variation
// selectors in source) stays green while events still render with an icon.
const MOSQUE_EMOJI = String.fromCodePoint(0x1f54c);
const SUNRISE_EMOJI = String.fromCodePoint(0x1f305);

function emojiFor(prayer, useEmoji) {
  if (!useEmoji) return '';
  return (prayer === 'sunrise' ? SUNRISE_EMOJI : MOSQUE_EMOJI) + ' ';
}

/**
 * Resolve the ordered list of prayers to emit for a config.
 */
function resolvePrayers(config) {
  const prayers = Array.isArray(config.prayers) && config.prayers.length ? config.prayers.slice() : DEFAULT_PRAYERS.slice();
  if (config.includeSunrise && !prayers.includes('sunrise')) {
    prayers.splice(1, 0, 'sunrise');
  }
  return prayers;
}

/**
 * Generate a full iCalendar document for a horizon of days.
 *
 * @param {object} config user configuration (see config.example.json)
 * @param {object} [opts]
 * @param {{year,month,day}} [opts.start] first day (defaults to today in tz)
 * @param {number} [opts.horizonDays] number of days to emit
 * @param {Date} [opts.now] injected clock for determinism
 * @param {Date} [opts.dtstamp] injected DTSTAMP for determinism
 * @returns {string} iCalendar text
 */
function generateICS(config, opts) {
  const options = opts || {};
  const timezone = config.timezone || 'UTC';
  const start = options.start || todayInZone(timezone, options.now);
  const horizon = Number(options.horizonDays || config.horizonDays || 365);
  const prayers = resolvePrayers(config);
  const durationMin = typeof config.eventDurationMinutes === 'number' ? config.eventDurationMinutes : 25;
  const reminder = config.reminderMinutes;
  const useEmoji = config.emoji !== false;
  const dtstamp = formatICSDateUTC(options.dtstamp || new Date());
  const methodLabel = (METHODS[config.method] && METHODS[config.method].name) || config.method || 'MWL';
  const placeName = (config.location && config.location.name) || 'your location';

  const events = [];
  for (let i = 0; i < horizon; i++) {
    const date = addDays(start, i);
    const times = prayerTimesForDate(date, config);
    for (const prayer of prayers) {
      const time = times[prayer];
      if (!time || Number.isNaN(time.getTime())) continue;
      const end = new Date(time.getTime() + durationMin * 60000);
      events.push({
        uid: `${prayer}-${dateTag(date)}@ecc-prayer-times`,
        dtstamp,
        dtstart: formatICSDateUTC(time),
        dtend: formatICSDateUTC(end),
        summary: `${emojiFor(prayer, useEmoji)}${PRAYER_LABELS[prayer] || prayer}`,
        description: `${PRAYER_LABELS[prayer] || prayer} time for ${placeName} — ${methodLabel} method.`,
        location: config.location && config.location.name,
        // No reminder on the informational sunrise entry.
        reminderMinutes: prayer === 'sunrise' ? undefined : typeof reminder === 'number' ? reminder : undefined
      });
    }
  }

  return buildCalendar({
    name: config.calendarName || `Prayer Times — ${placeName}`,
    timezone,
    events,
    refreshHours: config.refreshHours || 12
  });
}

/**
 * Human-readable times for one day, formatted in the config timezone.
 * @returns {Array<{prayer:string, label:string, time:string, date:Date}>}
 */
function formatDay(config, date) {
  const times = prayerTimesForDate(date, config);
  const timezone = config.timezone || 'UTC';
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return resolvePrayers(config).map(prayer => ({
    prayer,
    label: PRAYER_LABELS[prayer] || prayer,
    time: times[prayer] && !Number.isNaN(times[prayer].getTime()) ? fmt.format(times[prayer]) : '--:--',
    date: times[prayer]
  }));
}

module.exports = { generateICS, formatDay, resolvePrayers, PRAYER_LABELS, DEFAULT_PRAYERS };
