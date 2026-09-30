import * as p from '@clack/prompts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
// 8+ chars, no spaces, quotes, #, $ or backslashes (they break .env parsing)
const PASSWORD_PATTERN = /^[A-Za-z0-9!@%^&*()_+=.,:;?~-]{8,}$/;

const STACKS = {
  node: 'Node.js (Express + EJS + Tailwind)',
  python: 'Python (Flask + Jinja + Tailwind)',
};

// npm strips .gitignore when publishing, so templates ship it as _gitignore
const RENAMES = { _gitignore: '.gitignore' };

const TEXT_EXTENSIONS = new Set([
  '.json', '.md', '.js', '.ejs', '.html', '.css', '.py', '.txt', '.example', '.yml', '.yaml',
]);

function cancelAndExit(message = 'Cancelled.') {
  p.cancel(message);
  process.exit(1);
}

function copyTemplate(src, dest, name) {
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

function writeEnv(target, adminPassword) {
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

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return result.status === 0;
}

export async function create(nameArg, opts) {
  p.intro('🧱 Blue Brick');

  // 1. project name
  let name = nameArg;
  if (!name) {
    name = await p.text({
      message: 'Project name?',
      placeholder: 'my-app',
      validate: (v) =>
        NAME_PATTERN.test(v ?? '')
          ? undefined
          : 'Use lowercase letters, numbers, - or _',
    });
    if (p.isCancel(name)) cancelAndExit();
  } else if (!NAME_PATTERN.test(name)) {
    cancelAndExit('Project name must use lowercase letters, numbers, - or _');
  }

  // 2. stack
  let template = opts.template;
  if (!template) {
    template = await p.select({
      message: 'Which stack?',
      options: Object.entries(STACKS).map(([value, label]) => ({ value, label })),
    });
    if (p.isCancel(template)) cancelAndExit();
  }
  if (!STACKS[template]) {
    cancelAndExit(`Unknown template "${template}". Choose: ${Object.keys(STACKS).join(', ')}`);
  }

  // 3. target folder
  const target = path.resolve(process.cwd(), name);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    cancelAndExit(`Folder "${name}" already exists and is not empty.`);
  }

  const src = path.join(TEMPLATES_DIR, template);
  if (!fs.existsSync(src) || fs.readdirSync(src).length === 0) {
    cancelAndExit(`The "${template}" template isn't available yet.`);
  }

  // 4. admin password (empty = generate one; always generated when not in a terminal)
  let adminPassword = '';
  let generated = false;
  if (process.stdin.isTTY) {
    const answer = await p.password({
      message: 'Admin password? (leave empty to generate one)',
      validate: (v) =>
        !v || PASSWORD_PATTERN.test(v)
          ? undefined
          : '8+ characters: letters, numbers and ! @ % ^ & * ( ) _ + = . , : ; ? ~ - only',
    });
    if (p.isCancel(answer)) cancelAndExit();
    adminPassword = answer ?? '';
  }
  if (!adminPassword) {
    adminPassword = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }

  // 5. copy + .env
  const s = p.spinner();
  s.start('Creating project');
  copyTemplate(src, target, name);
  const envWritten = writeEnv(target, adminPassword);
  s.stop('Project created');
  if (envWritten) p.log.success('Wrote .env with a random SESSION_SECRET');

  // 6. git
  if (opts.git !== false) {
    if (run('git', ['init', '-q'], target)) p.log.success('Initialized git repository');
    else p.log.warn('Could not run git init');
  }

  // 7. install (both templates ship a package.json: Express deps or the Tailwind CLI)
  if (opts.install !== false) {
    p.log.step('Installing dependencies');
    if (!run('npm', ['install'], target)) p.log.warn('npm install failed, run it manually');
  }

  // 8. login details
  if (generated) {
    p.note(
      `Admin password: ${adminPassword}\nSaved in .env. Change it there any time.`,
      'Login'
    );
  }

  // 9. next steps
  const steps = [`cd ${name}`];

  if (template === 'python') {
    steps.push(
      'python3 -m venv .venv && source .venv/bin/activate',
      'pip install -r requirements.txt'
    );
  }

  if (opts.install === false) steps.push('npm install');

  steps.push('npm run dev');

  p.note(steps.join('\n'), 'Next steps');
  p.outro('Build quietly. Launch loudly. 🚀');
}
