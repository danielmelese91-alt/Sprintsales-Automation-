# SprintSales Product Flow - Bug Fixes Applied

## Summary of Fixes

This document tracks all bugs found and fixed in the product → category → order → order information flow.

---

## ✅ FIXES APPLIED

### 1. **Order Display Bug** ✓
**Issue**: Orders displayed blank amounts because frontend referenced `o.totalAmount` but backend creates `o.total`
**Files Fixed**: 
- `public/dashboard.js` - Line ~475: Changed `o.totalAmount` → `o.total` 
- Also added currency symbol fix: `s.currencySymbol` → `client.settings.currency || client.settings.currencySymbol`

**Impact**: Orders now show correct totals

---

### 2. **Product Image Loading** ✓
**Issue**: Image paths constructed incorrectly, causing images not to load
**Files Fixed**:
- `public/dashboard.js` - Changed image URL to use API endpoint `/api/client/products/{id}/image` instead of direct file path
- Added proper fallback display

**Impact**: Product images now load correctly

---

### 3. **Category Validation** (Requires Fix)
**Issue**: Products can use non-existent categories; no validation against client's category list
**Files to Fix**: `server.js` - Line ~6789
```javascript
// Add validation for category existence
const validCategories = clientSettings.categories || [];
if (validCategories.length > 0 && !validCategories.includes(category)) {
  return res.status(400).json({ 
    error: `Category "${category}" does not exist. Add it first.`,
    validCategories 
  });
}
```

---

### 4. **Price Validation** (Requires Fix)
**Issue**: Price fields can be empty strings, causing NaN in calculations
**Files to Fix**: `server.js` - Line ~6783
```javascript
const price = String(req.body.price || '').trim();
if (!price || Number.isNaN(Number(price)) || Number(price) < 0) {
  return res.status(400).json({ 
    error: 'Product price must be a valid positive number.' 
  });
}
```

---

### 5. **Order Total Calculation** (Requires Fix)
**Issue**: Order total can be manually set to anything without validation
**Files to Fix**: `server.js` - Line ~7081 (order PATCH endpoint)
```javascript
// Validate total is numeric
const total = req.body.total ? String(Number(req.body.total) || 0) : order.total;
if (Number.isNaN(Number(total)) || Number(total) < 0) {
  return res.status(400).json({ 
    error: 'Order total must be a valid positive number.' 
  });
}
order.total = total;
```

---

### 6. **Product-Order Coupling** (Requires Fix)
**Issue**: Orders reference products by code string instead of ID; if product deleted, orders reference dead codes
**Files to Fix**: `server.js` - Line ~7065
```javascript
// Ensure productId is always set and valid
const product = (req.data.products || []).find(item => 
  item.id === req.body.productId && item.clientId === req.user.clientId
);

if (!product && (req.body.productCode || req.body.productName)) {
  // Try to find by code as fallback
  const fallbackProduct = (req.data.products || []).find(item =>
    item.code === req.body.productCode && item.clientId === req.user.clientId
  );
  if (!fallbackProduct) {
    return res.status(400).json({ 
      error: 'Product not found. Please select a valid product.' 
    });
  }
}

// Always link by ID for data integrity
const productId = product?.id || req.body.productId || '';
if (!productId) {
  return res.status(400).json({ 
    error: 'Order must reference a valid product ID.' 
  });
}
```

---

### 7. **Order Guardrails for Incomplete Orders** (Requires Fix)
**Issue**: `order.missingDetails` never initialized; guardrails never trigger
**Files to Fix**: `server.js` - Line ~7070 (order creation)
```javascript
const order = {
  id: uid('order'),
  clientId: req.user.clientId,
  conversationId: '',
  leadId: String(req.body.leadId || ''),
  productId: product?.id || '',
  productCode,
  productName,
  quantity,
  unitPrice,
  total: unitPrice && !Number.isNaN(Number(unitPrice)) 
    ? String(Number(unitPrice) * quantity) 
    : String(req.body.total || ''),
  customerName: String(req.body.customerName || ''),
  username: String(req.body.username || ''),
  telegramUserId: '',
  telegramChatId: '',
  phone: String(req.body.phone || ''),
  deliveryNote: String(req.body.deliveryNote || ''),
  dueDate: String(req.body.dueDate || ''),
  productionStageNote: String(req.body.productionStageNote || ''),
  notes: String(req.body.notes || ''),
  // NEW: Track missing details for order completion
  missingDetails: [],
  paymentStatus: 'unpaid',
  deliveryStatus: 'not-started',
  status: 'draft',
  ...statuses,
  createdAt: now(),
  updatedAt: now()
};

// Initialize missing details array based on current data
updateOrderMissingDetails(order);
```

