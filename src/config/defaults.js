import { getRetailCategoryNames } from './retail-templates.js';

export const quotas = {
  maxClients: 50,
  maxKnowledgeFilesPerClient: 20,
  maxKnowledgeStorageMbPerClient: 250,
  maxProductsPerClient: 30,
  maxProductImageMb: 5,
  maxProductImageStorageMbPerClient: 150
};

export const defaultSettings = () => ({
  botName: 'Client sales assistant',
  automationType: 'bot',
  botToken: '',
  accountApiId: '',
  accountApiHash: '',
  accountPhone: '',
  accountSessionStatus: 'not_connected',
  isActive: false,
  replyDelayMinutes: 1,
  tone: 'Professional, warm, concise, and sales-aware.',
  historyLimit: 12,
  hotLeadNotifyChatId: '',
  notificationPrefs: {
    hotLeads: true,
    unanswered: true,
    support: true,
    orders: true,
    renewals: true,
    aiUsage: true,
    draftOrders: true,
    lowStock: true,
    qualityAlerts: true
  },
  followUpsEnabled: false,
  followUpDelayHours: 24,
  maxFollowUps: 1,
  followUpMessage: 'Hi {name}, just checking if you still need help with {interest}. I can help you with the next step.',
  followUpsStartedAt: '',
  checkoutFollowUpsEnabled: true,
  paymentFollowUpsEnabled: true,
  reviewRequestsEnabled: true,
  reviewRequestDelayHours: 3,
  // Per-provider client keys
  aiKeyMode: 'client',
  aiProvider: 'deepseek',
  aiApiKey: '',
  deepseekKey: '',
  geminiKey: '',
  openaiKey: '',
  grokKey: '',
  anthropicKey: '',
  visionProvider: 'gemini',
  visionApiKey: '',
  voiceProvider: 'gemini',
  voiceApiKey: '',
  // Per-provider admin global keys
  adminAiProvider: 'deepseek',
  adminAiApiKey: '',
  adminDeepseekKey: '',
  adminGeminiKey: '',
  adminOpenaiKey: '',
  adminGrokKey: '',
  adminAnthropicKey: '',
  aiMonthlyReplyLimit: 1000,
  aiUsageMonth: '',
  aiRepliesThisMonth: 0,
  strictKnowledgeMode: true,
  businessProfile: {
    businessType: 'retail',
    summary: '',
    firstTimeWelcomeMessage: '',
    referenceKnowledge: '',
    services: '',
    products: '',
    pricing: '',
    timeline: '',
    contact: '',
    address: '',
    delivery: '',
    paymentInstructions: '',
    policies: '',
    faq: '',
    mustSay: '',
    neverSay: ''
  },
  productPosting: {
    destination: '',
    autoPostEnabled: false,
    autoPostWarningAccepted: false,
    language: 'mixed',
    style: 'friendly-sales',
    includePrice: true,
    includeSizesColors: true,
    includeMaterial: true,
    includeAvailability: true,
    includeHashtags: true,
    includeOrderInstruction: true
  },
  miniapp: {
    enabled: true,
    slug: '',
    customDomain: '',
    template: 'clean-retail',
    themeColor: '#0f2a52',
    accentColor: '#14b8a6'
  },
  categoryTemplates: [],
  delivery: {
    mode: 'fixed_addis',
    addis_delivery_fee: 300,
    outside_addis_behavior: 'manual_confirmation',
    shop_address: '',
    shop_latitude: null,
    shop_longitude: null,
    zones: []
  },
  discounts: {
    enabled: true,
    allowStacking: false,
    newBuyer: { enabled: false, type: 'percent', value: 0, maxPerWeek: 0 },
    repeatBuyer: { enabled: false, type: 'percent', value: 0, purchaseCount: 2, maxPerWeek: 0 },
    birthdayWeek: { enabled: false, type: 'percent', value: 0, maxPerWeek: 0 },
    sales: { enabled: false, type: 'percent', value: 0, maxPerWeek: 0 },
    holiday: { enabled: false, type: 'percent', value: 0, maxPerWeek: 0 },
    codes: []
  },
  paymentOptions: [],
  paymentVerificationMode: 'manual'
});

export const normalizeBusinessType = value => {
  if (['retail', 'product', 'products', 'shop', 'store'].includes(String(value || '').toLowerCase())) return 'retail';
  if (['service', 'services'].includes(String(value || '').toLowerCase())) return 'service';
  return '';
};


export const getDefaultCategories = (rawBusinessType) => {
  return getRetailCategoryNames(rawBusinessType);
};
export const inferBusinessType = (data, client) => {
  const saved = normalizeBusinessType(client?.settings?.businessProfile?.businessType);
  if (saved) return saved;
  const hasProducts = (data?.products || []).some(product => product.clientId === client?.id);
  return hasProducts ? 'retail' : 'service';
};

export const businessMode = client => normalizeBusinessType(client?.settings?.businessProfile?.businessType) || 'retail';
export const isProductBusiness = client => businessMode(client) === 'retail';
export const isServiceBusiness = client => businessMode(client) === 'service';
export const businessTypeLabel = client => isProductBusiness(client) ? 'Product selling business' : 'Service selling business';

export const defaultBilling = () => ({
  status: 'trial',
  plan: 'basic',
  renewalDate: '',
  adminFollowUpDate: '',
  amount: 0,
  lastPaymentAmount: 0,
  lastPaymentDate: '',
  note: ''
});

export const currentAiUsageMonth = () => new Date().toISOString().slice(0, 7);

export const normalizeAiUsage = settings => {
  const month = currentAiUsageMonth();
  if (settings.aiUsageMonth !== month) {
    settings.aiUsageMonth = month;
    settings.aiRepliesThisMonth = 0;
  }
  settings.aiMonthlyReplyLimit = Math.max(0, Number(settings.aiMonthlyReplyLimit || 1000));
  settings.aiRepliesThisMonth = Math.max(0, Number(settings.aiRepliesThisMonth || 0));
  return settings;
};
