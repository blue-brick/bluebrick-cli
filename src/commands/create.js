import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../../templates');

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

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

  // 4. copy
  const s = p.spinner();
  s.start('Creating project');
  copyTemplate(src, target, name);
  s.stop('Project created');

  // 5. git
  if (opts.git !== false) {
    if (run('git', ['init', '-q'], target)) p.log.success('Initialized git repository');
    else p.log.warn('Could not run git init');
  }

  // 6. install (node only for now)
  if (template === 'node' && opts.install !== false) {
    p.log.step('Installing dependencies');
    if (!run('npm', ['install'], target)) p.log.warn('npm install failed, run it manually');
  }

  // 7. next steps
  const steps =
    template === 'node'
      ? [`cd ${name}`, ...(opts.install === false ? ['npm install'] : []), 'npm run dev']
      : [
          `cd ${name}`,
          'python3 -m venv .venv && source .venv/bin/activate',
          'pip install -r requirements.txt',
          'flask run',
        ];

  p.note(steps.join('\n'), 'Next steps');
  p.outro('Build quietly. Launch loudly. 🚀');
}
