export const createMetricsService = (deps = {}) => {
  const {
    path,
    uploadDir,
    productImageDir,
    backupDir,
    dataDir,
    dataFile,
    jsonBackupDir,
    fullBackupDir,
    quotas,
    directorySize,
    countFiles,
    latestFile,
    mb,
    pct,
    daysAgoIso = days => new Date(Date.now() - Number(days || 0) * 24 * 60 * 60 * 1000).toISOString(),
    now,
    databaseStatus,
    botRunners,
    accountRunners,
    effectiveAi,
    aiUsageStatus = settings => {
      const limit = Number(settings?.aiMonthlyReplyLimit || 0);
      const used = Number(settings?.aiRepliesThisMonth || 0);
      return {
        month: settings?.aiUsageMonth || '',
        used,
        limit,
        remaining: limit > 0 ? Math.max(0, limit - used) : null,
        percent: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
        limitReached: limit > 0 && used >= limit
      };
    },
    orderRevenue,
    orderCost,
    isProductBusiness,
    isServiceBusiness
  } = deps;

const clientStorageStats = async (data, client) => {
  const uploadPath = path.join(uploadDir, client.id);
  const productPath = path.join(productImageDir, client.id);
  const knowledgeFiles = (data.knowledgeFiles || []).filter(file => file.clientId === client.id);
  const products = (data.products || []).filter(product => product.clientId === client.id);
  const uploadBytes = await directorySize(uploadPath);
  const productImageBytes = await directorySize(productPath);
  return {
    clientId: client.id,
    businessName: client.businessName,
    status: client.status,
    isActive: Boolean(client.settings?.isActive),
    uploadMb: mb(uploadBytes),
    productImageMb: mb(productImageBytes),
    totalMb: mb(uploadBytes + productImageBytes),
    knowledgeFiles: knowledgeFiles.length,
    products: products.length,
    productImages: products.filter(product => product.imagePath).length,
    quotas: {
      knowledgeFilesPct: pct(knowledgeFiles.length, quotas.maxKnowledgeFilesPerClient),
      uploadStoragePct: pct(mb(uploadBytes), quotas.maxKnowledgeStorageMbPerClient),
      productsPct: pct(products.length, quotas.maxProductsPerClient),
      productImageStoragePct: pct(mb(productImageBytes), quotas.maxProductImageStorageMbPerClient)
    }
  };
};

const storageReport = async data => {
  const uploadBytes = await directorySize(uploadDir);
  const productImageBytes = await directorySize(productImageDir);
  const backupBytes = await directorySize(backupDir);
  const dataBytes = await directorySize(dataDir);
  const platformBytes = await directorySize(dataFile);
  const clientUsage = await Promise.all(data.clients.map(client => clientStorageStats(data, client)));
  return {
    generatedAt: now(),
    quotas,
    vmStorageLimitGb: 30,
    warningAtGb: 24,
    criticalAtGb: 27,
    totals: {
      appDataMb: mb(dataBytes),
      platformJsonMb: mb(platformBytes),
      uploadsMb: mb(uploadBytes),
      productImagesMb: mb(productImageBytes),
      backupsMb: mb(backupBytes),
      trackedTotalMb: mb(dataBytes + backupBytes)
    },
    counts: {
      clients: data.clients.length,
      knowledgeFiles: (data.knowledgeFiles || []).length,
      products: (data.products || []).length,
      productImages: (data.products || []).filter(product => product.imagePath).length,
      backups: {
        json: await countFiles(jsonBackupDir),
        full: await countFiles(fullBackupDir)
      }
    },
    clients: clientUsage.sort((a, b) => b.totalMb - a.totalMb)
  };
};

const systemStatus = async data => ({
  ok: true,
  service: 'sprintsales-telegram-automation',
  activeBots: botRunners.size,
  accountAutomation: {
    status: 'enabled',
    dependency: 'GramJS/telegram',
    activeAccounts: accountRunners.size
  },
  clients: data.clients.length,
  capacity: Math.max(0, 10 - data.clients.length),
  knowledgeFiles: data.knowledgeFiles.length,
  products: (data.products || []).length,
  openLeads: data.leads.filter(lead => !['archived', 'won', 'lost'].includes(lead.status)).length,
  openUnanswered: (data.unansweredQuestions || []).filter(item => item.status !== 'resolved').length,
  botErrors: (data.botErrors || []).slice(-80).reverse(),
  recentErrors: (data.botErrors || []).slice(-8).reverse(),
  storageMb: Math.round(((await directorySize(dataDir)) / 1024 / 1024) * 10) / 10,
  backupStorageMb: Math.round(((await directorySize(backupDir)) / 1024 / 1024) * 10) / 10,
  database: await databaseStatus(),
  backups: {
    latestJson: await latestFile(jsonBackupDir, name => name.startsWith('platform-')),
    latestFull: await latestFile(fullBackupDir)
  },
  alerts: {
    enabled: Boolean(data.platformSettings?.adminAlertsEnabled),
    configured: Boolean(data.platformSettings?.adminAlertChatId),
    recentKeys: Object.keys(data.platformSettings?.lastAlertAt || {}).slice(-8)
  },
  time: now()
});

const serviceAllowsAutomation = client => client?.status === 'active' && client?.billing?.status !== 'suspended';

const automationBlockReason = client => {
  const settings = client?.settings || {};
  const ai = effectiveAi(settings);
  if (!client) return 'Client record not found.';
  if (client.status === 'pending') return 'Waiting for Sprintsales admin approval.';
  if (client.status === 'paused') return 'Client is paused by admin.';
  if (client.billing?.status === 'suspended') return 'Service is suspended because billing is suspended.';
  if (!settings.isActive) return '24/7 automation is turned off in Settings.';
  if ((settings.automationType || 'bot') === 'account') {
    if (settings.accountSessionStatus !== 'connected' || !settings.accountSessionString) return 'Dedicated account mode needs a connected Telegram session.';
  } else if (!settings.botToken || settings.botToken === 'configured') return 'Telegram bot token needs to be saved on this server.';
  if (!ai.apiKey) return 'AI API key is missing. Add a client key or ask admin to provide a managed key.';
  return '';
};

const botDebugReason = (data, client, runnerActive, blockReason) => {
  const recentError = (data.botErrors || [])
    .filter(error => error.clientId === client.id)
    .slice(-1)[0] || null;
  if (blockReason) return { code: 'setup-blocked', label: blockReason, level: 'warn' };
  if (recentError?.message?.includes('409: Conflict')) return { code: 'telegram-conflict', label: 'Telegram says another process is using this bot token.', level: 'bad' };
  if (recentError?.type?.includes('ai') || /api|model|key|quota|timeout/i.test(recentError?.message || '')) return { code: 'ai-error', label: recentError.message, level: recentError.severity || 'bad' };
  if (!runnerActive) return { code: 'bot-not-running', label: 'The bot process is not running. Save Settings or ask admin to restart the service.', level: 'warn' };
  const activity = clientActivity(data, client);
  if (activity.lastInboundAt && (!activity.lastOutboundAt || new Date(activity.lastInboundAt) > new Date(activity.lastOutboundAt))) {
    return { code: 'customer-waiting', label: 'A customer message arrived after the last bot reply.', level: 'warn' };
  }
  return { code: 'ready', label: 'Automation can reply now.', level: 'good' };
};

const goLiveStatusForClient = (data, client) => {
  const readiness = readinessForClient(data, client);
  const blockReason = automationBlockReason(client);
  const blockers = readiness.items
    .filter(item => !item.done && ['bot-token', 'ai-key', 'business-profile', 'knowledge-source'].includes(item.key))
    .map(item => item.label);
  if (client.status === 'pending') blockers.unshift('Sprintsales admin approval');
  if (blockReason && !blockers.includes(blockReason)) blockers.unshift(blockReason);
  const canGoLive = !blockReason && readiness.score >= 70;
  return {
    canGoLive,
    label: canGoLive ? 'Can go live' : client.status === 'pending' ? 'Waiting for approval' : 'Cannot go live yet',
    blockers: [...new Set(blockers)].slice(0, 8),
    recommendation: canGoLive
      ? 'Automation is allowed. Send preview test questions before sending real traffic.'
      : client.status === 'pending'
        ? 'Finish setup now, then request Sprintsales approval.'
        : 'Finish the blockers below, save settings, and test the bot again.'
  };
};

const clientActivity = (data, client) => {
  const conversations = (data.conversations || []).filter(item => item.clientId === client.id);
  const messages = (data.messages || []).filter(item => item.clientId === client.id);
  const leads = (data.leads || []).filter(item => item.clientId === client.id && item.status !== 'archived');
  const unanswered = (data.unansweredQuestions || []).filter(item => item.clientId === client.id && item.status !== 'resolved');
  const lastInbound = messages.filter(item => item.direction === 'inbound').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  const lastOutbound = messages.filter(item => item.direction === 'outbound').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  const lastMessage = messages.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
  const activeAndAllowed = serviceAllowsAutomation(client) && Boolean(client.settings?.isActive);
  let status = 'quiet';
  if (client.billing?.status === 'suspended') status = 'suspended';
  else if (client.status === 'paused' || !client.settings?.isActive) status = 'paused';
  else if (lastInbound && (!lastOutbound || new Date(lastInbound.createdAt) > new Date(lastOutbound.createdAt))) status = 'needs-attention';
  else if (activeAndAllowed && lastOutbound) status = 'replying';
  else if (activeAndAllowed) status = 'waiting';
  return {
    status,
    conversations: conversations.length,
    openLeads: leads.length,
    openUnanswered: unanswered.length,
    lastInboundAt: lastInbound?.createdAt || '',
    lastOutboundAt: lastOutbound?.createdAt || '',
    lastMessageAt: lastMessage?.createdAt || '',
    lastCustomerText: lastInbound?.text ? String(lastInbound.text).slice(0, 140) : '',
    lastAssistantText: lastOutbound?.text ? String(lastOutbound.text).slice(0, 140) : ''
  };
};

const botDebugForClient = (data, client) => {
  const activity = clientActivity(data, client);
  const recentErrors = (data.botErrors || [])
    .filter(error => error.clientId === client.id)
    .slice(-8)
    .reverse();
  const runnerActive = botRunners.has(client.id) || accountRunners.has(client.id);
  const blockReason = automationBlockReason(client);
  const reason = botDebugReason(data, client, runnerActive, blockReason);
  return {
    runnerActive,
    canRun: !blockReason && runnerActive,
    blockReason: reason.label,
    reason,
    activity,
    recentErrors,
    lastCheckedAt: now()
  };
};

const previewStatsForClient = (data, client) => {
  const orders = (data.orders || []).filter(order => order.clientId === client.id);
  const proofs = (data.paymentProofs || []).filter(proof => proof.clientId === client.id);
  const unanswered = (data.unansweredQuestions || []).filter(question => question.clientId === client.id && question.status !== 'resolved');
  const leads = (data.leads || []).filter(lead => lead.clientId === client.id && !['archived', 'lost'].includes(lead.status || ''));
  return {
    openOrders: orders.filter(order => !['delivered', 'cancelled'].includes(order.status || 'draft')).length,
    paymentProofsNeedingReview: proofs.filter(proof => proof.status === 'pending' || proof.match?.status !== 'likely_matched').length,
    unansweredOpen: unanswered.length,
    openLeads: leads.length
  };
};

const customerRecords = (data, client) => {
  const map = new Map();
  const keyFor = item => item.telegramUserId || item.telegramChatId || item.phone || item.username || item.conversationId || item.id;
  const touch = item => {
    const key = keyFor(item);
    if (!key) return null;
    const customer = map.get(key) || {
      id: key,
      name: '',
      username: '',
      phone: '',
      telegramUserId: '',
      telegramChatId: '',
      orders: 0,
      paidOrders: 0,
      leads: 0,
      leadStatus: '',
      leadPriority: '',
      leadScore: 0,
      totalSpent: 0,
      lastMessage: '',
      lastSeenAt: '',
      address: ''
    };
    customer.name ||= item.customerName || item.name || '';
    customer.username ||= item.username || '';
    customer.phone ||= item.phone || '';
    customer.telegramUserId ||= item.telegramUserId || '';
    customer.telegramChatId ||= item.telegramChatId || '';
    if (item.lastMessage) customer.lastMessage = item.lastMessage;
    const seen = item.updatedAt || item.createdAt || '';
    if (seen && (!customer.lastSeenAt || new Date(seen) > new Date(customer.lastSeenAt))) customer.lastSeenAt = seen;
    map.set(key, customer);
    return customer;
  };
  (data.leads || []).filter(item => item.clientId === client.id).forEach(lead => {
    const customer = touch(lead);
    if (customer) {
      customer.leads += 1;
      customer.leadStatus ||= lead.status || 'new';
      customer.leadPriority ||= lead.priority || '';
      customer.leadScore = Math.max(Number(customer.leadScore || 0), Number(lead.score || lead.leadScore || 0));
      customer.lastMessage ||= lead.lastMessage || lead.summary || '';
    }
  });
  (data.customers || []).filter(item => item.clientId === client.id).forEach(profile => {
    const customer = touch(profile);
    if (customer) {
      customer.address ||= profile.address || '';
      customer.birthdate ||= profile.birthdate || null;
      customer.totalPaidOrders = profile.totalPaidOrders || customer.totalPaidOrders || 0;
      customer.totalSpent = Math.max(Number(customer.totalSpent || 0), Number(profile.totalSpent || 0));
    }
  });
  (data.orders || []).filter(item => item.clientId === client.id).forEach(order => {
    const customer = touch(order);
    if (customer) {
      customer.orders += 1;
      if (['paid', 'delivered', 'completed'].includes(order.paymentStatus) || ['paid', 'delivered', 'completed'].includes(order.status)) customer.paidOrders += 1;
      customer.address ||= order.deliveryLocation || order.address || '';
      if (order.status === 'delivered' || order.paymentStatus === 'paid') customer.totalSpent += orderRevenue(order);
    }
  });
  return [...map.values()].map(customer => ({
    ...customer,
    segment: Number(customer.orders || customer.totalPaidOrders || 0) > 0 ? 'purchased' : (customer.leads > 0 ? 'hot_lead' : 'customer')
  })).sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
};

const customerMatches = (customer, item) => {
  const values = [customer.id, customer.telegramUserId, customer.telegramChatId, customer.phone, customer.username, customer.name]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());
  const itemValues = [item.id, item.telegramUserId, item.telegramChatId, item.phone, item.username, item.customerName, item.name, item.conversationId]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());
  return values.some(value => itemValues.includes(value));
};

