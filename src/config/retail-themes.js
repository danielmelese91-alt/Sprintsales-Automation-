const LEGACY_MAIN_COLOR = '#0f2a52';
const LEGACY_ACCENT_COLOR = '#14b8a6';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const theme = (key, label, description, themeColor, accentColor) => Object.freeze({
  key,
  label,
  description,
  themeColor,
  accentColor
});

export const RETAIL_WEBSITE_THEMES = Object.freeze({
  electronics: theme(
    'electronics',
    'Electronics',
    'Technical navy with an energetic cyan accent.',
    '#123c73',
    '#087f8c'
  ),
  fashion: theme(
    'fashion',
    'Fashion & Boutique',
    'Editorial charcoal with a refined warm-gold accent.',
    '#24262d',
    '#8a641f'
  ),
  beauty: theme(
    'beauty',
    'Beauty & Cosmetics',
    'Rich plum with a polished rose accent.',
    '#71345f',
    '#a84470'
  ),
  shoes: theme(
    'shoes',
    'Shoes',
    'Confident indigo with a modern copper-gold accent.',
    '#303c6c',
    '#9a5f23'
  ),
  bags: theme(
    'bags',
    'Bags & Accessories',
    'Deep aubergine with a soft luxury-bronze accent.',
    '#4b2d52',
    '#94613e'
  ),
  home: theme(
    'home',
    'Home & Kitchen',
    'Calm teal with a welcoming coral accent.',
    '#17605d',
    '#b54e3d'
  ),
  furniture: theme(
    'furniture',
    'Furniture',
    'Natural forest green with a restrained brass accent.',
    '#344e41',
    '#866426'
  ),
  cakes: theme(
    'cakes',
    'Cakes & Bakery',
    'Celebratory berry with a soft confectionery-pink accent.',
    '#79264b',
    '#b93f72'
  ),
  general: theme(
    'general',
    'General Retail',
    'Dependable navy with a fresh commerce-teal accent.',
    '#173b67',
    '#087f73'
  )
});

const exactAliases = new Map([
  ['electronics', 'electronics'],
  ['fashion', 'fashion'],
  ['beauty', 'beauty'],
  ['shoes', 'shoes'],
  ['bags', 'bags'],
  ['home', 'home'],
  ['home_kitchen', 'home'],
  ['furniture', 'furniture'],
  ['cakes', 'cakes'],
  ['retail', 'general'],
  ['general', 'general']
]);

export const normalizeWebsiteColor = (value, fallback) => {
  const color = String(value || '').trim().toLowerCase();
  return HEX_COLOR.test(color) ? color : fallback;
};

export const retailWebsiteThemeKey = value => {
  const text = String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_');
  if (exactAliases.has(text)) return exactAliases.get(text);
  if (/cake|bakery|pastr|dessert|cupcake/.test(text)) return 'cakes';
  if (/shoe|sneaker|footwear/.test(text)) return 'shoes';
  if (/bag|accessor|leather_good/.test(text)) return 'bags';
  if (/fashion|boutique|cloth|apparel/.test(text)) return 'fashion';
  if (/electron|phone|computer|laptop|gadget/.test(text)) return 'electronics';
  if (/beauty|cosmetic|makeup|skincare|perfume|salon/.test(text)) return 'beauty';
  if (/furniture|sofa|bed|chair/.test(text)) return 'furniture';
  if (/home|kitchen|appliance|cookware|household/.test(text)) return 'home';
  return 'general';
};

export const getRetailWebsiteTheme = value => {
  const selected = RETAIL_WEBSITE_THEMES[retailWebsiteThemeKey(value)] || RETAIL_WEBSITE_THEMES.general;
  return { ...selected };
};

export const clientRetailType = client => String(
  client?.settings?.businessProfile?.retailType ||
  client?.settings?.retailType ||
  client?.retailType ||
  client?.businessTypeLabel ||
  client?.businessType ||
  'general'
).trim();

const isLegacyUniversalTheme = (themeColor, accentColor) => (
  themeColor === LEGACY_MAIN_COLOR &&
  accentColor === LEGACY_ACCENT_COLOR
);

export const resolveRetailWebsiteTheme = (retailType, miniapp = {}) => {
  const recommended = getRetailWebsiteTheme(retailType);
  const savedMain = normalizeWebsiteColor(miniapp.themeColor, '');
  const savedAccent = normalizeWebsiteColor(miniapp.accentColor, '');
  const hasSavedPair = Boolean(savedMain && savedAccent);
  const explicitlyCustomized = miniapp.themeCustomized === true;
  const legacyCustomPair = miniapp.themeCustomized === undefined &&
    hasSavedPair &&
    !isLegacyUniversalTheme(savedMain, savedAccent);
  const themeCustomized = explicitlyCustomized || legacyCustomPair;

  return {
    themeColor: themeCustomized ? (savedMain || recommended.themeColor) : recommended.themeColor,
    accentColor: themeCustomized ? (savedAccent || recommended.accentColor) : recommended.accentColor,
    themeCustomized,
    recommendedTheme: recommended
  };
};

export const websiteThemeForClient = client => resolveRetailWebsiteTheme(
  clientRetailType(client),
  client?.settings?.miniapp || {}
);
