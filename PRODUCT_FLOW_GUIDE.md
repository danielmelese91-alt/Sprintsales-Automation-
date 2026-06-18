# SprintSales Product Flow - Quick Reference Guide

## ✅ Complete Product Lifecycle (Now Fixed)

```
1. PRODUCT SETUP
   ├─ Create Category (Settings)
   │  └─ Category added to client.settings.categories[]
   │
   ├─ Create Product
   │  ├─ ✓ Code validation (unique per client)
   │  ├─ ✓ Name validation (required)
   │  ├─ ✓ Price validation (numeric, >0)
   │  ├─ ✓ Category validation (must exist)
   │  ├─ ✓ Image upload (via multipart form)
   │  └─ ✓ Auto-post tracking
   │
   └─ Product Fields Set
      ├─ id (uid('product'))
      ├─ clientId (linked to client)
      ├─ code (uppercase, unique)
      ├─ price (numeric)
      ├─ stockQuantity (updated on order delivery)
      ├─ category (validated against allowed)
      ├─ sizes (optional comma-separated)
      ├─ colors (optional comma-separated)
      └─ lastAutoPostStatus & lastAutoPostError

2. ORDER WORKFLOW (Product-Centric)
   ├─ Create Order
   │  ├─ Product Selection
   │  │  ├─ Lookup by productId (primary key)
   │  │  └─ Fallback by productCode
   │  │
   │  ├─ ✓ Validate product exists
   │  ├─ ✓ Populate productId + productCode + productName
   │  ├─ ✓ Calculate unit price from product
   │  ├─ ✓ Calculate total = unitPrice × quantity
   │  └─ ✓ Initialize missingDetails array
   │
   └─ Order Created With
      ├─ productId (primary reference ✓ NEW)
      ├─ productCode (fallback reference)
      ├─ productName (display)
      ├─ quantity (validated >0)
      ├─ unitPrice (from product or manual)
      ├─ total (calculated, validated)
      ├─ customerName, phone, username (customer info)
      ├─ selectedSize, selectedColor (tracking ✓ NEW)
      ├─ missingDetails (array: ['size','color','phone'] ✓ NEW)
      ├─ paymentStatus (unpaid/partial/paid/cod)
      ├─ deliveryStatus (not-started/packed/out-for-delivery/delivered)
      ├─ status (draft/confirmed/delivered/cancelled)
      └─ tracking: customerConfirmedOrder, stockReducedAt, etc. ✓ NEW

3. ORDER DETAIL COLLECTION
   └─ Each customer message triggers collection of:
      ├─ Size (if product has sizes)
      ├─ Color (if product has colors)
      ├─ Quantity (parsed from message)
      ├─ Phone number (parsed or requested)
      ├─ Delivery location (parsed or requested)
      └─ Updates missingDetails[] as each collected

4. ORDER CONFIRMATION FLOW
   ├─ Bot asks for confirmation
   ├─ Customer confirms (customerConfirmedOrder = true ✓ NEW)
   ├─ Payment instructions sent
   ├─ Customer sends payment proof
   └─ Payment verified and status set

5. ORDER PAYMENT STATUS
   Draft Order:
   ├─ Can be delivered without payment (COD)
   └─ ✓ FIXED: Warns if no payment, doesn't block
   
   Confirmed Order:
   ├─ Requires payment before delivery
   └─ ✓ FIXED: Blocks delivery until paid/partial set

6. ORDER DELIVERY & STOCK
   ├─ Mark "Delivered + Reduce Stock" action
   │  ├─ ✓ FIXED: Atomic double-check for race conditions
   │  ├─ ✓ Check current stock
   │  ├─ ✓ Verify not modified by concurrent order
   │  ├─ ✓ Atomically reduce (latestStock - quantity)
   │  ├─ ✓ Record in stockMovements[]
   │  ├─ ✓ Set order.stockReducedAt = now()
   │  └─ ✓ Auto-create review reminder 3 days out
   │
   └─ Stock reduced, order delivered, customers notified

7. ORDER VIEW DISPLAY
   ├─ Order ID: o.id
   ├─ Product: o.productName (from product at order creation)
   ├─ Quantity: o.quantity
   ├─ Amount: o.total (✓ FIXED: was o.totalAmount)
   ├─ Currency: client.settings.currency (✓ FIXED: was undefined)
   ├─ Status: o.status (draft/confirmed/delivered/cancelled)
   ├─ Payment: o.paymentStatus
   ├─ Delivery: o.deliveryStatus
   └─ Missing: o.missingDetails (items needed for completion ✓ NEW)
```

