import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// src/auth -> project root is two levels up
const ROOT = path.resolve(import.meta.dirname, '../..');
const AUTH_PATH = path.join(ROOT, 'data', 'auth.json');

// scrypt parameters. The Python template and `bluebrick password` use the same format,
// so a hash written by any of them is accepted by all of them.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAX_PASSWORD_LENGTH = 256;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password, stored) {
  const value = String(password);
  if (value.length > MAX_PASSWORD_LENGTH) return false;
  try {
    const [scheme, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(value, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function write(data) {
  fs.mkdirSync(path.dirname(AUTH_PATH), { recursive: true });
  const tmp = `${AUTH_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, AUTH_PATH);
}

export function authExists() {
  return fs.existsSync(AUTH_PATH);
}

// Read on every call (it is a tiny file) so a change made from the terminal
// takes effect immediately, without restarting the server.
export function getAuth() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  } catch {
    return { hash: '', version: 0, changedAt: '' };
  }
}

// First start only: seed the store from the password in .env.
export function ensureAuth(bootstrapPassword) {
  if (authExists()) return;
  write({
    hash: hashPassword(bootstrapPassword),
    version: 1,
    changedAt: new Date().toISOString(),
  });
}

export function checkPassword(password) {
  return verifyPassword(password, getAuth().hash);
}

// Bumping the version signs out every existing session.
export function setPassword(password) {
  const data = {
    hash: hashPassword(password),
    version: (getAuth().version || 0) + 1,
    changedAt: new Date().toISOString(),
  };
  write(data);
  return data;
}