const customerNoteRecord = (data, client, customer) => {
  data.customerNotes ||= [];
  return data.customerNotes.find(item =>
    item.clientId === client.id && customerMatches(customer, item)
  ) || null;
};

const customerConversation = (data, client, customer) => (data.conversations || [])
  .filter(item => item.clientId === client.id && customerMatches(customer, item))
  .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;

const customerTimeline = (data, client, customerId) => {
  const customer = customerRecords(data, client).find(item => String(item.id) === String(customerId));
  if (!customer) return null;
  const conversations = (data.conversations || []).filter(item => item.clientId === client.id && customerMatches(customer, item));
  const conversationIds = new Set(conversations.map(item => item.id));
  const note = customerNoteRecord(data, client, customer);
  if (customer.id) conversationIds.add(String(customer.id));
  const events = [];
  const add = (type, createdAt, title, description = '', meta = {}) => {
    if (!createdAt && !title) return;
    events.push({ type, createdAt: createdAt || now(), title, description, meta });
  };
  conversations.forEach(item => add('conversation', item.updatedAt || item.createdAt, 'Telegram conversation', item.title || item.telegramChatId || 'Customer chat'));
  (data.messages || [])
    .filter(item => item.clientId === client.id && (conversationIds.has(item.conversationId) || customerMatches(customer, item)))
    .forEach(item => add('message', item.createdAt, item.direction === 'inbound' ? 'Customer message' : 'Bot reply', item.text || ''));
  (data.leads || [])
    .filter(item => item.clientId === client.id && customerMatches(customer, item))
    .forEach(item => add('lead', item.updatedAt || item.createdAt, `Lead ${item.status || 'new'}`, item.interest || item.lastMessage || '', { score: item.leadScore || 0 }));
  (data.orders || [])
    .filter(item => item.clientId === client.id && customerMatches(customer, item))
    .forEach(item => add('order', item.updatedAt || item.createdAt, `Order ${item.status || 'draft'}`, [item.productCode, item.productName, item.total].filter(Boolean).join(' | '), { orderId: item.id }));
  (data.paymentProofs || [])
    .filter(item => item.clientId === client.id && (customerMatches(customer, item) || (item.orderId && events.some(event => event.meta?.orderId === item.orderId))))
    .forEach(item => add('payment', item.updatedAt || item.createdAt, `Payment proof ${item.status || 'pending'}`, [item.extracted?.amount, item.extracted?.transactionId, item.match?.status].filter(Boolean).join(' | ')));
  (data.productRecommendations || [])
    .filter(item => item.clientId === client.id && item.customerId === customer.id)
    .forEach(item => add('recommendation', item.updatedAt || item.sentAt || item.createdAt, `Recommendation ${item.status || 'sent'}`, [item.productCode, item.productName, item.reason].filter(Boolean).join(' | ')));
  (data.bookings || [])
    .filter(item => item.clientId === client.id && customerMatches(customer, item))
    .forEach(item => add('booking', item.updatedAt || item.createdAt, `Booking ${item.status || 'requested'}`, [
      item.requestedService,
      item.phone,
      item.preferredDateTime,
      item.locationPreference,
      item.budget,
      item.missingDetails?.length ? `Missing: ${item.missingDetails.join(', ')}` : ''
    ].filter(Boolean).join(' | '), { bookingId: item.id }));
  const reminderMarker = String(customer.name || customer.username || customer.phone || '').toLowerCase();
  (data.reminders || [])
    .filter(item => item.clientId === client.id && (
      (reminderMarker && String(item.notes || '').toLowerCase().includes(reminderMarker)) ||
      events.some(event => event.meta?.orderId && event.meta.orderId === item.linkedOrderId)
    ))
    .forEach(item => add('reminder', item.updatedAt || item.createdAt, `Reminder ${item.status || 'open'}`, [item.title, item.dueDate].filter(Boolean).join(' | ')));
  if (note?.note) add('note', note.updatedAt || note.createdAt, 'Private customer note', note.note);
  const summary = {
    conversations: conversations.length,
    messages: events.filter(event => event.type === 'message').length,
    leads: events.filter(event => event.type === 'lead').length,
    orders: events.filter(event => event.type === 'order').length,
    bookings: events.filter(event => event.type === 'booking').length,
    payments: events.filter(event => event.type === 'payment').length,
    recommendations: events.filter(event => event.type === 'recommendation').length,
    reminders: events.filter(event => event.type === 'reminder').length
  };
  const primaryConversation = conversations.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0] || null;
  return {
    customer,
    note: note?.note || '',
    canMessage: Boolean(customer.telegramChatId || primaryConversation?.telegramChatId),
    summary,
    timeline: events.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 100)
  };
};

