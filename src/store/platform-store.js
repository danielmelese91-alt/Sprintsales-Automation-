import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const normalizeBusinessType = value => {
  if (['retail', 'product', 'products', 'shop', 'store'].includes(String(value || '').toLowerCase())) return 'retail';
  if (['service', 'services'].includes(String(value || '').toLowerCase())) return 'service';
  return '';
};

export function createPlatformStore(deps) {
  const {
    rootDir,
    databaseUrl = '',
    dbSsl = false,
    defaultSettings,
    defaultBilling,
    hashPassword,
    uid,
    now,
    normalizeAiUsage
  } = deps;

  const dataDir = path.join(rootDir, 'data');
  const uploadDir = path.join(dataDir, 'uploads');
  const productImageDir = path.join(dataDir, 'product-images');
  const telegramMediaDir = path.join(dataDir, 'telegram-media');
  const dataFile = path.join(dataDir, 'platform.json');
  const backupDir = path.join(rootDir, 'backups');
  const jsonBackupDir = path.join(backupDir, 'json');
  const fullBackupDir = path.join(backupDir, 'full');
  const publicDir = path.join(rootDir, 'public');

  const { Pool } = pg;
  const dbPool = databaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        ssl: dbSsl ? { rejectUnauthorized: false } : undefined
      })
    : null;
  let dbReady = false;
  let dbReadyPromise = null;

  const ensureDatabase = async () => {
    if (!dbPool || dbReady) return;
    if (!dbReadyPromise) {
      dbReadyPromise = dbPool.query(`
        create table if not exists platform_state (
          id text primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        )
      `).then(() => {
        dbReady = true;
      }).finally(() => {
        dbReadyPromise = null;
      });
    }
    await dbReadyPromise;
  };

  const seedData = () => ({
    users: [{
      id: uid('user'),
      clientId: null,
      role: 'admin',
      name: 'Sprintsales Admin',
      email: 'admin@sprintsales.net',
      passwordHash: hashPassword('ChangeMe123!'),
      createdAt: now()
    }],
    clients: [],
    knowledgeFiles: [],
    conversations: [],
    messages: [],
    leads: [],
    orders: [],
    stockMovements: [],
    reminders: [],
    bookings: [],
    paymentProofs: [],
    customers: [],
    customerNotes: [],
    products: [],
    productPosts: [],
    productRecommendations: [],
    productIntents: [],
    announcementCampaigns: [],
    campaignRecipients: [],
    shopperMessageLedger: [],
    unansweredQuestions: [],
    botErrors: [],
    botTests: [],
    billingPayments: [],
    clientNotices: [],
    registrationCodes: {},
    loginFailures: {},
    auditLogs: [],
    platformSettings: {
      adminAlertChatId: '',
      adminAlertsEnabled: false,
      subscriptionPlans: {
        basic: { name: 'Basic', amount: 0 },
        pro: { name: 'Pro', amount: 0 }
      },
      lastAlertAt: {}
    }
  });

  const inferBusinessType = (data, client) => {
    const saved = normalizeBusinessType(client?.settings?.businessProfile?.businessType);
    if (saved) return saved;
    const hasProducts = (data?.products || []).some(product => product.clientId === client?.id);
    return hasProducts ? 'retail' : 'service';
  };

  const ensureCollections = data => {
    data.products ||= [];
    data.orders ||= [];
    data.stockMovements ||= [];
    data.reminders ||= [];
    data.bookings ||= [];
    data.paymentProofs ||= [];
    data.customers ||= [];
    data.customerNotes ||= [];
    data.productPosts ||= [];
    data.productRecommendations ||= [];
    data.productIntents ||= [];
    data.announcementCampaigns ||= [];
    data.campaignRecipients ||= [];
    data.shopperMessageLedger ||= [];
    data.unansweredQuestions ||= [];
    data.botErrors ||= [];
    data.botTests ||= [];
    data.billingPayments ||= [];
    data.clientNotices ||= [];
    data.registrationCodes ||= {};
    data.loginFailures ||= {};
    data.auditLogs ||= [];
    data.platformSettings ||= { adminAlertChatId: '', adminAlertsEnabled: false, lastAlertAt: {} };
    data.platformSettings.lastAlertAt ||= {};
    data.platformSettings.aiGlobalKeys ||= {};
    data.platformSettings.verifiedTelegramOwners ||= {};
    data.platformSettings.subscriptionPlans = {
      basic: { name: 'Basic', amount: 0, ...(data.platformSettings.subscriptionPlans?.basic || {}) },
      pro: { name: 'Pro', amount: 0, ...(data.platformSettings.subscriptionPlans?.pro || {}) }
    };
    for (const client of data.clients || []) {
      const defaults = defaultSettings();
      client.settings = {
        ...defaults,
        ...(client.settings || {}),
        notificationPrefs: {
          ...defaults.notificationPrefs,
          ...(client.settings?.notificationPrefs || {})
        },
        businessProfile: {
          ...defaults.businessProfile,
          ...(client.settings?.businessProfile || {})
        },
        productPosting: {
          ...defaults.productPosting,
          ...(client.settings?.productPosting || {})
        },
        delivery: {
          ...defaults.delivery,
          ...(client.settings?.delivery || {})
        },
        discounts: {
          ...defaults.discounts,
          ...(client.settings?.discounts || {}),
          newBuyer: {
            ...defaults.discounts.newBuyer,
            ...(client.settings?.discounts?.newBuyer || {})
          },
          repeatBuyer: {
            ...defaults.discounts.repeatBuyer,
            ...(client.settings?.discounts?.repeatBuyer || {})
          },
          birthdayWeek: {
            ...defaults.discounts.birthdayWeek,
            ...(client.settings?.discounts?.birthdayWeek || {})
          },
          codes: Array.isArray(client.settings?.discounts?.codes) ? client.settings.discounts.codes : []
        }
      };
      client.settings.businessProfile.businessType = inferBusinessType(data, client);
      client.billing = {
        ...defaultBilling(),
        ...(client.billing || {})
      };
      client.identity = {
        clientId: client.id,
        createdAt: client.createdAt || now(),
        originalBusinessName: client.identity?.originalBusinessName || client.businessName || '',
        originalOwnerName: client.identity?.originalOwnerName || client.ownerName || '',
        originalPhone: client.identity?.originalPhone || client.phone || '',
        originalEmail: client.identity?.originalEmail || client.email || '',
        changeHistory: Array.isArray(client.identity?.changeHistory) ? client.identity.changeHistory : []
      };
      normalizeAiUsage(client.settings);
    }
    return data;
  };

  const readLocalData = async () => {
    try {
      return ensureCollections(JSON.parse(await fs.readFile(dataFile, 'utf8')));
    } catch {
      return null;
    }
  };

  const readData = async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.mkdir(productImageDir, { recursive: true });
    await fs.mkdir(telegramMediaDir, { recursive: true });
    if (dbPool) {
      await ensureDatabase();
      const result = await dbPool.query('select data from platform_state where id = $1', ['main']);
      if (result.rows[0]?.data) return ensureCollections(result.rows[0].data);
      const data = await readLocalData() || seedData();
      await writeData(data);
      return data;
    }
    try {
      return ensureCollections(JSON.parse(await fs.readFile(dataFile, 'utf8')));
    } catch {
      const data = seedData();
      await writeData(data);
      return data;
    }
  };

  const writeData = async data => {
    await fs.mkdir(dataDir, { recursive: true });
    const normalized = ensureCollections(data);
    if (dbPool) {
      await ensureDatabase();
      await dbPool.query(
        `insert into platform_state (id, data, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (id) do update set data = excluded.data, updated_at = now()`,
        ['main', JSON.stringify(normalized)]
      );
    }
    await fs.writeFile(dataFile, JSON.stringify(normalized, null, 2));
  };

  async function databaseStatus() {
    if (!dbPool) {
      const local = await fs.stat(dataFile).catch(() => null);
      return {
        enabled: false,
        provider: 'local-json',
        status: 'local',
        lastWriteAt: local?.mtime ? local.mtime.toISOString() : ''
      };
    }
    try {
      await ensureDatabase();
      const result = await dbPool.query('select updated_at from platform_state where id = $1', ['main']);
      return {
        enabled: true,
        provider: 'postgres',
        status: 'connected',
        lastWriteAt: result.rows[0]?.updated_at ? new Date(result.rows[0].updated_at).toISOString() : ''
      };
    } catch (error) {
      return {
        enabled: true,
        provider: 'postgres',
        status: 'error',
        error: error.message,
        lastWriteAt: ''
      };
    }
  }

  const clientFor = (data, clientId) => (data.clients || []).find(client => client.id === clientId);

  const auditActor = user => user ? {
    userId: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId || null
  } : {
    userId: 'system',
    email: 'system',
    role: 'system',
    clientId: null
  };

  const addAuditLog = (data, { user = null, action, clientId = null, target = '', details = '' }) => {
    ensureCollections(data);
    data.auditLogs.push({
      id: uid('audit'),
      at: now(),
      actor: auditActor(user),
      action,
      clientId,
      target: String(target || '').slice(0, 160),
      details: String(details || '').slice(0, 500)
    });
    data.auditLogs = data.auditLogs.slice(-1000);
  };

  const addBotError = (data, { clientId = null, businessName = '', type = 'system', message = '', severity = 'error' }) => {
    ensureCollections(data);
    data.botErrors.push({
      id: uid('err'),
      at: now(),
      clientId,
      businessName: String(businessName || '').slice(0, 120),
      type: String(type || 'system').slice(0, 80),
      severity: ['info', 'warn', 'error'].includes(severity) ? severity : 'error',
      message: String(message || '').slice(0, 700)
    });
    data.botErrors = data.botErrors.slice(-300);
  };

  const recordBotError = async (data, entry) => {
    const target = data ? ensureCollections(data) : await readData();
    addBotError(target, entry);
    await writeData(target);
  };

  const getPaths = () => ({
    dataDir,
    uploadDir,
    productImageDir,
    telegramMediaDir,
    dataFile,
    backupDir,
    jsonBackupDir,
    fullBackupDir,
    publicDir
  });

  return {
    readData,
    writeData,
    readLocalData,
    ensureCollections,
    ensureDatabase,
    databaseStatus,
    seedData,
    clientFor,
    addAuditLog,
    addBotError,
    recordBotError,
    getPaths
  };
}
