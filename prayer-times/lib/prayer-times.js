'use strict';

/**
 * Prayer-time computation.
 *
 * Port of the PrayTimes.org algorithm, specialised to return absolute UTC
 * instants (JavaScript `Date` objects) rather than local clock strings.
 *
 * Why UTC instants: prayer times track the true position of the sun, which is
 * an absolute moment independent of clocks and daylight-saving rules. Emitting
 * a UTC instant lets any calendar render the correct local wall-clock time,
 * including across DST transitions, with no timezone bookkeeping here.
 */

const D = require('./dmath');
const { julian, sunPosition } = require('./solar');
const { METHODS } = require('./methods');

// Standard angle (deg below horizon) for sunrise/sunset, accounting for
// atmospheric refraction and the sun's apparent radius.
function riseSetAngle(elevation) {
  const elev = Number(elevation) || 0;
  return 0.833 + 0.0347 * Math.sqrt(Math.max(elev, 0));
}

// Shadow-length factor for Asr: 1 for the majority (Shafi'i/Maliki/Hanbali),
// 2 for the Hanafi school.
function asrFactor(school) {
  return String(school || 'Standard').toLowerCase() === 'hanafi' ? 2 : 1;
}

// Normalise an Isha/Maghrib parameter into either an angle or a fixed offset.
function normalizeParam(value) {
  if (value && typeof value === 'object' && typeof value.minutes === 'number') {
    return { minutes: value.minutes };
  }
  return { angle: Number(value) };
}

/**
 * Resolve the effective method parameters (angles / offsets) from options.
 * Accepts a preset name via `method` and optional `methodOverrides`.
 */
function resolveMethod(options) {
  const name = options.method || 'MWL';
  const preset = METHODS[name];
  if (!preset) {
    throw new Error(`Unknown calculation method "${name}". Available: ${Object.keys(METHODS).join(', ')}`);
  }
  return Object.assign({}, preset, options.methodOverrides || {});
}

/**
 * Compute the raw prayer times, in fractional hours of Universal Time, for the
 * given calendar date. The returned hours are measured from 0h UT of that
 * date and may fall outside [0, 24) for far-eastern/western longitudes — the
 * caller turns them into absolute instants.
 */