const clientAnalytics = (data, client) => {
  const since7 = new Date(daysAgoIso(7)).getTime();
  const since30 = new Date(daysAgoIso(30)).getTime();
  const messages = (data.messages || []).filter(item => item.clientId === client.id);
  const leads = (data.leads || []).filter(item => item.clientId === client.id);
  const orders = (data.orders || []).filter(item => item.clientId === client.id);
  const products = (data.products || []).filter(item => item.clientId === client.id);
  const deliveredOrders = orders.filter(item => item.status === 'delivered');
  const deliveredRevenue = deliveredOrders.reduce((sum, order) => sum + orderRevenue(order), 0);
  const deliveredCost = deliveredOrders.reduce((sum, order) => sum + orderCost(order, products), 0);
  const unanswered = (data.unansweredQuestions || []).filter(item => item.clientId === client.id);
  const recent = items => items.filter(item => new Date(item.createdAt || item.updatedAt || 0).getTime() >= since7).length;
  const recent30 = items => items.filter(item => new Date(item.createdAt || item.updatedAt || 0).getTime() >= since30).length;
  const inbound = messages.filter(item => item.direction === 'inbound');
  const outbound = messages.filter(item => item.direction === 'outbound');
  return {
    conversationsTotal: (data.conversations || []).filter(item => item.clientId === client.id).length,
    customerMessages7d: recent(inbound),
    botReplies7d: recent(outbound),
    leads7d: recent(leads),
    leads30d: recent30(leads),
    orders7d: recent(orders),
    openOrders: orders.filter(item => !['delivered', 'cancelled'].includes(item.status)).length,
    deliveredOrders: deliveredOrders.length,
    deliveredRevenue,
    deliveredProfit: deliveredRevenue - deliveredCost,
    averageOrderValue: deliveredOrders.length ? Math.round(deliveredRevenue / deliveredOrders.length) : 0,
    customersTotal: customerRecords(data, client).length,
    wonLeads: leads.filter(item => item.status === 'won').length,
    lostLeads: leads.filter(item => item.status === 'lost').length,
    openLeads: leads.filter(item => !['archived', 'won', 'lost'].includes(item.status)).length,
    unansweredOpen: unanswered.filter(item => item.status !== 'resolved').length,
    unansweredRepeated: unanswered.filter(item => Number(item.count || 1) > 1 && item.status !== 'resolved').length,
    aiUsage: aiUsageStatus(client.settings || {})
  };
};

