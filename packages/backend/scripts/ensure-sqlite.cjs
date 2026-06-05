const fs = require('node:fs');
const path = require('node:path');

const dbPath = path.join(__dirname, '..', 'prisma', 'dev.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.closeSync(fs.openSync(dbPath, 'a'));
