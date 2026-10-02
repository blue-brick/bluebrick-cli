import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

// 8+ chars, no spaces, quotes, #, $ or backslashes (they break .env parsing)
export const PASSWORD_PATTERN = /^[A-Za-z0-9!@%^&*()_+=.,:;?~-]{8,}$/;

// npm strips .gitignore when publishing, so templates ship it as _gitignore
const RENAMES = { _gitignore: '.gitignore' };

const TEXT_EXTENSIONS = new Set([
  '.json', '.md', '.js', '.ejs', '.html', '.css', '.py', '.txt', '.example', '.yml', '.yaml',
]);

export function copyTemplate(src, dest, name) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destName = RENAMES[entry.name] ?? entry.name;
    const destPath = path.join(dest, destName);

    if (entry.isDirectory()) {
      copyTemplate(srcPath, destPath, name);
      continue;
    }

    const ext = path.extname(destName);
    const isText = TEXT_EXTENSIONS.has(ext) || destName.startsWith('.env');

    if (isText) {
      const content = fs.readFileSync(srcPath, 'utf8').replaceAll('{{name}}', name);
      fs.writeFileSync(destPath, content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function writeEnv(target, adminPassword) {
  const examplePath = path.join(target, '.env.example');
  if (!fs.existsSync(examplePath)) return false;

  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const content = fs
    .readFileSync(examplePath, 'utf8')
    .replace(/^ADMIN_PASSWORD=.*$/m, () => `ADMIN_PASSWORD=${adminPassword}`)
    .replace(/^SESSION_SECRET=.*$/m, () => `SESSION_SECRET=${sessionSecret}`);

  fs.writeFileSync(path.join(target, '.env'), content, { mode: 0o600 });
  return true;
}

export function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return result.status === 0;
}
