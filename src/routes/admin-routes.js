import { Router } from 'express';

export function createAdminRoutes(deps) {
  const {
    MB,
    Telegraf,
    addAuditLog,
    bookingNextAction,
    bookingStatusCustomerMessage,
    botDebugForClient,
    buildReply,
    businessMode,
    cleanupUploadedFiles,
    clientActivity,
    clientAnalytics,
    clientFor,
    clientHealthWarnings,
    clientQualityEvents,
    clientQualityScore,
    clientStorageStats,
    createProductPost,
    cloneRetailTemplateCategories,
    crypto,
    csvEscape,
    customerConversation,
    customerNoteRecord,
    customerRecords,
    customerTimeline,
    dataDir,
    defaultBilling,
    defaultSettings,
    describeProductImage,
    directorySize,
    effectiveAi,
    ensureCollections,
    execFileAsync,
    extractText,
    fetchWithTimeout,
    fs,
    generateProductCaption,
    getDefaultCategories,
    goLiveStatusForClient,
    hashPassword,
    isMissingKnowledgeReply,
    isProductBusiness,
    isServiceBusiness,
    loadGramJs,
    makeSession,
    missingTopic,
    normalizeAiUsage,
    normalizeBusinessType,
    normalizeProvider = provider => String(provider || 'deepseek').toLowerCase().trim(),
    notifyLowStock,
    now,
    orderGuardrails,
    orderNextAction,
    orderStatusCustomerMessage,
    os,
    parsePaymentSms,
    path,
    paymentMatchSummary,
    previewStatsForClient,
    productImageDir,
    productPostingSettings,
    productPrice,
    productUpload,
    publicDir,
    quotas,
    readData,
    readinessForClient,
    requireActiveClient,
    requireAuth,
    requireProductBusiness,
    safeClient,
    sendAdminAlert,
    sendPlatformAdminBotMessage,
    sendCustomerTelegramMessage,
    sendProductPost,
    serviceAllowsAutomation,
    startBot,
    stopBot,
    storage,
    storageReport,
    systemStatus,
    uid,
    upload,
    uploadDir,
    verifyPassword,
    writeData
  } = deps;
  const router = Router();

  const maskedConfigured = value => String(value || '').trim() ? 'configured' : '';

  const adminConfirmPassword = req => {
    const submitted = String(
      req.body?.adminPassword ??
      req.get?.('x-admin-confirm-password') ??
      ''
    );
    if (!submitted) return { ok: false, status: 400, error: 'Admin password confirmation is required for this action.' };
    const hash = req.user?.passwordHash || '';
    const matches = verifyPassword(submitted, hash) ||
      (submitted.trim() !== submitted && verifyPassword(submitted.trim(), hash));
    if (!matches) return { ok: false, status: 403, error: 'Admin password is incorrect.' };
    return { ok: true };
  };

  const stopClientAutomation = async client => {
    if (!client) return;
    client.settings ||= {};
    client.settings.isActive = false;
    await stopBot(client.id);
  };

  const startClientAutomationIfEnabled = client => {
    if (client?.settings?.isActive) {
      startBot(client).catch(error => console.error(`Bot start failed for ${client.businessName}:`, error.message));
    }
  };

  const defaultApprovalWelcomeMessage = [
    'Welcome to SprintSales, {ownerName}!',
    '',
    '{businessName} has been approved. Your dashboard and Telegram sales automation are now ready for setup.',
    '',
    'SprintSales helps you upload products, receive organized Telegram orders, collect payment proof, track delivery, answer shopper questions, and follow up with interested buyers.',
    '',
    'Next steps:',
    '1. Add or review your products.',
    '2. Connect your shop Telegram bot.',
    '3. Add payment and delivery settings.',
    '4. Test the shopper flow before going live.',
    '',
    'Login: {loginUrl}',
    '',
    'We are glad to have you with us.'
  ].join('\n');

  const firstNameOnly = value => String(value || '').trim().split(/\s+/).filter(Boolean)[0] || '';

  const approvalWelcomeMessage = (settings = {}, client = {}, owner = null) => {
    const template = String(settings.clientApprovalWelcomeMessage || '').trim() || defaultApprovalWelcomeMessage;
    const ownerDisplayName = firstNameOnly(owner?.name || client.ownerName || client.businessName) || 'there';
    const vars = {
      businessName: client.businessName || 'your business',
      ownerName: ownerDisplayName,
      plan: client.billing?.plan || client.subscriptionPlan || 'basic',
      loginUrl: settings.publicLoginUrl || process.env.PUBLIC_LOGIN_URL || 'https://automation.sprintsales.net/login'
    };
    return template.replace(/\{(businessName|ownerName|plan|loginUrl)\}/g, (_, key) => vars[key] || '');
  };

  const clientRetailType = client => String(
    client.settings?.businessProfile?.retailType ||
    client.settings?.businessProfile?.businessType ||
    client.businessType ||
    businessMode(client) ||
    'retail'
  ).trim() || 'retail';

  const setupStatusForClient = async (data, client) => {
    const settings = client.settings || {};
    const profile = settings.businessProfile || {};
    const products = (data.products || []).filter(product => product.clientId === client.id);
    const storageStats = await clientStorageStats(data, client).catch(() => ({}));
    const missing = [];
    if (!String(profile.address || settings.businessBranches?.[0]?.address || '').trim()) missing.push('business address');
    if (!String(profile.referenceKnowledge || '').trim()) missing.push('AI knowledge reference');
    if (!String(settings.botToken || settings.accountSessionString || '').trim()) missing.push('Telegram bot/account connection');
    if (!ownerSecurityChatId(client)) missing.push('owner Telegram chat ID');
    if (!Array.isArray(settings.paymentOptions) || !settings.paymentOptions.length) missing.push('payment options');
    if (!products.length) missing.push('products');
    return {
      missing,
      addressSaved: !missing.includes('business address'),
      knowledgeWords: String(profile.referenceKnowledge || '').trim().split(/\s+/).filter(Boolean).length,
      botConnected: !missing.includes('Telegram bot/account connection'),
      ownerChatConnected: !missing.includes('owner Telegram chat ID'),
      paymentOptions: Array.isArray(settings.paymentOptions) ? settings.paymentOptions.length : 0,
      products: products.length,
      imageMb: storageStats.productImageMb || storageStats.imagesMb || 0,
      totalStorageMb: storageStats.totalMb || 0
    };
  };

  const ownerSecurityChatId = client => [
    client?.settings?.sprintsalesAdminChatId,
    client?.settings?.telegramOwnerChatId,
    client?.settings?.ownerChatId,
    client?.settings?.hotLeadNotifyChatId
  ].map(value => String(value || '').trim()).find(value => /^\d{5,20}$/.test(value)) || '';

  const itemTime = item => new Date(item.createdAt || item.updatedAt || item.at || 0).getTime() || 0;
  const inWindow = (item, since) => !since || itemTime(item) >= since;
  const revenueForOrder = order => Number(order.total || order.totalAmount || order.grandTotal || order.amount || 0) || 0;
  const conversionRate = (orders, starts) => starts > 0 ? Math.round((orders / starts) * 1000) / 10 : 0;
  const analyticsIdentity = item => String(
    item.telegramUserId ||
    item.telegramChatId ||
    item.chatId ||
    item.conversationId ||
    item.username ||
    item.phone ||
    item.customerName ||
    item.id ||
    ''
  ).trim().toLowerCase();

  const uniqueFirstByIdentity = items => {
    const firstByIdentity = new Map();
    items.forEach(item => {
      const key = analyticsIdentity(item);
      if (!key) return;
      const existing = firstByIdentity.get(key);
      if (!existing || itemTime(item) < itemTime(existing)) firstByIdentity.set(key, item);
    });
    return Array.from(firstByIdentity.values());
  };

  const adminAnalyticsReport = data => {
    const nowMs = Date.now();
    const since7 = nowMs - 7 * 24 * 60 * 60 * 1000;
    const since30 = nowMs - 30 * 24 * 60 * 60 * 1000;
    const orders = data.orders || [];
    const messages = data.messages || [];
    const paymentProofs = data.paymentProofs || [];
    const conversations = data.conversations || [];
    const events = data.customerEvents || [];
    const clients = (data.clients || []).map(client => {
      const clientOrders = orders.filter(item => item.clientId === client.id);
      const delivered = clientOrders.filter(item => item.status === 'delivered');
      const clientMessages = messages.filter(item => item.clientId === client.id);
      const inbound = clientMessages.filter(item => item.direction === 'inbound');
      const starts = inbound.filter(item => /^\/start\b/i.test(String(item.text || '').trim()));
      const newShoppers = uniqueFirstByIdentity(starts);
      const clientProofs = paymentProofs.filter(item => item.clientId === client.id);
      const clientEvents = events.filter(item => item.clientId === client.id);
      const orderClicks = clientEvents.filter(item => item.type === 'productflow_callback' && item.action === 'order');
      const browseClicks = clientEvents.filter(item => item.type === 'productflow_callback' && item.action === 'explore');
      const searchClicks = clientEvents.filter(item => item.type === 'productflow_callback' && item.action === 'search');
      const supportClicks = clientEvents.filter(item => item.type === 'productflow_callback' && item.action === 'support');
      const trackClicks = clientEvents.filter(item => item.type === 'productflow_callback' && item.action === 'track_order');
      const revenue = delivered.reduce((sum, order) => sum + revenueForOrder(order), 0);
      const orders30d = clientOrders.filter(item => inWindow(item, since30)).length;
      const starts30d = newShoppers.filter(item => inWindow(item, since30)).length;
      return {
        id: client.id,
        businessName: client.businessName,
        status: client.status,
        billingStatus: client.billing?.status || 'trial',
        retailType: clientRetailType(client),
        businessTypeLabel: clientRetailType(client),
        ordersTotal: clientOrders.length,
        orders7d: clientOrders.filter(item => inWindow(item, since7)).length,
        orders30d,
        deliveredOrders: delivered.length,
        revenue,
        startsTotal: newShoppers.length,
        starts30d,
        rawStartsTotal: starts.length,
        rawStarts30d: starts.filter(item => inWindow(item, since30)).length,
        inboundMessages: inbound.length,
        conversations: conversations.filter(item => item.clientId === client.id).length,
        paymentProofs: clientProofs.length,
        paymentProofs30d: clientProofs.filter(item => inWindow(item, since30)).length,
        orderClicks: orderClicks.length,
        orderClicks30d: orderClicks.filter(item => inWindow(item, since30)).length,
        browseClicks: browseClicks.length,
        searchClicks: searchClicks.length,
        supportClicks: supportClicks.length,
        trackClicks: trackClicks.length,
        conversionRate30d: conversionRate(orders30d, starts30d),
        lastOrderAt: clientOrders.slice().sort((a, b) => itemTime(b) - itemTime(a))[0]?.createdAt || '',
        lastEngagementAt: [...inbound, ...clientEvents].sort((a, b) => itemTime(b) - itemTime(a))[0]?.createdAt || ''
      };
    });
    const emptyGroup = name => ({
      retailType: name,
      clients: 0,
      activeClients: 0,
      ordersTotal: 0,
      orders30d: 0,
      deliveredOrders: 0,
      revenue: 0,
      startsTotal: 0,
      starts30d: 0,
      paymentProofs: 0,
      orderClicks: 0,
      browseClicks: 0,
      conversionRate30d: 0
    });
    const groupsByType = {};
    clients.forEach(client => {
      const key = client.retailType || 'retail';
      groupsByType[key] ||= emptyGroup(key);
      const group = groupsByType[key];
      group.clients += 1;
      if (client.status === 'active') group.activeClients += 1;
      ['ordersTotal', 'orders30d', 'deliveredOrders', 'revenue', 'startsTotal', 'starts30d', 'paymentProofs', 'orderClicks', 'browseClicks'].forEach(field => {
        group[field] += Number(client[field] || 0);
      });
    });
    Object.values(groupsByType).forEach(group => {
      group.conversionRate30d = conversionRate(group.orders30d, group.starts30d);
    });
    const totals = emptyGroup('All retail');
    clients.forEach(client => {
      totals.clients += 1;
      if (client.status === 'active') totals.activeClients += 1;
      ['ordersTotal', 'orders30d', 'deliveredOrders', 'revenue', 'startsTotal', 'starts30d', 'paymentProofs', 'orderClicks', 'browseClicks'].forEach(field => {
        totals[field] += Number(client[field] || 0);
      });
    });
    totals.conversionRate30d = conversionRate(totals.orders30d, totals.starts30d);
    return {
      generatedAt: now(),
      notes: {
        orderClicks: events.length ? 'Order button clicks are tracked from this release forward.' : 'Order button clicks were not previously logged; historical values may be zero.',
        starts: 'New shoppers are unique Telegram conversations that sent /start. Repeat /start clicks from the same shopper are deduplicated.',
        browseClicks: 'Browse actions count every Browse Products press, including repeat engagement from the same shopper.'
      },
      totals,
      byRetailType: Object.values(groupsByType).sort((a, b) => b.orders30d - a.orders30d || b.revenue - a.revenue),
      clients: clients.sort((a, b) => b.orders30d - a.orders30d || b.revenue - a.revenue || b.starts30d - a.starts30d)
    };
  };

  router.get('/admin/clients', requireAuth('admin'), async (req, res) => {
    const clients = await Promise.all(req.data.clients.map(async client => ({
      ...safeClient(client),
      user: (() => {
        const user = req.data.users.find(item => item.clientId === client.id);
        return user ? { id: user.id, name: user.name, email: user.email, phone: user.phone || '', role: user.role, clientId: user.clientId } : null;
      })(),
      retailType: clientRetailType(client),
      businessTypeLabel: clientRetailType(client),
      setupStatus: await setupStatusForClient(req.data, client),
      readiness: readinessForClient(req.data, client),
      healthWarnings: clientHealthWarnings(req.data, client),
      quality: clientQualityScore(req.data, client),
      qualityEvents: clientQualityEvents(req.data, client),
      qualityReview: client.qualityReview || { status: 'none', note: '', updatedAt: '' },
      recentErrors: (req.data.botErrors || []).filter(error => error.clientId === client.id).slice(-5).reverse(),
      activity: clientActivity(req.data, client),
      botDebug: botDebugForClient(req.data, client),
      goLive: goLiveStatusForClient(req.data, client),
      previewStats: previewStatsForClient(req.data, client),
      analytics: clientAnalytics(req.data, client)
    })));
    res.json({
      platformSettings: {
        adminAlertChatId: req.data.platformSettings?.adminAlertChatId || '',
        adminAlertsEnabled: Boolean(req.data.platformSettings?.adminAlertsEnabled),
        adminBotToken: maskedConfigured(req.data.platformSettings?.adminBotToken),
        clientApprovalWelcomeMessage: req.data.platformSettings?.clientApprovalWelcomeMessage || defaultApprovalWelcomeMessage,
        publicLoginUrl: req.data.platformSettings?.publicLoginUrl || ''
      },
      clients
    });
  });

  router.get('/admin/analytics', requireAuth('admin'), (req, res) => {
    res.json(adminAnalyticsReport(req.data));
  });
  
  router.get('/admin/audit', requireAuth('admin'), (req, res) => {
    const clientsById = Object.fromEntries(req.data.clients.map(client => [client.id, client.businessName]));
    const logs = (req.data.auditLogs || []).slice(-250).reverse().map(log => ({
      ...log,
      clientName: log.clientId ? clientsById[log.clientId] || 'Deleted client' : ''
    }));
    res.json({ logs });
  });
  
  router.get('/admin/storage', requireAuth('admin'), async (req, res) => {
    res.json(await storageReport(req.data));
  });

  router.get('/admin/billing', requireAuth('admin'), async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const clients = (req.data.clients || []).map(client => ({
      id: client.id,
      businessName: client.businessName,
      status: client.status,
      retailType: clientRetailType(client),
      billing: { ...defaultBilling(), ...(client.billing || {}) },
      user: (() => {
        const user = req.data.users.find(item => item.clientId === client.id);
        return user ? { name: user.name, email: user.email, phone: user.phone || '' } : null;
      })()
    })).sort((a, b) => String(a.billing.renewalDate || '9999-99-99').localeCompare(String(b.billing.renewalDate || '9999-99-99')));
    const payments = (req.data.billingPayments || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const totalRecorded = payments.reduce((sum, item) => sum + (Number(item.amount || 0) || 0), 0);
    const dueToday = clients.filter(client => client.billing.renewalDate === today && client.billing.status !== 'suspended');
    res.json({
      today,
      subscriptionPlans: req.data.platformSettings?.subscriptionPlans || {
        basic: { name: 'Basic', amount: 0 },
        pro: { name: 'Pro', amount: 0 }
      },
      totals: {
        clients: clients.length,
        dueToday: dueToday.length,
        overdue: clients.filter(client => client.billing.renewalDate && client.billing.renewalDate < today && client.billing.status !== 'paid').length,
        paid: clients.filter(client => client.billing.status === 'paid').length,
        totalRecorded
      },
      dueToday,
      clients,
      payments: payments.slice(0, 200)
    });
  });

  router.put('/admin/billing/plans', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    const basicAmount = Math.max(0, Number(req.body.basicAmount || 0) || 0);
    const proAmount = Math.max(0, Number(req.body.proAmount || 0) || 0);
    req.data.platformSettings.subscriptionPlans = {
      basic: { name: 'Basic', amount: basicAmount },
      pro: { name: 'Pro', amount: proAmount }
    };
    addAuditLog(req.data, {
      user: req.user,
      action: 'billing.plans.updated',
      target: 'subscription plans',
      details: `Basic ${basicAmount}, Pro ${proAmount}.`
    });
    await writeData(req.data);
    res.json({ subscriptionPlans: req.data.platformSettings.subscriptionPlans });
  });

  router.get('/admin/notices', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    const clients = (req.data.clients || []).map(client => ({ id: client.id, businessName: client.businessName, status: client.status }));
    const notices = (req.data.clientNotices || []).slice().reverse().slice(0, 100);
    res.json({ clients, notices });
  });

  router.post('/admin/notices', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    const type = ['warning', 'notification', 'suggestion'].includes(req.body.type) ? req.body.type : 'notification';
    const title = String(req.body.title || '').trim().slice(0, 120);
    const message = String(req.body.message || '').trim().slice(0, 1000);
    const scope = req.body.scope === 'global' ? 'global' : 'selected';
    const clientIds = scope === 'global'
      ? []
      : (Array.isArray(req.body.clientIds) ? req.body.clientIds : [req.body.clientId]).map(String).filter(Boolean);
    if (!title || !message) return res.status(400).json({ error: 'Notice title and message are required.' });
    if (scope !== 'global' && !clientIds.length) return res.status(400).json({ error: 'Choose at least one client or send the notice globally.' });
    const notice = {
      id: uid('notice'),
      type,
      title,
      message,
      scope,
      global: scope === 'global',
      clientIds,
      active: true,
      dismissOnView: type !== 'warning',
      seenBy: [],
      createdAt: now(),
      createdBy: req.user?.email || req.user?.name || 'admin'
    };
    req.data.clientNotices.push(notice);
    addAuditLog(req.data, {
      user: req.user,
      action: 'admin.notice.sent',
      target: scope === 'global' ? 'all clients' : `${clientIds.length} client(s)`,
      details: `${type}: ${title}`
    });
    await writeData(req.data);
    res.json({ ok: true, notice });
  });

  router.get('/admin/settings', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    res.json({
      platformSettings: {
        adminAlertChatId: req.data.platformSettings?.adminAlertChatId || '',
        adminAlertsEnabled: Boolean(req.data.platformSettings?.adminAlertsEnabled),
        adminBotToken: maskedConfigured(req.data.platformSettings?.adminBotToken),
        clientApprovalWelcomeMessage: req.data.platformSettings?.clientApprovalWelcomeMessage || defaultApprovalWelcomeMessage,
        publicLoginUrl: req.data.platformSettings?.publicLoginUrl || ''
      }
    });
  });
  
  router.put('/admin/settings', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    req.data.platformSettings ||= {};
    req.data.platformSettings.adminAlertChatId = String(req.body.adminAlertChatId || '');
    req.data.platformSettings.adminAlertsEnabled = Boolean(req.body.adminAlertsEnabled);
    if (Object.prototype.hasOwnProperty.call(req.body, 'clientApprovalWelcomeMessage')) {
      req.data.platformSettings.clientApprovalWelcomeMessage = String(req.body.clientApprovalWelcomeMessage || '').trim().slice(0, 2500);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'publicLoginUrl')) {
      req.data.platformSettings.publicLoginUrl = String(req.body.publicLoginUrl || '').trim().slice(0, 200);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'adminBotToken')) {
      const token = String(req.body.adminBotToken || '').trim();
      if (token && token !== 'configured') req.data.platformSettings.adminBotToken = token;
    }
    req.data.platformSettings.lastAlertAt ||= {};
    addAuditLog(req.data, {
      user: req.user,
      action: 'admin.alerts.updated',
      details: `Telegram alerts ${req.data.platformSettings.adminAlertsEnabled ? 'enabled' : 'disabled'}. Admin bot ${req.data.platformSettings.adminBotToken ? 'configured' : 'not configured'}.`
    });
    await writeData(req.data);
    res.json({
      platformSettings: {
        adminAlertChatId: req.data.platformSettings.adminAlertChatId,
        adminAlertsEnabled: req.data.platformSettings.adminAlertsEnabled,
        adminBotToken: maskedConfigured(req.data.platformSettings.adminBotToken),
        clientApprovalWelcomeMessage: req.data.platformSettings.clientApprovalWelcomeMessage || defaultApprovalWelcomeMessage,
        publicLoginUrl: req.data.platformSettings.publicLoginUrl || ''
      }
    });
  });
  
  router.post('/admin/settings/test-alert', requireAuth('admin'), async (req, res) => {
    ensureCollections(req.data);
    if (!req.data.platformSettings.adminAlertsEnabled) {
      return res.status(400).json({ message: 'Turn on Telegram monitoring alerts first.' });
    }
    if (!req.data.platformSettings.adminAlertChatId) {
      return res.status(400).json({ message: 'Add your Telegram chat ID first.' });
    }
    if (!req.data.platformSettings.adminBotToken) {
      return res.status(400).json({ message: 'Add the SprintSales Admin bot token first.' });
    }
    const sent = await sendAdminAlert(req.data, 'test-alert', 'Test alert: monitoring is connected.', 0);
    if (!sent) {
      return res.status(400).json({ message: 'Telegram did not deliver the alert. Make sure this Telegram account has started the SprintSales Admin bot.' });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'admin.alerts.tested',
      details: 'Admin sent a Telegram monitoring test alert.'
    });
    await writeData(req.data);
    res.json({ ok: true, sent: true });
  });
  
  router.get('/admin/backup', requireAuth('admin'), async (req, res) => {
    const data = await readData();
    res.setHeader('content-type', 'application/json');
    res.setHeader('content-disposition', `attachment; filename="sprintsales-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify({
      exportedAt: now(),
      note: 'Includes dashboard records and file paths. Uploaded binary files stay on the VM data folder.',
      data
    }, null, 2));
  });
  
  router.get('/admin/backup/full', requireAuth('admin'), async (req, res) => {
    const check = adminConfirmPassword(req);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const filename = `sprintsales-full-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
    const target = path.join(os.tmpdir(), `${filename}-${crypto.randomBytes(4).toString('hex')}`);
    await execFileAsync('tar', ['-czf', target, '-C', dataDir, '.']);
    res.download(target, filename, error => {
      fs.unlink(target).catch(() => null);
      if (error) console.error('Full backup download failed:', error.message);
    });
  });
  
  router.post('/admin/clients', requireAuth('admin'), async (req, res) => {
    const data = req.data;
    if (data.clients.length >= 10) return res.status(400).json({ error: 'This VM plan is limited to 10 client bots.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !req.body.password || !req.body.businessName) return res.status(400).json({ error: 'Business name, email, and password are required.' });
    if (data.users.some(user => user.email.toLowerCase() === email)) return res.status(409).json({ error: 'That email already exists.' });
    const businessType = normalizeBusinessType(req.body.businessType) || 'retail';
    const categoryTemplates = cloneRetailTemplateCategories(req.body.retailType || req.body.businessType || businessType);
    const plan = ['basic', 'pro'].includes(String(req.body.plan || req.body.subscriptionPlan || '').toLowerCase())
      ? String(req.body.plan || req.body.subscriptionPlan).toLowerCase()
      : 'basic';
    const client = {
      id: uid('client'),
      businessName: String(req.body.businessName).trim(),
      status: 'active',
      billing: { ...defaultBilling(), plan },
      settings: {
        ...defaultSettings(),
        botToken: String(req.body.botToken || ''),
        businessProfile: {
          ...defaultSettings().businessProfile,
          businessType,
          retailType: String(req.body.retailType || req.body.businessType || '').trim()
        },
        categories: categoryTemplates.map(category => category.name),
        categoryTemplates
      },
      createdAt: now()
    };
    const user = {
      id: uid('user'),
      clientId: client.id,
      role: 'client',
      name: client.businessName,
      email,
      passwordHash: hashPassword(String(req.body.password)),
      createdAt: now()
    };
    data.clients.push(client);
    data.users.push(user);
    addAuditLog(data, {
      user: req.user,
      action: 'client.created',
      clientId: client.id,
      target: client.businessName,
      details: `Created client dashboard for ${email}.`
    });
    await writeData(data);
    startBot(client).catch(error => console.error(`Bot start failed for ${client.businessName}:`, error.message));
    res.json({ client: safeClient(client) });
  });
  
  router.patch('/admin/clients/:id', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const nextStatus = ['active', 'paused', 'pending', 'suspended', 'rejected'].includes(req.body.status) ? req.body.status : 'active';
    if (['paused', 'pending', 'suspended', 'rejected'].includes(nextStatus) && nextStatus !== client.status) {
      const check = adminConfirmPassword(req);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
    }
    client.status = nextStatus;
    if (client.status !== 'active') {
      await stopClientAutomation(client);
    } else {
      startClientAutomationIfEnabled(client);
    }
    addAuditLog(req.data, {
      user: req.user,
      action: client.status === 'pending' ? 'client.pending' : ['paused', 'suspended'].includes(client.status) ? 'client.paused' : client.status === 'rejected' ? 'client.rejected' : 'client.approved',
      clientId: client.id,
      target: client.businessName,
      details: `Admin set client status to ${client.status}.`
    });
    await writeData(req.data);
    res.json({ client: safeClient(client) });
  });

  router.patch('/admin/clients/:id/quality-review', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const status = ['cleared', 'watch', 'under_review', 'restricted_candidate'].includes(req.body.status)
      ? req.body.status
      : 'watch';
    if (status === 'restricted_candidate') {
      const check = adminConfirmPassword(req);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
    }
    client.qualityReview = {
      status,
      note: String(req.body.note || '').slice(0, 500),
      reviewedBy: req.user?.email || req.user?.name || 'admin',
      updatedAt: now()
    };
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.quality-review.updated',
      clientId: client.id,
      target: client.businessName,
      details: `Admin marked client quality status as ${status}${client.qualityReview.note ? `: ${client.qualityReview.note}` : ''}.`
    });
    await writeData(req.data);
    res.json({
      ok: true,
      qualityReview: client.qualityReview,
      client: {
        ...safeClient(client),
        qualityReview: client.qualityReview,
        quality: clientQualityScore(req.data, client),
        qualityEvents: clientQualityEvents(req.data, client)
      }
    });
  });
  
  router.put('/admin/clients/:id/ai-key', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const provider = normalizeProvider(req.body.adminAiProvider || client.settings.adminAiProvider || 'deepseek');
    const globalKeys = req.data.platformSettings?.aiGlobalKeys || {};
    const globalProvider = normalizeProvider(globalKeys.provider || globalKeys.aiProvider || provider);
    const globalKey = globalProvider === provider ? String(globalKeys.apiKey || globalKeys.aiApiKey || globalKeys[provider] || '') : '';
    client.settings.adminAiProvider = provider;
    client.settings.aiMonthlyReplyLimit = Math.min(100000, Math.max(0, Number(req.body.aiMonthlyReplyLimit || client.settings.aiMonthlyReplyLimit || 1000)));
    if (req.body.adminAiApiKey !== undefined && req.body.adminAiApiKey !== 'configured' && req.body.adminAiApiKey !== '') {
      client.settings.adminAiApiKey = String(req.body.adminAiApiKey || '');
    } else if (req.body.aiKeyMode === 'admin' && !client.settings.adminAiApiKey && globalKey) {
      client.settings.adminAiApiKey = globalKey;
    }
    normalizeAiUsage(client.settings);
    client.settings.aiKeyMode = req.body.aiKeyMode === 'admin' && client.settings.adminAiApiKey ? 'admin' : 'client';
    if (req.body.aiKeyMode === 'admin' && !client.settings.adminAiApiKey) {
      return res.status(400).json({ error: 'No admin AI key is available. Save a Global AI Provider key first, or enter a per-client admin key here.' });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.ai-key.updated',
      clientId: client.id,
      target: client.businessName,
      details: `Admin updated AI provider keys. Mode: ${client.settings.aiKeyMode}. Provider: ${provider}.`
    });
    await writeData(req.data);
    res.json({ client: safeClient(client) });
  });
  
  router.get('/admin/ai-providers', requireAuth('admin'), async (req, res) => {
    const globalKeys = req.data.platformSettings?.aiGlobalKeys || {};
    const legacyGlobalKeyConfigured = ['deepseek', 'gemini', 'openai', 'grok', 'anthropic'].some(provider => Boolean(globalKeys[provider]));
    const apiKeyConfigured = Boolean(globalKeys.apiKey || globalKeys.aiApiKey || legacyGlobalKeyConfigured);
    res.json({
      provider: normalizeProvider(globalKeys.provider || globalKeys.aiProvider || 'deepseek'),
      apiKey: apiKeyConfigured ? 'configured' : '',
      globalKeys: {
        provider: normalizeProvider(globalKeys.provider || globalKeys.aiProvider || 'deepseek'),
        apiKey: apiKeyConfigured ? 'configured' : ''
      }
    });
  });
  
  router.put('/admin/ai-providers', requireAuth('admin'), async (req, res) => {
    req.data.platformSettings ||= {};
    const existing = req.data.platformSettings.aiGlobalKeys || {};
    const provider = normalizeProvider(req.body.provider || req.body.aiProvider || existing.provider || existing.aiProvider || 'deepseek');
    const submittedKey = req.body.apiKey ?? req.body.aiApiKey;
    const existingKey = String(existing.apiKey || existing.aiApiKey || existing[provider] || '');
    const next = {
      provider,
      apiKey: (submittedKey === undefined || submittedKey === '' || submittedKey === 'configured')
        ? existingKey
        : String(submittedKey || '')
    };
    req.data.platformSettings.aiGlobalKeys = next;
    if (next.apiKey) {
      (req.data.clients || []).forEach(client => {
        client.settings ||= {};
        if (client.settings.aiKeyMode === 'admin' && !client.settings.adminAiApiKey) {
          client.settings.adminAiProvider = provider;
          client.settings.adminAiApiKey = next.apiKey;
        }
      });
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'ai-providers.global_updated',
      clientId: null,
      target: 'global',
      details: `Admin updated global AI provider key. Provider: ${provider}.`
    });
    await writeData(req.data);
    res.json({
      provider: next.provider,
      apiKey: next.apiKey ? 'configured' : '',
      globalKeys: { provider: next.provider, apiKey: next.apiKey ? 'configured' : '' }
    });
  });
  
  router.put('/admin/clients/:id/subscription', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const allowedStatuses = ['trial', 'paid', 'due', 'suspended'];
    const nextBillingStatus = allowedStatuses.includes(req.body.billingStatus) ? req.body.billingStatus : 'trial';
    if (nextBillingStatus === 'suspended' && client.billing?.status !== 'suspended') {
      const check = adminConfirmPassword(req);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
    }
    client.billing = {
      ...defaultBilling(),
      ...(client.billing || {}),
      status: nextBillingStatus,
      renewalDate: String(req.body.renewalDate || ''),
      adminFollowUpDate: String(req.body.adminFollowUpDate || ''),
      plan: ['basic', 'pro'].includes(String(req.body.plan || '').toLowerCase()) ? String(req.body.plan).toLowerCase() : (client.billing?.plan || 'basic'),
      amount: Math.max(0, Number(req.body.amount ?? client.billing?.amount ?? 0) || 0),
      note: String(req.body.billingNote || '').slice(0, 500)
    };
    const paymentAmount = Math.max(0, Number(req.body.paymentAmount || 0) || 0);
    const paymentDate = String(req.body.paymentDate || '').slice(0, 10);
    if (paymentAmount > 0 || paymentDate) {
      req.data.billingPayments ||= [];
      const payment = {
        id: uid('billing_payment'),
        clientId: client.id,
        businessName: client.businessName,
        amount: paymentAmount,
        paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
        billingStatus: client.billing.status,
        note: client.billing.note,
        createdAt: now(),
        recordedBy: req.user?.email || req.user?.name || 'admin'
      };
      req.data.billingPayments.push(payment);
      client.billing.lastPaymentAmount = payment.amount;
      client.billing.lastPaymentDate = payment.paymentDate;
    }
    if (client.billing.status === 'suspended') {
      await stopClientAutomation(client);
    } else {
      startClientAutomationIfEnabled(client);
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.subscription.updated',
      clientId: client.id,
      target: client.businessName,
      details: `Subscription set to ${client.billing.status}${client.billing.renewalDate ? `, renewal ${client.billing.renewalDate}` : ''}.`
    });
    await writeData(req.data);
    res.json({ client: safeClient(client) });
  });
  
  router.post('/admin/clients/:id/password', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const check = adminConfirmPassword(req);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    const user = req.data.users.find(item => item.clientId === client.id);
    if (!user) return res.status(404).json({ error: 'Client user not found' });
    const password = String(req.body.password || '');
    if (password.length < 5) return res.status(400).json({ error: 'Password must be at least 5 characters.' });
    user.passwordHash = hashPassword(password);
    user.passwordChangedAt = now();
    user.passwordResetByAdminAt = now();
    user.mustChangePassword = true;
    user.passwordChangeRequired = true;
    user.forcePasswordChange = true;
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.password.reset',
      clientId: client.id,
      target: client.businessName,
      details: `Admin reset password for ${user.email}.`
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  router.delete('/admin/clients/:id', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const check = adminConfirmPassword(req);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    await stopBot(client.id);
    req.data.clients = req.data.clients.filter(item => item.id !== client.id);
    req.data.users = req.data.users.filter(user => user.clientId !== client.id);
    req.data.knowledgeFiles = req.data.knowledgeFiles.filter(file => file.clientId !== client.id);
    req.data.products = (req.data.products || []).filter(product => product.clientId !== client.id);
    req.data.orders = (req.data.orders || []).filter(order => order.clientId !== client.id);
    req.data.stockMovements = (req.data.stockMovements || []).filter(movement => movement.clientId !== client.id);
    req.data.reminders = (req.data.reminders || []).filter(reminder => reminder.clientId !== client.id);
    req.data.bookings = (req.data.bookings || []).filter(booking => booking.clientId !== client.id);
    req.data.paymentProofs = (req.data.paymentProofs || []).filter(proof => proof.clientId !== client.id);
    req.data.productPosts = (req.data.productPosts || []).filter(post => post.clientId !== client.id);
    req.data.unansweredQuestions = (req.data.unansweredQuestions || []).filter(question => question.clientId !== client.id);
    req.data.conversations = req.data.conversations.filter(conversation => conversation.clientId !== client.id);
    req.data.messages = req.data.messages.filter(message => message.clientId !== client.id);
    req.data.leads = req.data.leads.filter(lead => lead.clientId !== client.id);
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.deleted',
      clientId: client.id,
      target: client.businessName,
      details: 'Admin deleted the client and associated dashboard data.'
    });
    await writeData(req.data);
    res.json({ ok: true });
  });
  
  // ═══════════════════════════════════════════════
  // Admin: Approval Workflow
  // ═══════════════════════════════════════════════
  
  // Feature-gating: check if client can perform active/destructive actions
  // List pending approval requests
  router.get('/admin/pending-approvals', requireAuth('admin'), async (req, res) => {
    const pending = (req.data.clients || [])
      .filter(c => c.status === 'pending')
      .map(c => {
        const owner = (req.data.users || []).find(u => u.clientId === c.id);
        return {
          id: c.id,
          businessName: c.businessName,
          businessType: clientRetailType(c),
          ownerName: owner?.name || '',
          phone: owner?.phone || '',
          email: owner?.email || '',
          createdAt: c.createdAt,
          status: c.status
        };
      });
    res.json({ pending });
  });
  
  // Approve a client
  router.patch('/admin/clients/:clientId/approve', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.status !== 'pending') return res.status(400).json({ error: `Cannot approve a client with status "${client.status}"` });
    client.status = 'active';
    client.approvedAt = now();
    startClientAutomationIfEnabled(client);
    const owner = (req.data.users || []).find(user => user.clientId === client.id && user.role === 'client') ||
      (req.data.users || []).find(user => user.clientId === client.id);
    let welcomeSent = false;
    let welcomeError = '';
    const targetChatId = ownerSecurityChatId(client);
    if (targetChatId) {
      try {
        await sendPlatformAdminBotMessage(
          req.data,
          targetChatId,
          approvalWelcomeMessage(req.data.platformSettings || {}, client, owner)
        );
        welcomeSent = true;
      } catch (error) {
        welcomeError = error.message;
      }
    } else {
      welcomeError = 'No owner Telegram chat ID is connected for this client.';
    }
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.approved',
      clientId: client.id,
      target: client.businessName,
      details: `Admin approved ${client.businessName}. Approval welcome ${welcomeSent ? 'sent' : `not sent: ${welcomeError}`}.`
    });
    await writeData(req.data);
    res.json({ ok: true, status: 'active', welcomeSent, welcomeError });
  });
  
  // Reject a client
  router.patch('/admin/clients/:clientId/reject', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.status !== 'pending') return res.status(400).json({ error: `Cannot reject a client with status "${client.status}"` });
    const check = adminConfirmPassword(req);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    client.status = 'rejected';
    client.rejectedAt = now();
    await stopClientAutomation(client);
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.rejected',
      clientId: client.id,
      target: client.businessName,
      details: `Admin rejected ${client.businessName}.`
    });
    await writeData(req.data);
    res.json({ ok: true, status: 'rejected' });
  });
  
  // Suspend a client (admin action on active clients)
  router.patch('/admin/clients/:clientId/suspend', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.status === 'pending') return res.status(400).json({ error: 'Cannot suspend a pending client. Approve or reject first.' });
    const check = adminConfirmPassword(req);
    if (!check.ok) return res.status(check.status).json({ error: check.error });
    client.status = 'suspended';
    client.suspendedAt = now();
    await stopClientAutomation(client);
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.suspended',
      clientId: client.id,
      target: client.businessName,
      details: `Admin suspended ${client.businessName}.`
    });
    await writeData(req.data);
    res.json({ ok: true, status: 'suspended' });
  });
  
  // Reactivate a suspended/rejected client
  router.patch('/admin/clients/:clientId/reactivate', requireAuth('admin'), async (req, res) => {
    const client = clientFor(req.data, req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!['suspended', 'rejected'].includes(client.status)) {
      return res.status(400).json({ error: `Client status is "${client.status}". Only suspended or rejected clients can be reactivated.` });
    }
    client.status = 'active';
    client.reactivatedAt = now();
    startClientAutomationIfEnabled(client);
    addAuditLog(req.data, {
      user: req.user,
      action: 'client.reactivated',
      clientId: client.id,
      target: client.businessName,
      details: `Admin reactivated ${client.businessName}.`
    });
    await writeData(req.data);
    res.json({ ok: true, status: 'active' });
  });
  
  
  return router;
}
