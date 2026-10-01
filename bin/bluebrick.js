#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { add } from '../src/commands/add.js';
import { create } from '../src/commands/create.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

program
  .name('bluebrick')
  .description(pkg.description)
  .version(pkg.version);

program
  .command('create [name]')
  .description('Create a new Blue Brick project')
  .option('-t, --template <stack>', 'template to use: node or python')
  .option('--no-install', 'skip installing dependencies')
  .option('--no-git', 'skip git init')
  .action(create);

program
  .command('add [module]')
  .description('Add a module to the current project (run without a name to list them)')
  .action(add);

program.parse();
