'use strict';

/**
 * Calculation-method presets.
 *
 * Prayer times differ between conventions mainly in the twilight angle used
 * for Fajr (dawn) and Isha (night). Angles are degrees below the horizon.
 * Isha and Maghrib may instead be a fixed offset after the previous prayer,
 * expressed as `{ minutes: N }`.
 *
 * Sources: praytimes.org and the published parameters of each authority.
 */
const METHODS = {
  MWL: { name: 'Muslim World League', fajr: 18, isha: 17 },
  ISNA: { name: 'Islamic Society of North America', fajr: 15, isha: 15 },
  Egypt: { name: 'Egyptian General Authority of Survey', fajr: 19.5, isha: 17.5 },
  Makkah: { name: 'Umm al-Qura University, Makkah', fajr: 18.5, isha: { minutes: 90 } },
  Karachi: { name: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
  Tehran: { name: 'Institute of Geophysics, University of Tehran', fajr: 17.7, isha: 14, maghrib: 4.5 },
  Jafari: { name: 'Shia Ithna-Ashari, Leva Institute, Qum', fajr: 16, isha: 14, maghrib: 4 },
  Dubai: { name: 'Gulf Region (Dubai)', fajr: 18.2, isha: 18.2 },
  Kuwait: { name: 'Kuwait', fajr: 18, isha: 17.5 },
  Qatar: { name: 'Qatar', fajr: 18, isha: { minutes: 90 } },
  Singapore: { name: 'Majlis Ugama Islam Singapura, Singapore', fajr: 20, isha: 18 },
  France: { name: 'Union des Organisations Islamiques de France', fajr: 12, isha: 12 },
  Turkey: { name: 'Diyanet Isleri Baskanligi, Turkey', fajr: 18, isha: 17 }
};

module.exports = { METHODS };
