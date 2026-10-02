import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Same scrypt format as the Node and Python templates, so any of them accepts the hash.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), hash.toString('base64')].join('$');
}

// Writes data/auth.json in the project, bumping the version so every old session is signed out.
export function writeAuth(projectRoot, password) {
  const file = path.join(projectRoot, 'data', 'auth.json');

  let version = 0;
  try {
    version = Number(JSON.parse(fs.readFileSync(file, 'utf8')).version) || 0;
  } catch {
    // no file yet (server never started) or unreadable: start from 0
  }

  const data = {
    hash: hashPassword(password),
    version: version + 1,
    changedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  return data;
}