const readinessForClient = (data, client) => {
  const settings = client.settings || {};
  const profile = settings.businessProfile || {};
  const productMode = isProductBusiness(client);
  const files = isServiceBusiness(client) ? (data.knowledgeFiles || []).filter(file => file.clientId === client.id && file.isActive !== false) : [];
  const products = productMode ? (data.products || []).filter(product => product.clientId === client.id && product.isActive !== false) : [];
  const conversations = (data.conversations || []).filter(conversation => conversation.clientId === client.id);
  const hasStructuredKnowledge = Object.values(profile).some(value => String(value || '').trim());
  const hasKnowledgeSource = hasStructuredKnowledge || files.length > 0 || products.length > 0;
  const ai = effectiveAi(settings);
  const accountMode = (settings.automationType || 'bot') === 'account';
  const items = [
    {
      key: 'client-account',
      label: 'Client account created',
      done: true,
      help: 'The client can sign in to their private dashboard.'
    },
    {
      key: 'bot-token',
      label: accountMode ? 'Dedicated Telegram account connected' : 'Telegram bot connected',
      done: accountMode
        ? settings.accountSessionStatus === 'connected' && Boolean(settings.accountSessionString)
        : settings.botToken === 'configured' || Boolean(settings.botToken),
      help: accountMode ? 'Connect the dedicated Telegram account in Settings.' : 'Paste a BotFather token in Settings.'
    },
    {
      key: 'ai-key',
      label: 'AI key connected',
      done: Boolean(ai.apiKey),
      help: 'Add the client AI API key in Settings, or provide a managed key from the admin dashboard.'
    },
    {
      key: 'business-profile',
      label: 'Business profile filled',
      done: hasStructuredKnowledge,
      help: 'Add services, pricing, contact, delivery, policies, FAQ, and rules.'
    },
    {
      key: 'knowledge-source',
      label: productMode ? 'Product catalog added' : 'Service knowledge added',
      done: hasKnowledgeSource,
      help: productMode ? 'Add product catalog items and fill product rules in Settings.' : 'Fill service knowledge tables or upload service documents.'
    },
    {
      key: 'test-conversation',
      label: 'Test conversation received',
      done: conversations.length > 0,
      help: 'Send a Telegram test message to confirm the bot receives messages.'
    },
    {
      key: 'automation-active',
      label: 'Automation active',
      done: serviceAllowsAutomation(client) && Boolean(settings.isActive),
      help: 'Turn on 24/7 automation after testing.'
    }
  ];
  const done = items.filter(item => item.done).length;
  const score = Math.round((done / items.length) * 100);
  return {
    score,
    done,
    total: items.length,
    status: score === 100 ? 'ready' : score >= 70 ? 'almost-ready' : 'setup-needed',
    files: files.length,
    products: products.length,
    conversations: conversations.length,
    items
  };
};

