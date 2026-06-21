import { Router } from 'express';
import path from 'node:path';

const slugify = value => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/['"]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

const cleanHost = value => String(value || '')
  .toLowerCase()
  .split(':')[0]
  .replace(/^www\./, '')
  .trim();

const cleanUsername = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(?:https?:\/\/t\.me\/)?@?([A-Za-z0-9_]{4,})/i);
  return match ? match[1] : text.replace(/^@/, '');
};

const firstText = values => values
  .map(value => String(value || '').trim())
  .find(Boolean) || '';

const asList = value => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(/[,|/]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

const productPrice = product => product?.sellingPrice || product?.price || '';

const statusAllowsCatalog = client => String(client?.status || '').toLowerCase() === 'active';

const productAllowsCatalog = product => {
  if (!product?.name) return false;
  if (product.isActive === false) return false;
  const status = String(product.status || '').toLowerCase();
  if (['inactive', 'disabled', 'draft', 'deleted', 'archived'].includes(status)) return false;
  const stock = String(product.stockStatus || product.availability || product.status || '').toLowerCase();
  if (/(out[_\s-]?of[_\s-]?stock|sold[_\s-]?out|unavailable)/i.test(stock)) return false;
  return true;
};

const clientMiniappSettings = client => ({
  enabled: client?.settings?.miniapp?.enabled !== false,
  slug: slugify(client?.settings?.miniapp?.slug || client?.settings?.storeSlug || client?.businessName || client?.id),
  customDomain: cleanHost(client?.settings?.miniapp?.customDomain || client?.settings?.miniappDomain || ''),
  template: String(client?.settings?.miniapp?.template || 'clean-retail').trim(),
  themeColor: String(client?.settings?.miniapp?.themeColor || '#0f2a52').trim(),
  accentColor: String(client?.settings?.miniapp?.accentColor || '#14b8a6').trim()
});

const pathBasename = value => String(value || '').split(/[\\/]/).pop() || '';

const imageUrlForPath = (clientId, value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith('/uploads/')) return text;
  const name = pathBasename(text);
  return name ? `/uploads/products/${encodeURIComponent(clientId)}/${encodeURIComponent(name)}` : '';
};

const imageRecords = product => {
  const records = Array.isArray(product?.images) ? product.images : [];
  if (records.length) {
    return records
      .map((item, index) => {
        if (!item) return null;
        if (typeof item === 'string') return { publicPath: item, watermarkedPath: item, isPrimary: index === 0 };
        const publicPath = item.publicPath || item.publicImagePath || item.watermarkedPath || item.watermarkedImagePath || item.imagePath || item.imageUrl || item.url || '';
        return {
          publicPath,
          watermarkedPath: item.watermarkedPath || item.watermarkedImagePath || publicPath,
          isPrimary: item.isPrimary === true || index === 0
        };
      })
      .filter(item => item?.publicPath || item?.watermarkedPath)
      .slice(0, 3);
  }
  const publicPath = product?.publicImagePath || product?.watermarkedImagePath || product?.imagePath || product?.imageUrl || product?.image || '';
  return publicPath ? [{ publicPath, watermarkedPath: product?.watermarkedImagePath || publicPath, isPrimary: true }] : [];
};

const serializeProduct = product => ({
  id: product.id,
  code: product.code || product.productCode || product.product_code || '',
  name: product.name || '',
  description: String(product.description || product.salesPostCaption || product.caption || '').slice(0, 220),
  price: productPrice(product),
  compareAtPrice: product.compareAtPrice || product.oldPrice || '',
  category: product.category || product.selectedCategory || 'Other',
  subcategory: product.subcategory || product.selectedSubcategory || '',
  availability: product.availability || product.stockStatus || '',
  colors: asList(product.colors || product.color_options || product.colorOptions),
  sizes: asList(product.sizes || product.size_options || product.sizeOptions),
  options: asList(product.options || product.variantOptions || product.specifications),
  images: imageRecords(product).map(image => imageUrlForPath(product.clientId, image.publicPath || image.watermarkedPath)).filter(Boolean)
});

const findClientForMiniapp = (data, slugOrId, host) => {
  const hostKey = cleanHost(host);
  const slugKey = slugify(slugOrId);
  const activeClients = (data.clients || []).filter(client => statusAllowsCatalog(client));

  const byDomain = activeClients.find(client => {
    const settings = clientMiniappSettings(client);
    return settings.enabled && settings.customDomain && settings.customDomain === hostKey;
  });
  if (byDomain) return byDomain;

  return activeClients.find(client => {
    const settings = clientMiniappSettings(client);
    return settings.enabled && (
      settings.slug === slugKey ||
      slugify(client.businessName) === slugKey ||
      slugify(client.id) === slugKey ||
      String(client.id || '').toLowerCase() === String(slugOrId || '').toLowerCase()
    );
  }) || null;
};

const categoriesFromProducts = products => {
  const map = new Map();
  for (const product of products) {
    const category = product.category || 'Other';
    if (!map.has(category)) map.set(category, { name: category, count: 0, subcategories: new Map() });
    const entry = map.get(category);
    entry.count += 1;
    if (product.subcategory) entry.subcategories.set(product.subcategory, (entry.subcategories.get(product.subcategory) || 0) + 1);
  }
  return [...map.values()].map(item => ({
    name: item.name,
    count: item.count,
    subcategories: [...item.subcategories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name))
  })).sort((a, b) => a.name.localeCompare(b.name));
};

export function createMiniappRoutes(deps) {
  const {
    publicDir,
    readData,
    isProductBusiness = () => true,
    activeClientProducts
  } = deps;
  const router = Router();

  router.get('/api/miniapp/shop/:slug', async (req, res) => {
    const data = await readData();
    const client = findClientForMiniapp(data, req.params.slug, req.get('host'));
    if (!client || !isProductBusiness(client)) {
      return res.status(404).json({ error: 'Shop not found' });
    }
    const settings = clientMiniappSettings(client);
    const products = (activeClientProducts ? activeClientProducts(data, client.id) : (data.products || []).filter(product => product.clientId === client.id))
      .filter(productAllowsCatalog)
      .map(serializeProduct);
    const botUsername = cleanUsername(firstText([
      client.settings?.botUsername,
      client.settings?.accountUsername,
      client.settings?.connectedBotUsername
    ]));
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      shop: {
        id: client.id,
        slug: settings.slug,
        businessName: client.businessName || 'Shop',
        logoUrl: client.settings?.businessLogoUrl || '',
        summary: client.settings?.businessProfile?.summary || '',
        firstTimeWelcomeMessage: client.settings?.businessProfile?.firstTimeWelcomeMessage || '',
        botUsername,
        template: settings.template,
        themeColor: settings.themeColor,
        accentColor: settings.accentColor
      },
      categories: categoriesFromProducts(products),
      products
    });
  });

  router.get(/^\/shop\/[^/]+(?:\/.*)?$/, (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(publicDir, 'miniapp', 'index.html'));
  });

  return router;
}
