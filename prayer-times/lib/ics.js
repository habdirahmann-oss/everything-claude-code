'use strict';

/**
 * Minimal, dependency-free iCalendar (RFC 5545) writer.
 *
 * Only the subset needed for prayer-time events is implemented: a PUBLISH
 * calendar of timed VEVENTs, each with an optional DISPLAY VALARM.
 */

/** Escape a text value per RFC 5545 section 3.3.11. */
function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold a content line to <=75 octets, byte-aware so multi-byte UTF-8
 * characters are never split. Continuation lines begin with a single space.
 */
function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const chBytes = Buffer.byteLength(ch, 'utf8');
    // Leave room so a continuation's leading space still fits under 75.
    if (bytes + chBytes > 75) {
      out.push(current);
      current = ' ' + ch;
      bytes = 1 + chBytes;
    } else {
      current += ch;
      bytes += chBytes;
    }
  }
  out.push(current);
  return out.join('\r\n');
}

/**
 * Build the lines for a single VEVENT.
 * @param {object} ev event descriptor (already-formatted ICS timestamps)
 * @returns {string[]}
 */
function buildEvent(ev) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${ev.dtstamp}`,
    `DTSTART:${ev.dtstart}`,
    `DTEND:${ev.dtend}`,
    `SUMMARY:${escapeText(ev.summary)}`
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  lines.push('TRANSP:TRANSPARENT');
  if (typeof ev.reminderMinutes === 'number') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(ev.summary)}`, `TRIGGER:-PT${ev.reminderMinutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/**
 * Assemble a complete VCALENDAR document from event descriptors.
 * @returns {string} CRLF-terminated iCalendar text
 */
function buildCalendar(options) {
  const header = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//everything-claude-code//Prayer Times//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(options.name)}`];
  if (options.timezone) header.push(`X-WR-TIMEZONE:${escapeText(options.timezone)}`);
  if (options.refreshHours) {
    header.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${options.refreshHours}H`);
    header.push(`X-PUBLISHED-TTL:PT${options.refreshHours}H`);
  }

  const body = [];
  for (const ev of options.events) body.push(...buildEvent(ev));

  const all = header.concat(body, ['END:VCALENDAR']);
  return all.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { escapeText, foldLine, buildEvent, buildCalendar };
