import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMiniappRoutes } from './src/routes/miniapp-routes.js';
import { createProductService } from './src/services/product-service.js';
import { defaultSettings, isProductBusiness } from './src/config/defaults.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sprintsales-miniapp-'));
const publicDir = path.join(tmp, 'public');
await fs.mkdir(path.join(publicDir, 'miniapp'), { recursive: true });
await fs.writeFile(path.join(publicDir, 'miniapp', 'index.html'), '<!doctype html><title>MiniApp</title>');

const client = {
  id: 'client_1',
  businessName: 'Demo Retail Shop',
  status: 'active',
  settings: {
    ...defaultSettings(),
    botUsername: '@DemoShopBot',
    businessLogoUrl: '/uploads/products/client_1/logo.png',
    businessProfile: {
      ...defaultSettings().businessProfile,
      businessType: 'retail',
      summary: 'A test shop'
    },
    miniapp: {
      enabled: true,
      slug: '',
      template: 'clean-retail',
      themeColor: '#0f2a52',
      accentColor: '#14b8a6'
    }
  }
};

const data = {
  clients: [
    client,
    { id: 'client_pending', businessName: 'Pending Shop', status: 'pending', settings: defaultSettings() }
  ],
  products: [
    {
      id: 'p_active',
      clientId: 'client_1',
      name: 'Smart Fitness Watch',
      code: 'SW-200',
      price: 4500,
      category: 'Electronics',
      subcategory: 'Wearables',
      isActive: true,
      images: [{ publicPath: 'watch.watermarked.jpg' }],
      colors: ['Black']
    },
    {
      id: 'p_inactive',
      clientId: 'client_1',
      name: 'Hidden Product',
      code: 'HP-1',
      price: 1,
      category: 'Electronics',
      isActive: false
    }
  ]
};

const { activeClientProducts } = createProductService({
  clientFor: (fresh, id) => fresh.clients.find(item => item.id === id),
  isProductBusiness,
  defaultSettings
});

const app = express();
app.use(createMiniappRoutes({
  publicDir,
  readData: async () => structuredClone(data),
  isProductBusiness,
  activeClientProducts
}));

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const catalogResponse = await fetch(`${base}/api/miniapp/shop/demo-retail-shop`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.shop.businessName, 'Demo Retail Shop');
  assert.equal(catalog.shop.slug, 'demo-retail-shop');
  assert.equal(catalog.shop.botUsername, 'DemoShopBot');
  assert.equal(catalog.products.length, 1);
  assert.equal(catalog.products[0].id, 'p_active');
  assert.equal(catalog.products[0].images[0], '/uploads/products/client_1/watch.watermarked.jpg');
  assert.equal(catalog.categories[0].name, 'Electronics');

  const pendingResponse = await fetch(`${base}/api/miniapp/shop/pending-shop`);
  assert.equal(pendingResponse.status, 404);

  const pageResponse = await fetch(`${base}/shop/demo-retail-shop`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /doctype html/i);
} finally {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
}

console.log('miniapp route tests passed');
