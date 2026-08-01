'use strict';

/**
 * Solar position primitives.
 *
 * Implements the low-precision sun-position model used by PrayTimes.org
 * (accurate to well within a minute for civil timekeeping), plus the Julian
 * date conversion the model needs.
 */

const D = require('./dmath');

/**
 * Julian date for a Gregorian calendar date at 0h Universal Time.
 *
 * @param {number} year  full year, e.g. 2026
 * @param {number} month 1-12
 * @param {number} day   1-31
 * @returns {number} Julian date at 0h UT
 */
function julian(year, month, day) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/**
 * Sun declination and the equation of time for a given Julian date.
 *
 * @param {number} jd Julian date (may include a fractional day)
 * @returns {{ declination: number, equation: number }}
 *   declination in degrees, equation of time in hours.
 */
function sunPosition(jd) {
  const d = jd - 2451545.0; // days since the J2000.0 epoch
  const g = D.fixAngle(357.529 + 0.98560028 * d); // mean anomaly
  const q = D.fixAngle(280.459 + 0.98564736 * d); // mean longitude
  const l = D.fixAngle(q + 1.915 * D.sin(g) + 0.02 * D.sin(2 * g)); // ecliptic longitude
  const e = 23.439 - 0.00000036 * d; // obliquity of the ecliptic

  const declination = D.arcsin(D.sin(e) * D.sin(l));
  const rightAscension = D.arctan2(D.cos(e) * D.sin(l), D.cos(l)) / 15;
  const equation = q / 15 - D.fixHour(rightAscension);

  return { declination, equation };
}

module.exports = { julian, sunPosition };
