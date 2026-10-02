#!/usr/bin/env node
import { program } from 'commander';
import { readFileSync } from 'node:fs';
import { add } from '../src/commands/add.js';
import { create } from '../src/commands/create.js';
import { password } from '../src/commands/password.js';
import { reset } from '../src/commands/reset.js';

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

program
  .command('password')
  .description('Change the admin password of the current project (works while the server runs)')
  .option('--generate', 'generate a random password and print it once')
  .action(password);

program
  .command('reset')
  .description('Delete everything in the current project and rebuild it from the clean template')
  .action(reset);

program.parse();