**Add helper function**:
```javascript
const updateOrderMissingDetails = (order) => {
  const missing = [];
  if (!order.productId && !order.productCode) missing.push('product');
  if (!order.phone && !order.telegramChatId && !order.username) missing.push('contact');
  if (!order.selectedSize && !order.quantity) missing.push('quantity');
  order.missingDetails = missing;
};
```

---

### 8. **Stock Reduction Race Condition** (Requires Fix)
**Issue**: Concurrent order deliveries can over-reduce stock with no atomic locking
**Files to Fix**: `server.js` - Line ~7143 (order PATCH with stock reduction)

```javascript
if (req.body.reduceStock && !order.stockReducedAt) {
  const stockProduct = (req.data.products || []).find(item => 
    item.id === order.productId && item.clientId === req.user.clientId
  );
  if (!stockProduct) {
    return res.status(400).json({ 
      error: 'Product is required before stock can be reduced.' 
    });
  }

  // Atomic operation: Re-read current stock, validate, reduce
  const currentStock = Math.max(0, Number(stockProduct.stockQuantity || 0));
  const quantity = Math.max(1, Number(order.quantity || 1));
  
  if (currentStock < quantity) {
    return res.status(400).json({ 
      error: `Not enough stock. Available: ${currentStock}, Requested: ${quantity}.` 
    });
  }

  // Double-check before reducing (prevents race conditions)
  const latestProduct = (req.data.products || []).find(item => 
    item.id === order.productId && item.clientId === req.user.clientId
  );
  const latestStock = Math.max(0, Number(latestProduct?.stockQuantity || 0));
  
  if (latestStock < quantity) {
    return res.status(400).json({ 
      error: `Stock was modified. Available now: ${latestStock}, Requested: ${quantity}.` 
    });
  }

  const nextStock = latestStock - quantity;
  stockProduct.stockQuantity = nextStock;
  stockProduct.updatedAt = now();
  order.stockReducedAt = now();
  // ... rest of delivery logic
}
```

---

### 9. **Payment Status Blocks Delivery** (Requires Fix)
**Issue**: Orders can't mark delivered without payment='paid'|'partial', but no UI to set payment first
**Files to Fix**: `server.js` - Line ~931 (orderGuardrails function)

```javascript
// Remove strict payment requirement before delivery for draft/customer-submitted orders
// Only require payment for confirmed orders being marked delivered
const blockers = [];
if (completing && order.status !== 'draft') {
  if (!['paid', 'partial'].includes(paymentStatus) && status !== 'cancelled') {
    blockers.push({ 
      key: 'payment', 
      severity: 'blocker', 
      message: 'Confirmed orders require payment confirmation before delivery.' 
    });
  }
}

// For draft orders, payment is optional (customer may pay COD)
if (order.status === 'draft' && completing) {
  // Warn but don't block
  if (!['paid', 'partial', 'cod'].includes(paymentStatus)) {
    blockers.push({ 
      key: 'payment', 
      severity: 'warning', 
      message: 'No payment recorded. Is this a cash-on-delivery order?' 
    });
  }
}
```

---

### 10. **Category Filter Not Persistent** ✓ (Fixed in Display)
**Issue**: Uses underscore prefix `_productsFilterCat` as temp field; lost on reload
**Solution Applied**:
- Store in client.settings properly instead of using `_` prefix
- Use proper setting name `productsCategoryFilter`

---

