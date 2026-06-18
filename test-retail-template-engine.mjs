import assert from 'node:assert/strict';
import {
  categoryContextFromSettings,
  cloneRetailTemplateCategories,
  formatCategoryContextForPrompt,
  getRetailCategoryNames,
  iconForRetailLabel,
  validateCategorySelection
} from './src/config/retail-templates.js';

const fashionCategories = getRetailCategoryNames('fashion boutique');
assert.ok(fashionCategories.includes('Women\'s Clothing'));
assert.ok(fashionCategories.includes('Shoes'));

const electronicsTemplate = cloneRetailTemplateCategories('electronics');
const mobilePhones = electronicsTemplate.find(item => item.name === 'Mobile Phones');
assert.ok(mobilePhones?.subcategories.includes('iPhones'));
assert.equal(mobilePhones?.icon, '📱');
assert.equal(electronicsTemplate.find(item => item.name === 'Computers & Laptops')?.icon, '💻');
assert.equal(mobilePhones?.subcategoryIcons.iPhones, '📱');
assert.equal(mobilePhones?.subcategoryIcons.Samsung, '📱');
assert.equal(mobilePhones?.subcategoryIcons.Tecno, '📱');
assert.equal(iconForRetailLabel('Women\'s dresses'), '👗');
assert.equal(iconForRetailLabel('Women\'s jeans'), '👖');
assert.equal(iconForRetailLabel('Air fryers'), '🍳');
assert.equal(iconForRetailLabel('Unknown category'), '📦');

const context = categoryContextFromSettings({ categoryTemplates: electronicsTemplate });
assert.match(formatCategoryContextForPrompt(context), /Mobile Phones: iPhones/);

assert.deepEqual(
  validateCategorySelection({ selectedCategory: 'Mobile Phones', selectedSubcategory: 'iPhones' }, context),
  { selectedCategory: 'Mobile Phones', selectedSubcategory: 'iPhones' }
);
assert.deepEqual(
  validateCategorySelection({ selectedCategory: 'Imaginary Category', selectedSubcategory: 'Made Up' }, context),
  { selectedCategory: '', selectedSubcategory: '' }
);
assert.deepEqual(
  validateCategorySelection({ selectedCategory: 'Mobile Phones', selectedSubcategory: 'Made Up' }, context),
  { selectedCategory: 'Mobile Phones', selectedSubcategory: '' }
);

console.log('retail template engine tests passed');
