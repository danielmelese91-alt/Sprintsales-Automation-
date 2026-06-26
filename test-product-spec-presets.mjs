import assert from 'node:assert/strict';
import { productSpecGroupsProfile } from './src/config/product-spec-presets.js';

const shoes = productSpecGroupsProfile('Fashion', 'Shoes', 'Men sneakers');
assert.equal(shoes[0].label, 'Color');
assert.equal(shoes[1].label, 'Shoe Size');
assert.ok(shoes[1].values.includes('41'));
assert.equal(shoes.some(group => group.label === 'RAM'), false);

const laptop = productSpecGroupsProfile('Electronics', 'Computers & Laptops', 'HP EliteBook laptop');
const laptopLabels = laptop.map(group => group.label);
assert.deepEqual(laptopLabels, ['Color', 'Storage', 'RAM', 'Screen Size', 'Condition']);
assert.ok(laptop.find(group => group.label === 'Storage').values.includes('512GB'));
assert.ok(laptop.find(group => group.label === 'RAM').values.includes('16GB RAM'));
assert.ok(laptop.find(group => group.label === 'Screen Size').values.includes('15.6 inch'));

const phone = productSpecGroupsProfile('Electronics', 'Mobile Phones', 'Samsung phone');
assert.ok(phone.find(group => group.label === 'RAM').values.includes('8GB RAM'));
assert.ok(phone.find(group => group.label === 'Screen Size').values.includes('6.7 inch'));

const jeans = productSpecGroupsProfile('Fashion', "Men's Clothing", 'Regular jeans');
assert.equal(jeans[0].label, 'Jeans Color');
assert.equal(jeans[1].label, 'Waist Size');
assert.ok(jeans[1].values.includes('32'));

console.log('product spec preset tests passed');