const clientHealthWarnings = (data, client) => {
  const settings = client.settings || {};
  const readiness = readinessForClient(data, client);
  const activity = clientActivity(data, client);
  const qualitySignals = clientQualitySignals(data, client);
  const ai = effectiveAi(settings);
  const usage = aiUsageStatus(settings);
  const warnings = [];
  const add = (level, label, detail) => warnings.push({ level, label, detail });

  if (client.billing?.status === 'suspended') add('bad', 'Service suspended', 'Automation is blocked until the subscription is reactivated.');
  if (client.billing?.adminFollowUpDate && new Date(`${client.billing.adminFollowUpDate}T00:00:00`).getTime() <= Date.now()) {
    add('warn', 'Admin follow-up due', `Follow up with this client by ${client.billing.adminFollowUpDate}.`);
  }
  if (client.status === 'paused') add('warn', 'Client paused', 'The client workspace is paused by admin.');
  if (!settings.isActive) add('warn', 'Bot is off', '24/7 automation is not active.');
  if (!settings.botToken) add('bad', 'Missing Telegram bot token', 'The bot cannot receive or reply to customers without a BotFather token.');
  if (!ai.apiKey) add('bad', 'Missing AI key', 'Add a client-owned AI key or provide a managed Sprintsales key.');
  if (!settings.hotLeadNotifyChatId && !settings.telegramOwnerChatId) add('warn', 'No client Telegram alert chat ID', 'The business owner will not receive hot lead or unanswered question alerts.');
  if (readiness.score < 70) add('warn', 'Setup score is low', `${readiness.score}% complete. Finish the missing setup steps before real traffic.`);
  if (!readiness.items.find(item => item.key === 'knowledge-source')?.done) add('warn', 'No approved knowledge source', 'Add structured knowledge, files, or product catalog items so the bot has facts.');
  if (activity.openUnanswered > 0) add('warn', 'Open unanswered questions', `${activity.openUnanswered} question(s) need answers or FAQ updates.`);
  if (qualitySignals.lowRatings30d >= 3) add('bad', 'Repeated low ratings', `${qualitySignals.lowRatings30d} rating(s) of 2 stars or below in the last 30 days.`);
  else if (qualitySignals.lowRatings30d > 0) add('warn', 'Low rating reported', `${qualitySignals.lowRatings30d} low rating(s) in the last 30 days.`);
  if (qualitySignals.lateReports30d >= 5) add('bad', 'Repeated delivery failures', `${qualitySignals.lateReports30d} delivery issue report(s) in the last 30 days.`);
  else if (qualitySignals.lateReports30d > 0) add('warn', 'Delivery issue reported', `${qualitySignals.lateReports30d} delivery issue report(s) in the last 30 days.`);
  if (qualitySignals.severeNonDelivery > 0) add('bad', 'Severe non-delivery risk', `${qualitySignals.severeNonDelivery} order(s) are reported not received after 3x max delivery time.`);
  if (qualitySignals.overdueDeliveries > 0) add('warn', 'Late active deliveries', `${qualitySignals.overdueDeliveries} active delivery/order(s) passed the promised maximum time.`);
  if (usage.limitReached) add('bad', 'Managed AI limit reached', `Used ${usage.used}/${usage.limit} replies this month.`);
  else if (usage.limit > 0 && usage.percent >= 80) add('warn', 'Managed AI usage high', `${usage.percent}% of this month’s managed AI replies are used.`);

  const recentError = (data.botErrors || [])
    .slice()
    .reverse()
    .find(error => error.clientId === client.id && Date.now() - new Date(error.at).getTime() < 24 * 60 * 60 * 1000);
  if (recentError) add(recentError.severity === 'warn' ? 'warn' : 'bad', 'Recent bot/AI error', recentError.message);

  return warnings.slice(0, 8);
};

