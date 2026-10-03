import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SERVER = 'https://license.bluebrick.fun';
export const KEY_PATTERN = /^BB-([A-Z0-9]{4}-){3}[A-Z0-9]{4}$/;

export const normalizeKey = (k) => String(k || '').trim().toUpperCase();

// Env var wins (handy for local testing), then the server stored in the
// license file, then the default.
export function serverUrl(lic) {
  return (
    process.env.BLUEBRICK_LICENSE_URL ||
    (lic && lic.server) ||
    DEFAULT_SERVER
  ).replace(/\/+$/, '');
}

function rawMachineId() {
  try {
    if (process.platform === 'linux') {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (existsSync(f)) {
          const v = readFileSync(f, 'utf8').trim();
          if (v) return v;
        }
      }
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf8',
      });
      const m = out.match(/"IOPlatformUUID" = "([^"]+)"/);
      if (m) return m[1];
    } else if (process.platform === 'win32') {
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8' }
      );
      const m = out.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
      if (m) return m[1];
    }
  } catch {
    // fall through to the persisted random id
  }
  const dir = path.join(os.homedir(), '.bluebrick');
  const file = path.join(dir, 'machine-id');
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    const id = randomUUID();
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, id, { mode: 0o600 });
    return id;
  }
}

// Hash of the OS machine id only (not the hostname), so renaming a server
// does not lock the buyer out.
export function machineId() {
  return createHash('sha256')
    .update('bluebrick:' + rawMachineId())
    .digest('hex');
}

export async function request(server, endpoint, body) {
  try {
    return await fetch(server + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Could not reach the license server at ${server}. Check your connection and try again.`
    );
  }
}

export async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return { ok: false, error: 'bad_response', message: 'The license server sent an unexpected response.' };
  }
}

export function maskKey(key) {
  return 'BB-****-****-****-' + String(key).slice(-4);
}

const LICENSE_REL = path.join('.bluebrick', 'license.json');

export function writeLicense(dir, data) {
  const file = path.join(dir, LICENSE_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });

  // keep the key out of git
  const gi = path.join(dir, '.gitignore');
  const current = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  if (!current.split(/\r?\n/).includes('.bluebrick/')) {
    writeFileSync(gi, current + (current && !current.endsWith('\n') ? '\n' : '') + '.bluebrick/\n');
  }
}

// Walks up from startDir looking for .bluebrick/license.json
export function findLicense(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    const file = path.join(dir, LICENSE_REL);
    if (existsSync(file)) {
      try {
        return { dir, file, data: JSON.parse(readFileSync(file, 'utf8')) };
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}