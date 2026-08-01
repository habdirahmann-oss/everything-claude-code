# Prayer Times → Calendar

Put the five daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha) into your calendar
— and keep them correct as the times drift with the sun through the year and
across daylight-saving changes.

Times are computed locally from the sun's position (the PrayTimes.org
algorithm), so nothing leaves your machine and there is no API key. Output is a
standard **iCalendar (`.ics`)** file/feed that works with Google Calendar, Apple
Calendar, Outlook, and anything else that speaks iCalendar.

## Why an `.ics` feed

Prayer times are astronomical: each day's five moments shift by a minute or two,
and the local clock time also jumps an hour at daylight-saving boundaries. A
single fixed event can't track that. This tool solves it two ways:

- **Subscribe to a live feed** (recommended) — run `serve`, subscribe your
  calendar to the URL once, and it re-reads a rolling, always-current window on
  its own. New days appear automatically; DST is handled because every event is
  stored as an absolute UTC instant that your calendar renders in local time.
- **Import a file** — generate a year of events and import once. Re-generate
  when you want to extend the horizon.

## Quick start

```bash
# 1. Copy the example config and set your location
cp prayer-times/config.example.json prayer-times/config.json
#    edit latitude, longitude, timezone, method…

# 2. See today's times in your terminal
node prayer-times/cli.js today

# 3a. Generate a year of events as a file to import
node prayer-times/cli.js generate            # writes prayer-times/prayer-times.ics

# 3b. …or run a live, auto-updating subscription feed
node prayer-times/cli.js serve --port 3000   # http://localhost:3000/prayer-times.ics
```

No `npm install` is needed — the tool uses only the Node.js standard library
(Node >= 18).

## Configuration

`config.json` (copy from `config.example.json`):

| Field | Meaning |
| --- | --- |
| `location.name` | Label shown on events |
| `location.latitude` / `longitude` | Your coordinates (decimal degrees, east/north positive) |
| `location.elevation` | Metres above sea level (optional, refines sunrise/sunset) |
| `timezone` | IANA timezone, e.g. `Europe/Amsterdam`, used for display and the rolling "today" |
| `method` | Calculation method (see below) |
| `asr` | `Standard` (Shafi'i/Maliki/Hanbali) or `Hanafi` |
| `highLats` | High-latitude twilight rule: `AngleBased`, `OneSeventh`, `NightMiddle`, or `None` |
| `prayers` | Which entries to emit, in order |
| `includeSunrise` | Add an informational sunrise entry (no reminder) |
| `horizonDays` | How many days to emit (default 365) |
| `eventDurationMinutes` | Length of each calendar block (default 25) |
| `reminderMinutes` | Pop a reminder N minutes before each prayer (omit for none) |
| `refreshHours` | Hint to calendar apps for how often to refresh a subscription |
| `dhuhrMinutes` | Minutes after solar noon for Dhuhr (default 0) |
| `tune` | Per-prayer minute offsets to match a local mosque table |

Find your coordinates on any maps app (right-click → "What's here?"). You can
also override config fields per run:

```bash
node prayer-times/cli.js today --lat 51.9244 --lng 4.4777 --tz Europe/Amsterdam --name Rotterdam --method ISNA --asr Hanafi
```

### Calculation methods

Different authorities use different twilight angles for Fajr and Isha. List them
with `node prayer-times/cli.js methods`. Included: MWL, ISNA, Egypt, Makkah
(Umm al-Qura), Karachi, Tehran, Jafari, Dubai, Kuwait, Qatar, Singapore, France,
Turkey. If you follow a specific local mosque, pick the closest method and use
`tune` to nudge individual prayers to match its table.

**High latitudes (e.g. the Netherlands):** in summer the sun never dips far
enough below the horizon for a true Fajr/Isha, so those angles are undefined.
`highLats` chooses how to estimate them from a portion of the night;
`AngleBased` is the common default. Different mosques choose differently, so
compare with your local table and switch the rule if needed.

## Commands

| Command | What it does |
| --- | --- |
| `today [--date YYYY-MM-DD]` | Print one day's times in your timezone |
| `generate [--out file] [--days N] [--start YYYY-MM-DD]` | Write an `.ics` file |
| `serve [--port N] [--path /prayer-times.ics]` | Host a live, always-current feed |
| `methods` | List calculation methods |

All commands accept `--config <file>` and the field overrides shown above.

## Adding it to your calendar

**Google Calendar (subscribe — auto-updates):** host the `serve` feed at a URL
Google can reach, then *Other calendars → + → From URL* and paste it. Google
refreshes subscribed calendars periodically, so new days and DST shifts appear
without any action.

**Google Calendar (import — one-off):** *Settings → Import & export → Import*
and choose your generated `prayer-times.ics`.

**Apple Calendar:** *File → New Calendar Subscription…* and paste the feed URL
(auto-updates), or double-click the `.ics` file to import.

**Outlook:** *Add calendar → Subscribe from web* for the feed URL, or import the
`.ics` file.

### Keeping it current

- **Subscription feed** is the least effort — subscribe once, done.
- **Cron re-generate** if you prefer files: regenerate and republish daily.

  ```cron
  # every day at 01:00, refresh a hosted copy
  0 1 * * * cd /path/to/repo && node prayer-times/cli.js generate --out /var/www/prayer-times.ics
  ```

To host the `serve` feed continuously, run it under a process manager
(`systemd`, `pm2`, a container) on an always-on machine, or deploy the
`generateICS()` function behind any serverless HTTP endpoint.

## How it works

```
lib/dmath.js         degree-based trigonometry helpers
lib/solar.js         Julian date + sun declination / equation of time
lib/methods.js       calculation-method presets (twilight angles)
lib/prayer-times.js  the five times for a date, as absolute UTC instants
lib/dates.js         calendar-tuple date math + ICS timestamp formatting
lib/ics.js           RFC 5545 iCalendar writer (folding, escaping, VALARM)
lib/generate.js      config -> full calendar / one-day table
cli.js               today / generate / serve / methods
```

Times are returned as UTC instants on purpose: a prayer tracks the true sun, an
absolute moment, so a UTC event renders at the right local wall-clock time in
any calendar and stays correct across daylight-saving transitions with no
timezone bookkeeping.

## Tests

```bash
node tests/prayer-times/prayer-times.test.js
node tests/prayer-times/ics.test.js
# or the whole repo suite:
node tests/run-all.js
```

## Accuracy note

Computed times are astronomical and typically land within a minute of published
tables, but conventions vary between mosques (method, high-latitude rule,
rounding, safety margins). Compare against the table you follow and use `method`
/ `highLats` / `tune` to match it before relying on the calendar.