const eventTime = item => new Date(item.reviewSubmittedAt || item.deliveredAt || item.deliveryStartedAt || item.paymentConfirmedAt || item.confirmedAt || item.updatedAt || item.createdAt || item.at || 0).getTime() || 0;
const withinDays = (item, days) => eventTime(item) >= Date.now() - Number(days || 0) * 24 * 60 * 60 * 1000;
const orderStartForDelivery = order => eventTime({
  deliveryStartedAt: order.deliveryStartedAt,
  paymentConfirmedAt: order.paymentConfirmedAt,
  confirmedAt: order.confirmedAt,
  updatedAt: order.updatedAt,
  createdAt: order.createdAt
});
const deliveryMaxMs = order => Math.max(1, Number(order.deliveryMaxHours || order.deliveryEtaHours || 24) || 24) * 60 * 60 * 1000;
const orderClosed = order => ['delivered', 'cancelled', 'rejected', 'refunded'].includes(String(order.status || '').toLowerCase()) ||
  ['delivered', 'cancelled', 'rejected', 'refunded'].includes(String(order.deliveryStatus || '').toLowerCase());

const clientQualitySignals = (data, client) => {
  const orders = (data.orders || []).filter(order => order.clientId === client.id);
  const conversations = (data.conversations || []).filter(item => item.clientId === client.id);
  const unanswered = (data.unansweredQuestions || []).filter(item => item.clientId === client.id && item.status !== 'resolved');
  const lowRatings = orders.filter(order => Number(order.reviewRating || 0) > 0 && Number(order.reviewRating || 0) <= 2);
  const lateReports = orders.filter(order => ['late_reported', 'not_received', 'delivery_not_received'].includes(String(order.deliveryStatus || '').toLowerCase()));
  const activeDeliveryOrders = orders.filter(order => !orderClosed(order) && (order.deliveryMaxHours || order.deliveryEtaHours || order.paymentConfirmedAt || order.deliveryStartedAt));
  const overdueDeliveries = activeDeliveryOrders.filter(order => {
    const startedAt = orderStartForDelivery(order);
    return startedAt && Date.now() > startedAt + deliveryMaxMs(order);
  });
  const severeNonDelivery = lateReports.filter(order => {
    const startedAt = orderStartForDelivery(order);
    return startedAt && Date.now() > startedAt + deliveryMaxMs(order) * 3;
  });
  const supportOpen = conversations.filter(item => ['human_support', 'delivery_support'].includes(String(item.stage || '').toLowerCase()));
  const lowRatings30d = lowRatings.filter(order => withinDays(order, 30)).length;
  const lateReports30d = lateReports.filter(order => withinDays(order, 30)).length;
  let trustStatus = 'healthy';
  if (severeNonDelivery.length > 0 || lowRatings30d >= 5 || lateReports30d >= 5) trustStatus = 'restricted_candidate';
  else if (lowRatings30d >= 3 || lateReports30d >= 3 || overdueDeliveries.length >= 5) trustStatus = 'under_review';
  else if (lowRatings30d > 0 || lateReports30d > 0 || overdueDeliveries.length > 0 || unanswered.length > 0 || supportOpen.length > 0) trustStatus = 'watch';
  return {
    trustStatus,
    lowRatings30d,
    lowRatingsTotal: lowRatings.length,
    lateReports30d,
    lateReportsTotal: lateReports.length,
    overdueDeliveries: overdueDeliveries.length,
    severeNonDelivery: severeNonDelivery.length,
    openSupport: supportOpen.length,
    openUnanswered: unanswered.length
  };
};