---

## 🔧 Key Fixes by Component

### Frontend (public/dashboard.js)

| Issue | Before | After | Line |
|-------|--------|-------|------|
| Order Amount | `o.totalAmount` (undefined) | `o.total` (correct field) | ~475 |
| Currency | `s.currencySymbol` (undefined) | `client.settings.currency` (correct) | ~475 |
| Product Image | Direct file path (broken) | API endpoint `/api/client/products/{id}/image` | ~175 |
| Category Filter | `_productsFilterCat` (temp, lost on reload) | `productsCategoryFilter` (persisted) | ~218-220 |
| Product Form | No category validation | Shows error if category invalid | ~260+ |

### Backend (server.js)

| Issue | Fix | Impact |
|-------|-----|--------|
| **Category Validation** | Check exists in `client.settings.categories` | Prevents invalid categories |
| **Price Validation** | Numeric check `!Number.isNaN(Number(price))` | Prevents NaN calculations |
| **Order Product Link** | Store `productId` + `productCode` + validation | Strong coupling, no data orphaning |
| **Order Details** | Initialize `missingDetails[]` array | Guardrails work for orders |
| **Stock Race Condition** | Atomic double-check before reduction | Concurrent orders safe |
| **Payment Workflow** | Smart blocking (draft allows COD, confirmed needs payment) | Flexible delivery options |
| **Auto-Post Errors** | Track in `product.lastAutoPostStatus/Error` | User visibility |

---

## 📊 Data Model Improvements

### Product Object

```javascript
{
  id: "product_xyz",
  clientId: "client_123",
  code: "ELEC-001",
  name: "Smartphone",
  price: "2500",              // ✓ Validated numeric
  costPrice: "1500",
  category: "Electronics",     // ✓ Validated against allowed
  stockQuantity: 10,          // ✓ Reduced atomically on order delivery
  sizes: "S,M,L,XL",
  colors: "Black,White,Red",
  description: "...",
  imagePath: "/uploads/...",
  lastAutoPostStatus: "posted", // ✓ NEW: Failure tracking
  lastAutoPostError: "",        // ✓ NEW: Error details
  isActive: true,
  createdAt: "2026-05-12T..."
}
```

### Order Object

```javascript
{
  id: "order_abc",
  clientId: "client_123",
  productId: "product_xyz",      // ✓ NEW: Primary reference
  productCode: "ELEC-001",       // ✓ NEW: Fallback reference
  productName: "Smartphone",
  quantity: 1,
  unitPrice: "2500",             // ✓ Validated numeric
  total: "2500",                 // ✓ Validated numeric
  customerName: "Ahmed",
  phone: "+251912345678",
  selectedSize: "M",             // ✓ NEW: Tracking
  selectedColor: "Black",        // ✓ NEW: Tracking
  missingDetails: [],            // ✓ NEW: For guardrails
  paymentStatus: "unpaid",       // unpaid/partial/paid/cod
  deliveryStatus: "not-started", // not-started/packed/out-for-delivery/delivered
  status: "draft",               // draft/confirmed/delivered/cancelled
  customerConfirmedOrder: false, // ✓ NEW: Completion tracking
  stockReducedAt: "",            // ✓ NEW: Delivery timestamp
  cancelledReason: "",           // ✓ NEW: Why cancelled
  createdAt: "2026-05-12T...",
  updatedAt: "2026-05-12T..."
}
```

---

## 🚀 Usage Instructions

### Creating a Product

```
1. Go to Products tab
2. Click "Add Product"
3. Enter:
   - Code: ELEC-001 (required, unique)
   - Name: iPhone 15 (required)
   - Category: Electronics (✓ FIXED: must exist in your categories)
   - Price: 2500 (✓ FIXED: must be numeric, >0)
   - Stock: 10
   - Sizes: S,M,L,XL (optional)
   - Colors: Black,White (optional)
   - Image: (optional, will auto-post if enabled)
4. Click "Add Product"
   - Product created with proper validations
   - Auto-post attempted (✓ FIXED: error visible if failed)
```

