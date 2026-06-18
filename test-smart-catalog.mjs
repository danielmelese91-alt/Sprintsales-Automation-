import assert from 'node:assert/strict';
import { createProductService } from './src/services/product-service.js';

const service = createProductService({
  clientFor: () => ({ settings: {}, businessProfile: { businessType: 'retail' } }),
  isProductBusiness: () => true,
  defaultSettings: () => ({ productPosting: {} })
});

const data = {
  products: [
    { id: '1', clientId: 'c1', name: 'Dress', code: 'D-001', category: 'Women\'s Clothing', subcategory: 'Women\'s dresses', isActive: true },
    { id: '2', clientId: 'c1', name: 'Heel', code: 'S-001', category: 'Shoes', subcategory: 'Women\'s heels', isActive: true },
    { id: '3', clientId: 'c1', name: 'Hidden Bag', code: 'B-001', category: 'Bags', subcategory: 'Tote bags', isActive: false },
    { id: '4', clientId: 'c2', name: 'Other Tenant Phone', code: 'P-001', category: 'Mobile Phones', subcategory: 'iPhones', isActive: true }
  ]
};

const populated = service.getPopulatedCategories(data, 'c1');
assert.deepEqual(populated.map(item => item.name), ['Shoes', 'Women\'s Clothing']);
assert.equal(populated.find(item => item.name === 'Women\'s Clothing').productCount, 1);
assert.equal(populated.find(item => item.name === 'Women\'s Clothing').subcategories[0].name, 'Women\'s dresses');
assert.ok(!populated.find(item => item.name === 'Bags'), 'inactive product categories should not be shown');
assert.ok(!populated.find(item => item.name === 'Mobile Phones'), 'other tenant categories should not be shown');

console.log('smart catalog tests passed');

