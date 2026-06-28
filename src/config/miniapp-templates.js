export const MINIAPP_TEMPLATE_IDS = Object.freeze({
  CLEAN_RETAIL: 'clean-retail',
  EDITORIAL_BOUTIQUE: 'editorial-boutique'
});

export const MINIAPP_TEMPLATES = Object.freeze([
  Object.freeze({
    id: MINIAPP_TEMPLATE_IDS.CLEAN_RETAIL,
    label: 'Design A',
    name: 'Modern Retail',
    description: 'A compact, practical storefront built for fast browsing and ordering.',
    posterUrl: '/miniapp/previews/design-a-poster.jpg',
    previewUrl: '/miniapp/previews/design-a-preview.mp4'
  }),
  Object.freeze({
    id: MINIAPP_TEMPLATE_IDS.EDITORIAL_BOUTIQUE,
    label: 'Design B',
    name: 'Editorial Boutique',
    description: 'A premium, image-led storefront with an elegant catalog presentation.',
    posterUrl: '/miniapp/previews/design-b-poster.jpg',
    previewUrl: '/miniapp/previews/design-b-preview.mp4'
  })
]);

const allowedTemplateIds = new Set(MINIAPP_TEMPLATES.map(template => template.id));

export const normalizeMiniappTemplate = value => {
  const template = String(value || '').trim().toLowerCase();
  return allowedTemplateIds.has(template) ? template : MINIAPP_TEMPLATE_IDS.CLEAN_RETAIL;
};

export const miniappTemplateForClient = client => {
  const retailType = String(
    client?.settings?.businessProfile?.retailType ||
    client?.settings?.businessProfile?.businessType ||
    client?.retailType ||
    client?.businessTypeLabel ||
    ''
  ).toLowerCase();
  if (/cake|bakery|pastry|dessert/.test(retailType)) {
    return MINIAPP_TEMPLATE_IDS.CLEAN_RETAIL;
  }
  return normalizeMiniappTemplate(client?.settings?.miniapp?.template);
};
