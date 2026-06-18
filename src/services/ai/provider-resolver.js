/**
 * AI Provider Resolver
 *
 * Resolves which API key to use for a given provider and business.
 *
 * Active model:
 *   - Client mode: aiProvider + aiApiKey
 *   - Admin-managed mode: adminAiProvider + adminAiApiKey
 *
 * Legacy per-provider keys are read only as a migration fallback, so old data
 * keeps working while the UI and settings API expose one key per owner.
 *
 * Provider constants:
 *   deepseek  → text extraction / reasoning
 *   gemini    → future image/audio/OCR
 *   openai    → future optional text/vision
 *   grok      → future optional
 *   anthropic → future optional text
 */

const PROVIDER_FIELDS = {
  deepseek: 'deepseekKey',
  gemini: 'geminiKey',
  openai: 'openaiKey',
  grok: 'grokKey',
  anthropic: 'anthropicKey',
};

const ADMIN_FIELDS = {
  deepseek: 'adminDeepseekKey',
  gemini: 'adminGeminiKey',
  openai: 'adminOpenaiKey',
  grok: 'adminGrokKey',
  anthropic: 'adminAnthropicKey',
};

const VALID_PROVIDERS = new Set(Object.keys(PROVIDER_FIELDS));

function normalizeProvider(provider = 'deepseek') {
  const normalized = String(provider || 'deepseek').toLowerCase().trim();
  if (normalized === 'claude') return 'anthropic';
  return VALID_PROVIDERS.has(normalized) ? normalized : 'deepseek';
}

/**
 * Resolve API key for a given provider and business.
 * @param {object} clientSettings - The client's settings object
 * @param {string} provider - Provider name: deepseek|gemini|openai|grok|anthropic
 * @param {object} [globalKeys={}] - Platform-wide global AI provider keys (from platformSettings.aiGlobalKeys)
 * @returns {{ apiKey: string|null, source: string, provider: string }}
 */
function resolveProviderKey(clientSettings = {}, provider = 'deepseek', globalKeys = {}) {
  const normalized = normalizeProvider(provider);
  const clientProvider = normalizeProvider(clientSettings.aiProvider || normalized);
  const adminProvider = normalizeProvider(clientSettings.adminAiProvider || normalized);
  const globalProvider = normalizeProvider(globalKeys.provider || globalKeys.aiProvider || normalized);

  if (clientProvider === normalized && clientSettings.aiApiKey) {
    return {
      apiKey: clientSettings.aiApiKey,
      source: 'client',
      provider: normalized,
    };
  }

  if (adminProvider === normalized && clientSettings.adminAiApiKey) {
    return {
      apiKey: clientSettings.adminAiApiKey,
      source: 'admin',
      provider: normalized,
    };
  }

  if (globalProvider === normalized && (globalKeys.apiKey || globalKeys.aiApiKey)) {
    return {
      apiKey: globalKeys.apiKey || globalKeys.aiApiKey,
      source: 'global',
      provider: normalized,
    };
  }

  if (globalKeys[normalized]) {
    return {
      apiKey: globalKeys[normalized],
      source: 'global-legacy',
      provider: normalized,
    };
  }

  const clientField = PROVIDER_FIELDS[normalized];
  const adminField = ADMIN_FIELDS[normalized];
  if (clientSettings?.[clientField]) {
    return {
      apiKey: clientSettings[clientField],
      source: 'client-legacy-provider',
      provider: normalized,
    };
  }

  if (clientSettings?.[adminField]) {
    return {
      apiKey: clientSettings[adminField],
      source: 'admin-legacy-provider',
      provider: normalized,
    };
  }

  // No key available
  return { apiKey: null, source: 'none', provider: normalized };
}

/**
 * Check if any AI provider key is available for this client (for automation checks).
 * @param {object} clientSettings - The client's settings object
 * @param {object} [globalKeys={}] - Platform-wide global AI provider keys
 */
function hasAnyAiKey(clientSettings, globalKeys = {}) {
  for (const provider of VALID_PROVIDERS) {
    const resolved = resolveProviderKey(clientSettings, provider, globalKeys);
    if (resolved.apiKey) return true;
  }
  return Boolean(clientSettings?.aiApiKey || clientSettings?.adminAiApiKey || globalKeys?.apiKey || globalKeys?.aiApiKey);
}

/**
 * Mask an API key for display, showing only first 6 and last 4 chars.
 */
function maskApiKey(key) {
  if (!key) return '';
  const s = String(key).trim();
  if (s.length <= 12) return s.slice(0, 4) + '...';
  return s.slice(0, 6) + '...' + s.slice(-4);
}

/**
 * Basic key format validation per provider.
 */
function validateKeyFormat(provider, key) {
  if (!key || !String(key).trim()) return false;
  const s = String(key).trim();
  switch (provider) {
    case 'deepseek':
      return /^sk-[a-zA-Z0-9]{24,}$/.test(s);
    case 'gemini':
      return /^[A-Za-z0-9_-]{10,}$/.test(s);
    case 'openai':
      return /^sk-[a-zA-Z0-9]{24,}$/.test(s);
    case 'grok':
      return /^[a-zA-Z0-9]{8,}$/.test(s);
    case 'anthropic':
      return /^sk-ant-[a-zA-Z0-9]{20,}$/.test(s);
    default:
      return s.length >= 8;
  }
}

export {
  resolveProviderKey,
  hasAnyAiKey,
  maskApiKey,
  validateKeyFormat,
  PROVIDER_FIELDS,
  ADMIN_FIELDS,
  VALID_PROVIDERS,
  normalizeProvider,
};