function computeUtcHours(year, month, day, opts) {
  const lat = opts.location.latitude;
  const lng = opts.location.longitude;
  const elevation = opts.location.elevation;
  const method = opts.methodParams;
  const asr = asrFactor(opts.asr);
  const highLats = opts.highLats || 'AngleBased';

  // Shift the Julian date west by the longitude so the day-fraction guesses
  // below line up with local apparent time.
  const jDate = julian(year, month, day) - lng / (15 * 24);
  const rsAngle = riseSetAngle(elevation);

  const fajrAngle = method.fajr;
  const ishaParam = normalizeParam(method.isha);
  const maghribParam = typeof method.maghrib === 'undefined' ? { angle: rsAngle } : normalizeParam(method.maghrib);

  const midDay = t => D.fixHour(12 - sunPosition(jDate + t).equation);

  // Hour angle for the sun sitting `angle` degrees below the horizon, applied
  // before (`ccw`) or after solar noon.
  const sunAngleTime = (angle, t, ccw) => {
    const decl = sunPosition(jDate + t).declination;
    const noon = midDay(t);
    const numerator = -D.sin(angle) - D.sin(decl) * D.sin(lat);
    const hourAngle = D.arccos(numerator / (D.cos(decl) * D.cos(lat))) / 15;
    return noon + (ccw ? -hourAngle : hourAngle);
  };

  const asrTime = t => {
    const decl = sunPosition(jDate + t).declination;
    const angle = -D.arccot(asr + D.tan(Math.abs(lat - decl)));
    return sunAngleTime(angle, t, false);
  };

  // Iterate a few times: each time depends on the sun's position at that time
  // of day, so we refine from rough guesses.
  let times = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  for (let i = 0; i < 3; i++) {
    const t = {};
    for (const key of Object.keys(times)) t[key] = times[key] / 24;

    const next = {};
    next.fajr = sunAngleTime(fajrAngle, t.fajr, true);
    next.sunrise = sunAngleTime(rsAngle, t.sunrise, true);
    next.dhuhr = midDay(t.dhuhr);
    next.asr = asrTime(t.asr);
    next.sunset = sunAngleTime(rsAngle, t.sunset, false);
    next.maghrib = typeof maghribParam.angle === 'number' && !Number.isNaN(maghribParam.angle) ? sunAngleTime(maghribParam.angle, t.maghrib, false) : next.sunset + maghribParam.minutes / 60;
    next.isha = typeof ishaParam.angle === 'number' && !Number.isNaN(ishaParam.angle) ? sunAngleTime(ishaParam.angle, t.isha, false) : next.maghrib + ishaParam.minutes / 60;
    times = next;
  }

  // Convert from the longitude-shifted frame to Universal Time.
  for (const key of Object.keys(times)) times[key] -= lng / 15;

  // High-latitude correction: near the poles the sun may never reach the Fajr
  // or Isha depression angle, leaving those times undefined. Estimate them
  // from a portion of the night instead.
  if (highLats && highLats !== 'None') {
    const night = D.fixHour(times.sunrise - times.sunset);
    const portionFor = angle => {
      if (highLats === 'AngleBased') return (angle / 60) * night;
      if (highLats === 'OneSeventh') return night / 7;
      return night / 2; // NightMiddle
    };
    const adjust = (time, base, angle, ccw) => {
      const portion = portionFor(angle);
      const diff = ccw ? D.fixHour(base - time) : D.fixHour(time - base);
      if (Number.isNaN(time) || diff > portion) {
        return base + (ccw ? -portion : portion);
      }
      return time;
    };
    times.fajr = adjust(times.fajr, times.sunrise, fajrAngle, true);
    if (typeof ishaParam.angle === 'number' && !Number.isNaN(ishaParam.angle)) {
      times.isha = adjust(times.isha, times.sunset, ishaParam.angle, false);
    }
    if (typeof maghribParam.angle === 'number' && !Number.isNaN(maghribParam.angle)) {
      times.maghrib = adjust(times.maghrib, times.sunset, maghribParam.angle, false);
    }
  }

  // Fixed-offset Isha/Maghrib are re-derived here so they stay anchored to the
  // (possibly high-latitude-adjusted) sunset/maghrib.
  if (typeof maghribParam.minutes === 'number') times.maghrib = times.sunset + maghribParam.minutes / 60;
  if (typeof ishaParam.minutes === 'number') times.isha = times.maghrib + ishaParam.minutes / 60;

  // Dhuhr is taken a small margin after the sun crosses the meridian.
  times.dhuhr += (Number(opts.dhuhrMinutes) || 0) / 60;

  // Per-prayer manual tuning (minutes), e.g. to match a local mosque table.
  const tune = opts.tune || {};
  for (const key of Object.keys(tune)) {
    if (typeof times[key] === 'number') times[key] += (Number(tune[key]) || 0) / 60;
  }

  return times;
}

/**
 * Prayer times for a single local calendar date.
 *
 * @param {{year:number, month:number, day:number}} date local calendar date
 * @param {object} options location, method, asr, highLats, tune, ...
 * @returns {Object<string, Date>} UTC instants keyed by prayer name
 */
function prayerTimesForDate(date, options) {
  if (!options || !options.location || typeof options.location.latitude !== 'number' || typeof options.location.longitude !== 'number') {
    throw new Error('options.location.latitude and options.location.longitude are required numbers');
  }
  const methodParams = resolveMethod(options);
  const opts = Object.assign({}, options, { methodParams });
  const hours = computeUtcHours(date.year, date.month, date.day, opts);

  const baseUtc = Date.UTC(date.year, date.month - 1, date.day);
  const result = {};
  for (const key of Object.keys(hours)) {
    result[key] = new Date(baseUtc + hours[key] * 3600000);
  }
  return result;
}

module.exports = { prayerTimesForDate, resolveMethod, riseSetAngle, asrFactor };