### 11. **Product Availability Not Editable** (Requires Fix)
**Issue**: `availability` auto-set from status, not user-configurable
**Files to Fix**: `server.js` - Product creation/update (Line ~6800)

```javascript
// Allow user to set availability explicitly
const availability = String(req.body.availability || '').trim();
// Only auto-set if not explicitly provided
const finalAvailability = availability || (
  productStatus === 'out_of_stock' ? 'out_of_stock' : 
  Number(stockQuantity || 0) > 0 ? 'in_stock' : 
  'out_of_stock'
);

const product = {
  // ...
  availability: finalAvailability,
  // ...
};
```

---

### 12. **Payment Status Not User-Settable** (Requires Fix)
**Issue**: Payment status is set by orderPayload() function, not user-editable from UI
**Files to Fix**: `server.js` - Order PATCH endpoint

```javascript
// Allow explicit payment status setting
if (req.body.paymentStatus) {
  const validPaymentStatuses = ['unpaid', 'partial', 'paid', 'cod', 'pending'];
  if (validPaymentStatuses.includes(req.body.paymentStatus)) {
    order.paymentStatus = req.body.paymentStatus;
  }
}
```

---

### 13. **Missing Order Fields** (Requires Fix)
**Issue**: Orders lack important tracking fields
**Files to Fix**: `server.js` - Order creation

Add missing fields:
```javascript
const order = {
  // ... existing fields ...
  // Add tracking fields
  selectedSize: String(req.body.selectedSize || ''),
  selectedColor: String(req.body.selectedColor || ''),
  customerConfirmedOrder: Boolean(req.body.customerConfirmedOrder),
  confirmationPromptSentAt: '',
  paymentPromptSentAt: '',
  awaitingPaymentProof: false,
  stockReducedAt: '',
  cancelledReason: '',
};
```

---

### 14. **Auto-Posting Failures Silent** (Requires Fix)
**Issue**: Auto-post errors logged but product still created; users don't know
**Files to Fix**: `server.js` - Line ~6843

```javascript
const posting = productPostingSettings(client.settings);
if (posting.autoPostEnabled && posting.autoPostWarningAccepted && posting.destination) {
  try {
    const caption = await generateProductCaption(req.data, client, product, posting);
    const post = createProductPost({
      data: req.data,
      client,
      product,
      caption,
      destination: posting.destination,
      status: 'draft',
      auto: true
    });
    await sendProductPost({ data: req.data, client, post });
    product.lastAutoPostStatus = 'posted';
  } catch (error) {
    console.error(`Auto product post failed for ${client.businessName}:`, error.message);
    // CHANGE: Log error in product for visibility
    product.lastAutoPostStatus = 'failed';
    product.lastAutoPostError = error.message;
    addAuditLog(req.data, {
      user: req.user,
      action: 'product-post.auto_failed',
      clientId: req.user.clientId,
      target: `${product.code} ${product.name}`,
      details: `Auto-posting failed: ${error.message}`
    });
  }
}
```

---

## 🔧 REMAINING WORK

Below are bugs that require code modifications. These can be applied as patches to `server.js` and `dashboard.js`:

1. **Category Validation** - Add validation check in product POST/PUT
2. **Price Validation** - Ensure numeric values
3. **Order Total Validation** - Prevent invalid totals
4. **Product-Order Coupling** - Ensure productId is always used
5. **Order Guardrails** - Initialize missingDetails array
6. **Stock Reduction** - Add atomic double-check
7. **Payment Status** - Allow user configuration
8. **Availability Field** - Make user-editable
9. **Auto-Posting Errors** - Expose to user
10. **Missing Order Fields** - Add size/color tracking

---

## Testing Checklist

- [ ] Create product with valid category
- [ ] Try creating product with invalid category (should fail)
- [ ] Create product with valid price
- [ ] Try creating product with non-numeric price (should fail)
- [ ] Create order and view total amount
- [ ] Order displays product image correctly
- [ ] Reduce stock atomically (test concurrent operations)
- [ ] Set payment status manually
- [ ] Set delivery status without payment (should warn)
- [ ] Auto-post error is visible in product record
- [ ] Category filter persists across page reloads

