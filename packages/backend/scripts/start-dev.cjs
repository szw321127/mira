const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const databasePath = path.join(backendRoot, 'prisma', 'dev.db');
const databaseUrl = `file:${databasePath}`;
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
};

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.closeSync(fs.openSync(databasePath, 'a'));

const migrate = spawnSync('prisma', ['migrate', 'deploy'], {
  cwd: backendRoot,
  env,
  shell: true,
  stdio: 'inherit',
});

if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

const nest = spawnSync('nest', ['start', '--watch'], {
  cwd: backendRoot,
  env,
  shell: true,
  stdio: 'inherit',
});

if (nest.signal) {
  process.kill(process.pid, nest.signal);
}

process.exit(nest.status ?? 0);
