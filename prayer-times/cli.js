#!/usr/bin/env node
'use strict';

/**
 * Prayer Times → Calendar CLI.
 *
 *   node prayer-times/cli.js today     [--config file] [--date YYYY-MM-DD]
 *   node prayer-times/cli.js generate  [--config file] [--out file] [--days N] [--start YYYY-MM-DD]
 *   node prayer-times/cli.js serve     [--config file] [--port N] [--path /prayer-times.ics]
 *   node prayer-times/cli.js methods
 *
 * Any config field can be overridden on the command line, e.g.
 *   --lat 52.3676 --lng 4.9041 --tz Europe/Amsterdam --method ISNA --asr Hanafi
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const { generateICS, formatDay } = require('./lib/generate');
const { METHODS } = require('./lib/methods');
const { todayInZone, parseISODate } = require('./lib/dates');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (typeof next === 'undefined' || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

// Load config from --config, else prayer-times/config.json, else the shipped
// example. CLI flags then override individual fields.
function loadConfig(args) {
  const here = __dirname;
  const candidates = [args.config, path.join(here, 'config.json'), path.join(here, 'config.example.json')].filter(Boolean);

  let config = {};
  let source = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      config = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      source = candidate;
      break;
    }
  }
  if (!source) throw new Error('No config file found. Copy config.example.json to config.json.');

  config.location = config.location || {};
  if (typeof args.lat !== 'undefined') config.location.latitude = Number(args.lat);
  if (typeof args.lng !== 'undefined') config.location.longitude = Number(args.lng);
  if (typeof args.name === 'string') config.location.name = args.name;
  if (typeof args.tz === 'string') config.timezone = args.tz;
  if (typeof args.method === 'string') config.method = args.method;
  if (typeof args.asr === 'string') config.asr = args.asr;
  if (typeof args.highLats === 'string') config.highLats = args.highLats;

  return { config, source };
}

function requireLocation(config) {
  const loc = config.location || {};
  if (typeof loc.latitude !== 'number' || Number.isNaN(loc.latitude) || typeof loc.longitude !== 'number' || Number.isNaN(loc.longitude)) {
    throw new Error('Set your latitude and longitude in config.json (or pass --lat/--lng).');
  }
}

function cmdMethods() {
  console.log('Available calculation methods:\n');
  for (const [key, value] of Object.entries(METHODS)) {
    console.log(`  ${key.padEnd(10)} ${value.name}`);
  }
  console.log('\nUse with:  --method <name>   (Asr school: --asr Standard|Hanafi)');
}

function cmdToday(config, args) {
  requireLocation(config);
  const date = args.date ? parseISODate(args.date) : todayInZone(config.timezone || 'UTC');
  const rows = formatDay(config, date);
  const place = (config.location && config.location.name) || `${config.location.latitude}, ${config.location.longitude}`;
  console.log(`\nPrayer times for ${place}`);
  console.log(`${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}  (${config.timezone || 'UTC'}, method ${config.method || 'MWL'})\n`);
  for (const row of rows) {
    console.log(`  ${row.label.padEnd(9)} ${row.time}`);
  }
  console.log('');
}

function cmdGenerate(config, args) {
  requireLocation(config);
  const opts = {};
  if (args.start) opts.start = parseISODate(args.start);
  if (args.days) opts.horizonDays = Number(args.days);

  const ics = generateICS(config, opts);
  const outPath = args.out || path.join(__dirname, 'prayer-times.ics');
  fs.writeFileSync(outPath, ics, 'utf8');
  const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
  console.log(`Wrote ${eventCount} events to ${outPath}`);
  console.log('Import this file into Google/Apple/Outlook Calendar, or host it and subscribe by URL.');
}

function cmdServe(config, args) {
  requireLocation(config);
  const port = Number(args.port || process.env.PORT || 3000);
  const feedPath = args.path || '/prayer-times.ics';

  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === feedPath || url === '/') {
      // Recompute from "today" on every request so subscribers always get a
      // rolling, always-current window.
      const ics = generateICS(config);
      res.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="prayer-times.ics"',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(ics);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`Prayer-times feed live at http://localhost:${port}${feedPath}`);
    console.log('Subscribe to this URL in your calendar app to auto-update daily.');
    console.log('Press Ctrl+C to stop.');
  });
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const command = args._[0] || 'today';

  if (command === 'methods' || args.help || args.h) {
    if (command === 'methods') return cmdMethods();
  }

  const { config, source } = loadConfig(args);
  if (!args.quiet) console.error(`(config: ${path.relative(process.cwd(), source)})`);

  switch (command) {
    case 'today':
      return cmdToday(config, args);
    case 'generate':
      return cmdGenerate(config, args);
    case 'serve':
      return cmdServe(config, args);
    case 'methods':
      return cmdMethods();
    default:
      console.error(`Unknown command "${command}". Use: today | generate | serve | methods`);
      process.exit(1);
  }
}

main();
