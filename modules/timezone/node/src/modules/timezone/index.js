import ejs from 'ejs';
import fs from 'node:fs';
import path from 'node:path';

// Needs the Settings sections hook (template 0.4.0 or newer). On an older project the module
// stays inactive instead of crashing the server; register() below says so.
let csrfToken;
let verifyCsrf;
let addSettingsSection;
try {
  ({ csrfToken, verifyCsrf } = await import('../../middleware/csrf.js'));
  ({ addSettingsSection } = await import('../../settings/sections.js'));
} catch {
  // handled in register()
}

// src/modules/timezone -> project root is three levels up
const ROOT = path.resolve(import.meta.dirname, '../../..');
const CONFIG_PATH = path.join(ROOT, 'data', 'timezone.json');

const countries = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'countries.json'), 'utf8'));
const ZONES = new Set(['UTC', ...countries.flatMap((c) => c.zones)]);

// Fixed offsets in minutes from UTC. They never change for daylight saving.
const OFFSETS = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240, 270,
  300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 825, 840,
];

const DEFAULT_CONFIG = { mode: 'zone', country: null, zone: 'UTC', minutes: 0 };

export function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `GMT${sign}${hours}${mins ? ':' + String(mins).padStart(2, '0') : ''}`;
}

const OFFSET_OPTIONS = OFFSETS.map((minutes) => ({ minutes, label: formatOffset(minutes) }));

// --- saved choice (data/timezone.json) ---
export function getTimezone() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (saved.mode === 'offset' && OFFSETS.includes(saved.minutes)) return { ...DEFAULT_CONFIG, ...saved };
    if (saved.mode === 'zone' && ZONES.has(saved.zone)) return { ...DEFAULT_CONFIG, ...saved };
  } catch {
    // no file yet or unreadable: use the default
  }
  return { ...DEFAULT_CONFIG };
}

function saveTimezone(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

// --- offset, abbreviation and daylight saving for a zone ---
function zoneOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function isDst(date, timeZone) {
  const year = date.getUTCFullYear();
  const jan = zoneOffsetMinutes(new Date(Date.UTC(year, 0, 1)), timeZone);
  const jul = zoneOffsetMinutes(new Date(Date.UTC(year, 6, 1)), timeZone);
  return jan !== jul && zoneOffsetMinutes(date, timeZone) === Math.max(jan, jul);
}

// Abbreviations like EST or IST only exist in some locales, so try a few and skip the
// plain "GMT+5:30" style names. Returns null when the zone has no real abbreviation.
const ABBREVIATION_LOCALES = ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en-CA', 'en-NZ', 'en-ZA'];

function abbreviation(date, timeZone) {
  for (const locale of ABBREVIATION_LOCALES) {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (name && !/^(GMT|UTC)[+\-\u2212]/.test(name)) return name;
  }
  return null;
}

export function describeTimezone(config = getTimezone(), date = new Date()) {
  if (config.mode === 'offset') {
    const offsetLabel = formatOffset(config.minutes);
    return {
      zone: null,
      abbr: null,
      offsetMinutes: config.minutes,
      offsetLabel,
      dst: false,
      summary: `${offsetLabel} (fixed offset, no daylight saving)`,
    };
  }

  const offsetMinutes = zoneOffsetMinutes(date, config.zone);
  const offsetLabel = formatOffset(offsetMinutes);
  const abbr = abbreviation(date, config.zone);
  const dst = isDst(date, config.zone);
  const parts = [abbr, offsetLabel].filter(Boolean);
  if (dst) parts.push('daylight saving in effect');

  return { zone: config.zone, abbr, offsetMinutes, offsetLabel, dst, summary: parts.join(' · ') };
}

function clockStrings(offsetMinutes, date = new Date()) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000);
  return {
    time: shifted.toISOString().slice(11, 19),
    date: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(shifted),
  };
}

// For your products: format any Date (or timestamp / ISO string) in the chosen time zone.
// Store timestamps in UTC and call this only when showing them.
export function formatTime(value = new Date(), options = { dateStyle: 'medium', timeStyle: 'medium' }) {
  const date = value instanceof Date ? value : new Date(value);
  const config = getTimezone();

  if (config.mode === 'offset') {
    const shifted = new Date(date.getTime() + config.minutes * 60000);
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(shifted);
  }
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: config.zone }).format(date);
}

// --- reading what the form or the preview sends; null means invalid ---
function configFromInput(input) {
  if (input.mode === 'offset') {
    const minutes = Number(input.minutes ?? input.offset);
    return OFFSETS.includes(minutes) ? { mode: 'offset', country: null, zone: null, minutes } : null;
  }

  if (input.mode === 'zone') {
    const zone = String(input.zone ?? '');
    const country = String(input.country ?? '') || null;
    if (!ZONES.has(zone)) return null;
    if (country) {
      const entry = countries.find((c) => c.code === country);
      if (!entry || !entry.zones.includes(zone)) return null;
    }
    return { mode: 'zone', country, zone, minutes: 0 };
  }

  return null;
}

async function renderSection(req) {
  const config = getTimezone();
  const info = describeTimezone(config);

  return ejs.renderFile(path.join(import.meta.dirname, 'section.ejs'), {
    csrf: csrfToken(req),
    saved: req.query.tz === 'saved',
    error: req.query.tz === 'error' ? 'Pick a country and a time zone, or choose a fixed offset.' : null,
    preview: { ...info, ...clockStrings(info.offsetMinutes) },
    data: { countries, offsets: OFFSET_OPTIONS, current: config, preview: info },
  });
}

export function register(app) {
  if (!addSettingsSection) {
    console.warn(
      '[timezone] This project has no Settings sections, so the module is inactive. Create a fresh project with bluebrick 0.4.0 or later.'
    );
    return;
  }

  addSettingsSection({ id: 'timezone', title: 'Time zone', render: renderSection });

  // Used by the live preview in Settings (behind the admin login like everything else)
  app.get('/settings/timezone/preview', (req, res) => {
    const config = configFromInput(req.query);
    if (!config) return res.status(400).json({ ok: false });
    res.json({ ok: true, ...describeTimezone(config) });
  });

  app.post('/settings/timezone', verifyCsrf, (req, res) => {
    const config = configFromInput(req.body ?? {});
    if (!config) return res.redirect('/settings?tz=error#timezone');
    saveTimezone(config);
    res.redirect('/settings?tz=saved#timezone');
  });
}
