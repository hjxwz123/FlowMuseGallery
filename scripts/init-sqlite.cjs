const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const { PrismaClient } = require('@prisma/client');

const repoRoot = path.resolve(__dirname, '..');
const migrationPath = path.join(
  repoRoot,
  'prisma',
  'migrations',
  '20260425045042_personal_sqlite',
  'migration.sql',
);

function sqlitePathFromDatabaseUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) return null;

  const rawPath = databaseUrl.slice('file:'.length);
  if (!rawPath || rawPath === ':memory:') return null;

  if (path.isAbsolute(rawPath)) return rawPath;

  return path.resolve(repoRoot, 'prisma', rawPath);
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function main() {
  const databasePath = sqlitePathFromDatabaseUrl(process.env.DATABASE_URL);
  if (databasePath) mkdirSync(path.dirname(databasePath), { recursive: true });

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');

    const migrationSql = readFileSync(migrationPath, 'utf8');
    for (const statement of splitSqlStatements(migrationSql)) {
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