### Creating an Order

```
1. Go to Orders tab
2. Click "Add Order"
3. Select Product: (✓ FIXED: validates product exists by ID)
4. Enter quantity: 1
5. Auto-populates: Price from product
6. Enter customer info: Name, Phone
7. Order created as DRAFT
8. Bot will collect: Size, Color, Delivery Location
9. Customer confirms order details
10. Bot sends payment instructions
11. After payment received:
    - Set Payment Status: paid
    - Click "Mark Delivered + Reduce Stock"
    - (✓ FIXED: Atomic operation, safe from race conditions)
    - Stock reduces: 10 → 9
    - Auto-creates 3-day review reminder
```

### Why Products & Orders Are Linked

**Problem (Before)**: 
- Orders stored product as CODE string: "ELEC-001"
- If product deleted/updated, order became orphaned
- No way to tell which product the order was for

**Solution (After)** ✓:
- Orders store both `productId` (primary) and `productCode` (fallback)
- Foreign key validation ensures product exists
- Guaranteed data integrity throughout order lifecycle
- Product updates don't break orders (only the ID matters)

---

## ⚠️ Common Issues & Solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| "Category does not exist" error | Creating product with category not in Settings | Go to Products → Categories, add category first |
| Order amount shows as blank | Was using wrong field name | ✓ FIXED: Now uses `o.total` correctly |
| Order currency undefined | Getting from wrong location | ✓ FIXED: Gets from `client.settings.currency` |
| Product image won't load | Direct file path incorrect | ✓ FIXED: Uses API endpoint now |
| Can't deliver draft order | Was blocking all non-paid orders | ✓ FIXED: Draft orders can be COD |
| Stock oversold in concurrent orders | No atomic locking | ✓ FIXED: Atomic double-check implemented |
| Category filter lost on reload | Used temp field | ✓ FIXED: Persists in `productsCategoryFilter` |

---

## ✅ Validation Checklist for Each Action

### When Creating Product
- [ ] Code is unique (not used by another product)
- [ ] Name is not empty
- [ ] Price is numeric and > 0
- [ ] Category exists in your category list
- [ ] Image (if uploaded) is PNG/JPG/WEBP

### When Creating Order
- [ ] Product is selected and exists
- [ ] Quantity is > 0
- [ ] Unit price is numeric
- [ ] Total = unitPrice × quantity

### Before Marking Order Delivered
- [ ] Product is linked (by ID)
- [ ] Customer contact info exists (phone/username)
- [ ] Size selected (if product has sizes)
- [ ] Color selected (if product has colors)
- [ ] Delivery location specified
- [ ] Payment status set (for confirmed orders)

### Before Reducing Stock
- [ ] Stock is sufficient: available >= quantity
- [ ] No concurrent order is reducing this product
- [ ] Order status is confirmed/delivered

---

## 📈 System Health Checks

Run these to verify fixes are working:

```javascript
// 1. Verify category validation
Try creating product with non-existent category
→ Should error: "Category 'Nonexistent' does not exist..."

// 2. Verify order amount displays
Create order, view in orders list
→ Should show: "ETB 2500" (currency + total)

// 3. Verify product-order linking
Create product, create order from it, then update product
→ Order should still reference correct product

// 4. Verify stock atomicity
Create 2 orders for same product (stock=2)
Deliver both simultaneously
→ Should fail second one: "Stock modified by another order"

// 5. Verify category filter persistence
Filter products by category, reload page
→ Filter should still be applied
```

---

## Performance Notes

✅ All fixes maintain excellent performance:
- Category validation: Single array.includes() check - **O(n)** where n = categories count (~10-20)
- Price validation: Number parsing - **O(1)**
- Stock double-check: Second product lookup - **O(n)** where n = products count, only on delivery
- No new database queries or transactions added

---

## Next Steps (Optional Enhancements)

1. **Database Transactions**: For even stronger ACID guarantees (requires database setup)
2. **Inventory Sync**: Integration with inventory management systems
3. **Payment Gateway**: Automatic payment confirmation
4. **Stock Notifications**: Alert when stock is low
5. **Order Analytics**: Sales reports by product/category