const clientQualityEvents = (data, client) => {
  const orders = (data.orders || []).filter(order => order.clientId === client.id);
  const conversations = (data.conversations || []).filter(item => item.clientId === client.id);
  const unanswered = (data.unansweredQuestions || []).filter(item => item.clientId === client.id && item.status !== 'resolved');
  const events = [];
  const add = (type, severity, title, detail, item = {}) => {
    events.push({
      id: `${type}-${item.id || item.orderId || item.conversationId || item.createdAt || events.length}`,
      type,
      severity,
      title,
      detail,
      orderId: item.orderId || item.id || '',
      customer: item.customerName || item.username || item.phone || item.title || '',
      product: item.productName || item.productCode || '',
      createdAt: item.reviewSubmittedAt || item.deliveredAt || item.updatedAt || item.createdAt || item.at || ''
    });
  };

  orders.forEach(order => {
    const rating = Number(order.reviewRating || 0);
    if (rating > 0 && rating <= 2) {
      add('low_rating', 'warn', `Low rating: ${rating}/5`, `Customer rated order ${order.id} ${rating}/5.`, order);
    }
    if (['late_reported', 'not_received', 'delivery_not_received'].includes(String(order.deliveryStatus || '').toLowerCase())) {
      const startedAt = orderStartForDelivery(order);
      const severe = startedAt && Date.now() > startedAt + deliveryMaxMs(order) * 3;
      add(
        severe ? 'severe_non_delivery' : 'delivery_issue',
        severe ? 'bad' : 'warn',
        severe ? 'Severe non-delivery report' : 'Delivery issue report',
        severe
          ? `Order ${order.id} was reported not received after 3x the promised delivery time.`
          : `Customer reported a delivery problem for order ${order.id}.`,
        order
      );
    }
    if (!orderClosed(order) && (order.deliveryMaxHours || order.deliveryEtaHours || order.paymentConfirmedAt || order.deliveryStartedAt)) {
      const startedAt = orderStartForDelivery(order);
      if (startedAt && Date.now() > startedAt + deliveryMaxMs(order)) {
        add('overdue_delivery', 'warn', 'Overdue active delivery', `Order ${order.id} passed the promised max delivery time.`, order);
      }
    }
  });

  conversations
    .filter(item => ['human_support', 'delivery_support'].includes(String(item.stage || '').toLowerCase()))
    .forEach(item => add('open_support', 'info', 'Open support conversation', `Customer support stage is still open for ${item.title || item.telegramChatId || item.id}.`, item));

  unanswered.forEach(item => add(
    'unanswered_question',
    Number(item.count || 1) > 1 ? 'warn' : 'info',
    'Unanswered customer question',
    `${item.question || 'Customer question'}${Number(item.count || 1) > 1 ? ` (${item.count} repeats)` : ''}`,
    item
  ));

  return events
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 8);
};

