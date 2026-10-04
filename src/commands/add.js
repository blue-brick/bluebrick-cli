import * as p from '@clack/prompts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = path.resolve(__dirname, '../../modules');
const MODULE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function fail(message) {
  p.cancel(message);
  process.exit(1);
}

function availableModules() {
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(MODULES_DIR, e.name, 'module.json')))
    .map((e) => e.name)
    .sort();
}

function readMeta(name) {
  return JSON.parse(fs.readFileSync(path.join(MODULES_DIR, name, 'module.json'), 'utf8'));
}

function detectStack(cwd) {
  const hasNodeApp = fs.existsSync(path.join(cwd, 'server.js'));
  const hasPythonApp = fs.existsSync(path.join(cwd, 'app.py'));

  if (hasNodeApp && fs.existsSync(path.join(cwd, 'src/modules/index.js'))) return { stack: 'node' };
  if (hasPythonApp && fs.existsSync(path.join(cwd, 'modules/__init__.py'))) return { stack: 'python' };
  return { stack: null, outdated: hasNodeApp || hasPythonApp };
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

function appendMissingLines(file, lines, matches) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const existing = current.split(/\r?\n/);
  const missing = lines.filter((line) => !existing.some((e) => matches(e, line)));
  if (missing.length === 0) return [];

  const prefix = current && !current.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(file, current + prefix + missing.join('\n') + '\n');
  return missing;
}

// npm's allowScripts policy (npm 11.16+) lets a project say which dependencies may run
// install scripts. Writes a name-only approval for each package that has no entry yet.
// A package that already has any entry (pinned, approved or denied) is left alone, so a
// denial is never overridden. Older npm versions ignore the field.
function allowInstallScripts(cwd, names) {
  const file = path.join(cwd, 'package.json');
  if (!names || names.length === 0 || !fs.existsSync(file)) return [];

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }

  const policy = pkg.allowScripts && typeof pkg.allowScripts === 'object' ? pkg.allowScripts : {};
  const added = [];
  for (const name of names) {
    const covered = Object.keys(policy).some((key) => key === name || key.startsWith(`${name}@`));
    if (covered) continue;
    policy[name] = true;
    added.push(name);
  }
  if (added.length === 0) return [];

  pkg.allowScripts = policy;
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  return added;
}

export async function add(moduleName) {
  p.intro('🧱 Blue Brick');

  const modules = availableModules();

  // No module given: list what's available
  if (!moduleName) {
    p.note(modules.map((m) => `${m}  ${readMeta(m).description ?? ''}`).join('\n'), 'Available modules');
    p.outro('Run: bluebrick add <module>');
    return;
  }

  if (!MODULE_NAME.test(moduleName) || !modules.includes(moduleName)) {
    fail(`Unknown module "${moduleName}". Available: ${modules.join(', ')}`);
  }

  // Which kind of project are we in?
  const cwd = process.cwd();
  const { stack, outdated } = detectStack(cwd);
  if (!stack) {
    fail(
      outdated
        ? 'This project was created before modules existed. Create a new one with bluebrick 0.2.0 or later, or copy the loader from a fresh project.'
        : 'Run this from the root of a Blue Brick project (the folder with server.js or app.py).'
    );
  }

  const meta = readMeta(moduleName);
  const stackDir = path.join(MODULES_DIR, moduleName, stack);
  if (!fs.existsSync(stackDir)) fail(`The "${moduleName}" module doesn't support the ${stack} stack yet.`);

  // Never overwrite anything
  const files = listFiles(stackDir);
  const conflicts = files.filter((rel) => fs.existsSync(path.join(cwd, rel)));
  if (conflicts.length > 0) {
    fail(
      `Nothing changed. These files already exist, so "${moduleName}" may already be added:\n${conflicts
        .map((c) => `  ${c}`)
        .join('\n')}`
    );
  }

  // Copy files
  for (const rel of files) {
    const dest = path.join(cwd, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(stackDir, rel), dest);
  }
  p.log.success(`Added ${files.length} file${files.length === 1 ? '' : 's'}:\n${files.map((f) => `  ${f}`).join('\n')}`);

  // .gitignore
  const ignored = appendMissingLines(path.join(cwd, '.gitignore'), meta.gitignore ?? [], (e, line) => e === line);
  if (ignored.length > 0) p.log.success(`Added to .gitignore: ${ignored.join(', ')}`);

  const stackMeta = meta[stack] ?? {};

  // Install-script approvals go in first, so the install below runs with them in place
  if (stack === 'node') {
    const allowed = allowInstallScripts(cwd, stackMeta.allowScripts);
    if (allowed.length > 0) p.log.success(`Allowed install scripts in package.json: ${allowed.join(', ')}`);
  }

  // Dependencies
  if (stack === 'node' && stackMeta.npm?.length > 0) {
    p.log.step(`Installing ${stackMeta.npm.join(', ')}`);
    const ok = spawnSync('npm', ['install', ...stackMeta.npm], { cwd, stdio: 'inherit' }).status === 0;
    if (!ok) p.log.warn(`npm install failed, run it yourself: npm install ${stackMeta.npm.join(' ')}`);
  }

  if (stack === 'python' && stackMeta.pip?.length > 0) {
    const added = appendMissingLines(
      path.join(cwd, 'requirements.txt'),
      stackMeta.pip,
      (e, line) => e.trim().toLowerCase().startsWith(line.toLowerCase().split(/[<>=!~ ]/)[0])
    );
    if (added.length > 0) {
      p.log.success(`Added to requirements.txt: ${added.join(', ')}`);
      p.log.info('Run: pip install -r requirements.txt (with your venv active)');
    }
  }

  // Smoke check that the dependency actually loads
  if (stack === 'node' && stackMeta.check) {
    const script = `import(${JSON.stringify(stackMeta.check)}).then(() => process.exit(0), () => process.exit(1))`;
    const loads = spawnSync('node', ['-e', script], { cwd }).status === 0;
    if (!loads) {
      p.log.warn(
        `${stackMeta.check} installed but failed to load (it has a native build step). Try: npm rebuild ${stackMeta.check}`
      );
    }
  }

  if (stackMeta.usage?.length > 0) p.note(stackMeta.usage.join('\n'), 'Using it');
  p.outro(`Added ${moduleName}. Restart your dev server to load it.`);
}
