'use strict';

/**
 * Degree-based trigonometry helpers.
 *
 * The prayer-time algorithm is expressed in degrees (angles, latitude,
 * declination), so every trig call here takes/returns degrees instead of the
 * radians used by the native Math functions.
 */

const dtr = d => (d * Math.PI) / 180;
const rtd = r => (r * 180) / Math.PI;

// Positive modulo: keeps the result in [0, mod).
function fix(a, mod) {
  const r = a - mod * Math.floor(a / mod);
  return r < 0 ? r + mod : r;
}

module.exports = {
  dtr,
  rtd,
  sin: d => Math.sin(dtr(d)),
  cos: d => Math.cos(dtr(d)),
  tan: d => Math.tan(dtr(d)),
  arcsin: x => rtd(Math.asin(x)),
  arccos: x => rtd(Math.acos(x)),
  arctan: x => rtd(Math.atan(x)),
  arctan2: (y, x) => rtd(Math.atan2(y, x)),
  arccot: x => rtd(Math.atan(1 / x)),
  fixAngle: a => fix(a, 360),
  fixHour: a => fix(a, 24)
};
