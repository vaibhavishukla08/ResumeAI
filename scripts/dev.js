#!/usr/bin/env node
/**
 * Runs the API and the Vite dev server together with prefixed, colourised
 * output, so `npm run dev` is the only command needed. Avoids a dependency on
 * concurrently for one small job.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Each child gets its port pinned explicitly. Without this, a PORT inherited
// from the parent environment would be picked up by BOTH the API and Vite, and
// they would race for the same socket.
const API_PORT = process.env.API_PORT || '5174';
const WEB_PORT = process.env.WEB_PORT || '5173';

const TARGETS = [
  {
    name: 'api',
    colour: '\x1b[36m',
    cwd: path.join(ROOT, 'server'),
    args: ['run', 'dev'],
    env: { PORT: API_PORT },
  },
  {
    name: 'web',
    colour: '\x1b[35m',
    cwd: path.join(ROOT, 'client'),
    args: ['run', 'dev'],
    // Vite reads its port from vite.config.js; VITE_API_TARGET points the
    // proxy at whichever port the API actually bound.
    env: { PORT: WEB_PORT, VITE_API_TARGET: `http://localhost:${API_PORT}` },
  },
];

const RESET = '\x1b[0m';
const children = [];
let shuttingDown = false;

for (const target of TARGETS) {
  const child = spawn(npm, target.args, {
    cwd: target.cwd,
    shell: false,
    env: { ...process.env, ...target.env },
  });
  children.push(child);

  const prefix = `${target.colour}[${target.name}]${RESET} `;
  const pipe = (stream) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) console.log(prefix + line);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`${prefix}exited with code ${code}`);
    shutdown();
  });
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 300);
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, shutdown);
