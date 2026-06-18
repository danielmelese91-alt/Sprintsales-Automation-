import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'data', 'platform.json');
const apply = process.argv.includes('--apply');
dotenv.config({ path: path.join(rootDir, '.env') });
const databaseUrl = process.env.DATABASE_URL || '';
const dbSsl = ['true', '1', 'yes'].includes(String(process.env.DB_SSL || process.env.DATABASE_SSL || '').toLowerCase());
const dbPool = databaseUrl
  ? new pg.Pool({ connectionString: databaseUrl, ssl: dbSsl ? { rejectUnauthorized: false } : undefined })
  : null;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(rootDir, 'backups', `client-data-reset-${stamp}`);

const arrayKeysToClear = [
  'clients',
  'knowledgeFiles',
  'conversations',
  'messages',
  'leads',
  'orders',
  'stockMovements',
  'reminders',
  'bookings',
  'paymentProofs',
  'customerNotes',
  'products',
  'productPosts',
  'unansweredQuestions',
  'botErrors',
  'botTests',
  'auditLogs',
  'customers',
  'productRecommendations',
  'productIntents',
  'announcementCampaigns',
  'campaignRecipients',
  'shopperMessageLedger',
  'billingPayments',
  'clientNotices'
];

const objectKeysToClear = [
  'loginFailures',
  'registrationCodes'
];

const isAdminUser = user => {
  const role = String(user?.role || '').toLowerCase();
  const type = String(user?.type || '').toLowerCase();
  return user?.isAdmin === true || role.includes('admin') || type.includes('admin');
};

const maybeBackupDir = async dir => {
  try {
    await fs.access(dir);
    await fs.cp(dir, path.join(backupDir, path.relative(rootDir, dir)), { recursive: true });
    return true;
  } catch (_error) {
    return false;
  }
};

const maybeEmptyDir = async dir => {
  try {
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (_error) {
    return false;
  }
};

const ensureDb = async () => {
  if (!dbPool) return;
  await dbPool.query(`
    create table if not exists platform_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
};

const readSourceData = async () => {
  if (dbPool) {
    await ensureDb();
    const result = await dbPool.query('select data from platform_state where id = $1', ['main']);
    if (result.rows[0]?.data) return { data: result.rows[0].data, source: 'postgres' };
  }
  return { data: JSON.parse(await fs.readFile(dataPath, 'utf8')), source: 'json' };
};

const writeSourceData = async data => {
  if (dbPool) {
    await ensureDb();
    await dbPool.query(
      `insert into platform_state (id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      ['main', JSON.stringify(data)]
    );
  }
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
};

const { data, source } = await readSourceData();
const before = {
  users: Array.isArray(data.users) ? data.users.length : 0,
  adminUsers: Array.isArray(data.users) ? data.users.filter(isAdminUser).length : 0,
  clients: Array.isArray(data.clients) ? data.clients.length : 0,
  products: Array.isArray(data.products) ? data.products.length : 0,
  orders: Array.isArray(data.orders) ? data.orders.length : 0,
  customers: Array.isArray(data.customers) ? data.customers.length : 0,
  conversations: Array.isArray(data.conversations) ? data.conversations.length : 0
};

if (!apply) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    before,
    source,
    willPreserve: ['admin users', 'platformSettings', 'global AI/admin bot settings inside platformSettings'],
    willClearArrays: arrayKeysToClear,
    willClearObjects: objectKeysToClear,
    note: 'Run with --apply to create a backup and reset client data.'
  }, null, 2));
  process.exit(0);
}

await fs.mkdir(backupDir, { recursive: true });
await fs.writeFile(path.join(backupDir, `${source}-platform-state.json`), JSON.stringify(data, null, 2));
await fs.copyFile(dataPath, path.join(backupDir, 'platform.json.local-copy')).catch(() => null);
const backedUpDirs = [];
for (const relative of ['data/product-images', 'data/telegram-media']) {
  const dir = path.join(rootDir, relative);
  if (await maybeBackupDir(dir)) backedUpDirs.push(relative);
}

data.users = Array.isArray(data.users) ? data.users.filter(isAdminUser) : [];
for (const key of arrayKeysToClear) {
  if (Array.isArray(data[key])) data[key] = [];
}
for (const key of objectKeysToClear) {
  if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) data[key] = {};
}

data.resetHistory = Array.isArray(data.resetHistory) ? data.resetHistory : [];
data.resetHistory.push({
  at: new Date().toISOString(),
  type: 'client-data-reset',
  backupDir,
  before
});
if (data.platformSettings && typeof data.platformSettings === 'object') {
  data.platformSettings.lastAlertAt = {};
}

await writeSourceData(data);

const emptiedDirs = [];
for (const relative of ['data/product-images', 'data/telegram-media']) {
  const dir = path.join(rootDir, relative);
  if (await maybeEmptyDir(dir)) emptiedDirs.push(relative);
}

const after = {
  users: data.users.length,
  adminUsers: data.users.filter(isAdminUser).length,
  clients: data.clients?.length || 0,
  products: data.products?.length || 0,
  orders: data.orders?.length || 0,
  customers: data.customers?.length || 0,
  conversations: data.conversations?.length || 0
};

console.log(JSON.stringify({
  ok: true,
  source,
  backupDir,
  backedUpDirs,
  emptiedDirs,
  before,
  after
}, null, 2));

if (dbPool) await dbPool.end();
