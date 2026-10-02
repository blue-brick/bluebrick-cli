import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// src/auth -> project root is two levels up
const ROOT = path.resolve(import.meta.dirname, '../..');
const RESET_PATH = path.join(ROOT, 'data', 'reset.json');

const TTL_MS = 15 * 60 * 1000; // a code is valid for 15 minutes
const MIN_GAP_MS = 60 * 1000; // at most one new code per minute
const MAX_ATTEMPTS = 5; // wrong guesses before the code is thrown away
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 characters, no look-alikes

function readState() {
  try {
    return JSON.parse(fs.readFileSync(RESET_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(RESET_PATH), { recursive: true });
  const tmp = `${RESET_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, RESET_PATH);
}

const normalize = (value) => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

export function clearResetCode() {
  fs.rmSync(RESET_PATH, { force: true });
}

export function hasActiveCode() {
  const state = readState();
  return Boolean(state) && Date.now() <= state.expiresAt;
}

function newCode() {
  // 16 characters x 5 bits = 80 bits, shown as XXXX-XXXX-XXXX-XXXX
  const chars = Array.from(crypto.randomBytes(16), (b) => ALPHABET[b & 31]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

// The code is printed in the server log and saved in data/reset.json,
// so only someone with access to the server can read it.
export function requestResetCode() {
  const state = readState();
  if (state && Date.now() - state.createdAt < MIN_GAP_MS) {
    return { ok: false, error: 'A code was created a moment ago. Wait a minute before asking for another.' };
  }

  const code = newCode();
  const now = Date.now();
  writeState({ code, createdAt: now, expiresAt: now + TTL_MS, attempts: 0 });
  console.log(`\n[bluebrick] Password reset code: ${code} (valid 15 minutes, also saved in data/reset.json)\n`);
  return { ok: true };
}

// Returns ok:true once, then the code is gone.
export function consumeResetCode(input) {
  const state = readState();
  if (!state) return { ok: false, error: 'No reset code is active. Create a new one.' };

  if (Date.now() > state.expiresAt) {
    clearResetCode();
    return { ok: false, error: 'That code expired. Create a new one.' };
  }

  const sent = Buffer.from(normalize(input));
  const expected = Buffer.from(normalize(state.code));
  const match = sent.length === expected.length && crypto.timingSafeEqual(sent, expected);

  if (!match) {
    state.attempts += 1;
    if (state.attempts >= MAX_ATTEMPTS) {
      clearResetCode();
      return { ok: false, error: 'Too many wrong codes. Create a new one.' };
    }
    writeState(state);
    return { ok: false, error: 'Wrong code.' };
  }

  clearResetCode();
  return { ok: true };
}