const clientQualityScore = (data, client) => {
  const readiness = readinessForClient(data, client);
  const activity = clientActivity(data, client);
  const warnings = clientHealthWarnings(data, client);
  const signals = clientQualitySignals(data, client);
  const tests = (data.botTests || []).filter(test => test.clientId === client.id);
  const tested = tests.filter(test => test.lastRunAt);
  const passed = tested.filter(test => test.status === 'passed');
  let score = readiness.score;
  score -= Math.min(25, warnings.filter(warning => warning.level === 'bad').length * 12);
  score -= Math.min(20, warnings.filter(warning => warning.level === 'warn').length * 5);
  score -= Math.min(18, activity.openUnanswered * 4);
  score -= Math.min(20, signals.lowRatings30d * 5);
  score -= Math.min(25, signals.lateReports30d * 5);
  score -= Math.min(30, signals.severeNonDelivery * 15);
  score -= Math.min(15, signals.overdueDeliveries * 3);
  if (tested.length) score += Math.round((passed.length / tested.length) * 15) - 5;
  else score -= 8;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    label: score >= 85 ? 'strong' : score >= 70 ? 'good' : score >= 50 ? 'needs work' : 'risky',
    trustStatus: signals.trustStatus,
    signals,
    testsTotal: tests.length,
    testsRun: tested.length,
    testsPassed: passed.length,
    warnings: warnings.length
  };
};

  return {
    clientStorageStats,
    storageReport,
    systemStatus,
    serviceAllowsAutomation,
    automationBlockReason,
    botDebugReason,
    goLiveStatusForClient,
    clientActivity,
    botDebugForClient,
    previewStatsForClient,
    customerRecords,
    customerMatches,
    customerNoteRecord,
    customerConversation,
    customerTimeline,
    clientAnalytics,
    readinessForClient,
    clientHealthWarnings,
    clientQualityScore,
    clientQualityEvents
  };
};
