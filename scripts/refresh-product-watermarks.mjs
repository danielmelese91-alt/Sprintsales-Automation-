import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWatermarkedProductImage, watermarkedPathForOriginal } from '../src/services/product-watermark-service.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'data', 'platform.json');

const firstCleanText = values => values
  .map(value => String(value || '').trim())
  .find(value => value && !/^(undefined|null)$/i.test(value)) || '';

const normalizeTelegramUsername = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(?:https?:\/\/t\.me\/)?@?([A-Za-z0-9_]{4,})/i);
  return match ? `@${match[1]}` : text;
};

const resolvePath = value => {
  const text = String(value || '').trim();
  if (!text || /^https?:\/\//i.test(text)) return '';
  return path.isAbsolute(text) ? text : path.join(rootDir, text);
};

const imageRecords = product => {
  const records = Array.isArray(product?.images) ? product.images : [];
  if (records.length) {
    return records.map((item, index) => {
      if (!item) return null;
      if (typeof item === 'string') return { originalPath: item, watermarkedPath: watermarkedPathForOriginal(resolvePath(item)), isPrimary: index === 0 };
      const publicPath = item.publicPath || item.publicImagePath || item.watermarkedPath || item.watermarkedImagePath || item.imagePath || item.imageUrl || item.url || '';
      return {
        originalPath: item.originalPath || item.imageOriginalPath || item.originalImagePath || publicPath,
        watermarkedPath: item.watermarkedPath || item.watermarkedImagePath || publicPath,
        isPrimary: item.isPrimary === true || index === 0
      };
    }).filter(Boolean).slice(0, 5);
  }
  const originalPath = product?.imageOriginalPath || product?.originalImagePath || '';
  const watermarkedPath = product?.watermarkedImagePath || product?.publicImagePath || product?.imagePath || '';
  return originalPath || watermarkedPath ? [{ originalPath: originalPath || watermarkedPath, watermarkedPath: watermarkedPath || watermarkedPathForOriginal(resolvePath(originalPath)) }] : [];
};

const centerTextFor = client => normalizeTelegramUsername(firstCleanText([
  client?.settings?.botUsername,
  client?.settings?.accountUsername,
  client?.settings?.telegramChannelLink,
  client?.settings?.watermarkName,
  client?.businessName,
  'Sprintsales'
]));

const isCakeClient = client => {
  const settings = client?.settings || {};
  const profile = settings.businessProfile || {};
  return /cake|bakery|pastr|dessert/.test([
    settings.retailType,
    settings.businessType,
    profile.retailType,
    profile.businessType,
    client?.businessType
  ].filter(Boolean).join(' ').toLowerCase());
};

const isCakeProduct = (client, product = {}) => {
  if (isCakeClient(client)) return true;
  return /cake|bakery|pastr|dessert|birthday|wedding|fondant|bento|cupcake/.test([
    product.category,
    product.subcategory,
    product.name,
    product.productType
  ].filter(Boolean).join(' ').toLowerCase());
};

const bottomTextFor = (client, product) => [
  firstCleanText([
    client?.settings?.watermarkName,
    client?.businessName,
    'Sprintsales'
  ]),
  firstCleanText([product?.code, product?.sku, product?.productCode])
].filter(Boolean).join(' | ');

const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
const clientsById = new Map((data.clients || []).map(client => [client.id, client]));
const cakesOnly = process.argv.includes('--cakes-only');
const excludeCakes = process.argv.includes('--exclude-cakes');
let refreshed = 0;
let skipped = 0;

for (const product of data.products || []) {
  const client = clientsById.get(product.clientId) || {};
  const cakeProduct = isCakeProduct(client, product);
  if (cakesOnly && !cakeProduct) continue;
  if (excludeCakes && cakeProduct) continue;
  for (const record of imageRecords(product)) {
    const inputPath = resolvePath(record.originalPath);
    const outputPath = resolvePath(record.watermarkedPath) || (inputPath ? watermarkedPathForOriginal(inputPath) : '');
    if (!inputPath || !outputPath) {
      skipped += 1;
      continue;
    }
    try {
      await fs.access(inputPath);
      await createWatermarkedProductImage({
        inputPath,
        outputPath,
        centerText: centerTextFor(client),
        bottomText: cakeProduct ? '' : bottomTextFor(client, product)
      });
      refreshed += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`Skipped ${product.code || product.id || 'product'}: ${error.message}`);
    }
  }
}

console.log(JSON.stringify({ refreshed, skipped }));
