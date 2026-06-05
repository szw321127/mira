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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    env,
    shell: true,
    stdio: 'inherit',
  });

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('prisma', ['generate']);
run('prisma', ['migrate', 'deploy']);
run('nest', ['start', '--watch']);
