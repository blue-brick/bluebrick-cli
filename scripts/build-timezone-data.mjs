// Builds the country -> time zones list from the system tz database.
// Run from the repo root: node scripts/build-timezone-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const ZONEINFO = process.env.ZONEINFO_DIR || '/usr/share/zoneinfo';
const OUTPUTS = [
  'modules/timezone/node/src/modules/timezone/countries.json',
  'modules/timezone/python/modules/timezone/countries.json',
];

function readTab(file) {
  const full = path.join(ZONEINFO, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing ${full}. Install tzdata or set ZONEINFO_DIR.`);
    process.exit(1);
  }
  return fs
    .readFileSync(full, 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'));
}

const names = new Map(readTab('iso3166.tab').map(([code, name]) => [code, name]));
const zonesByCountry = new Map();

for (const [code, , zone] of readTab('zone.tab')) {
  if (!zonesByCountry.has(code)) zonesByCountry.set(code, []);
  zonesByCountry.get(code).push(zone);
}

const countries = [...zonesByCountry.entries()]
  .map(([code, zones]) => ({ code, name: names.get(code) ?? code, zones: zones.sort() }))
  .sort((a, b) => a.name.localeCompare(b.name));

// Every zone must be known to this Node's Intl, or the module would fail for it
const unsupported = [];
for (const country of countries) {
  for (const zone of country.zones) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
    } catch {
      unsupported.push(zone);
    }
  }
}
if (unsupported.length > 0) {
  console.error(`Intl does not know these zones: ${unsupported.join(', ')}`);
  process.exit(1);
}

for (const out of OUTPUTS) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(countries) + '\n');
}

const zoneCount = countries.reduce((n, c) => n + c.zones.length, 0);
console.log(`Wrote ${countries.length} countries and ${zoneCount} zones to ${OUTPUTS.length} files.`);
