#!/usr/bin/env node
import { spawn } from 'node:child_process';

const port = process.env.CLIENT_PORT ?? '4200';
const child = spawn('ng', ['serve', '--port', port, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: false,
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('Failed to spawn ng:', err);
  process.exit(1);
});
