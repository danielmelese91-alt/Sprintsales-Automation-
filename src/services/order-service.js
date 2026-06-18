export function createOrderService(deps = {}) {
  const { numberFromMoney: moneyParser, productPrice } = deps;
  const numberFromMoney = moneyParser || (value => {
    const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : 0;
  });

  const orderQuantity = value => Math.max(1, Number(value || 1));

  const orderUnitPrice = (body = {}, product = {}, existing = {}) => String(
    body.unitPrice || existing.unitPrice || (productPrice ? productPrice(product) : product?.price) || ''
  );

  const orderLineTotal = ({ unitPrice = '', quantity = 1, fallbackTotal = '' } = {}) => (
    unitPrice && !Number.isNaN(Number(unitPrice)) ? String(Number(unitPrice) * orderQuantity(quantity)) : String(fallbackTotal || '')
  );

  const orderRevenue = order => numberFromMoney(order.total) || numberFromMoney(order.unitPrice) * orderQuantity(order.quantity);

  const orderCost = (order, products) => {
    const product = products.find(item => item.id === order.productId || (item.code && item.code === order.productCode));
    return numberFromMoney(product?.costPrice) * orderQuantity(order.quantity);
  };

  const orderGuardrails = (order, product = null, options = {}) => {
    const checks = [];
    const paymentStatus = order.paymentStatus || 'unpaid';
    const status = order.status || 'draft';
    const deliveryStatus = order.deliveryStatus || 'not-started';
    const completing = status === 'delivered' || deliveryStatus === 'delivered';
    const hasProduct = Boolean(order.productId || order.productCode || product);
    const hasContact = Boolean(order.phone || order.telegramChatId || order.username);
    const hasDeliveryPlan = Boolean(order.deliveryNote || order.deliveryLocation || ['pickup', 'delivered'].includes(deliveryStatus));
    if (!hasProduct) checks.push({ key: 'product', severity: 'blocker', message: 'Choose a product before completing this order.' });
    if (!hasContact) checks.push({ key: 'contact', severity: 'blocker', message: 'Add a customer phone, username, or Telegram chat before completing this order.' });
    if ((order.missingDetails || []).length) checks.push({ key: 'missing-details', severity: 'blocker', message: `Collect missing order details first: ${order.missingDetails.join(', ')}.` });
    // For draft orders, payment is optional (may be cash-on-delivery)
    // For confirmed orders, payment is required before delivery
    if (completing && order.status !== 'draft' && !['paid', 'partial'].includes(paymentStatus) && status !== 'cancelled') {
      checks.push({ key: 'payment', severity: 'blocker', message: 'Confirm payment before marking this order delivered.' });
    }
    if (completing && order.status === 'draft' && !['paid', 'partial', 'cod'].includes(paymentStatus)) {
      checks.push({ key: 'payment', severity: 'warning', message: 'No payment recorded. Is this a cash-on-delivery order?' });
    }
    if (!hasDeliveryPlan && status !== 'cancelled') checks.push({ key: 'delivery', severity: completing ? 'blocker' : 'warning', message: 'Add a delivery note or pickup plan before handoff.' });
    if (completing && product && !order.stockReducedAt && Number(product.stockQuantity || 0) < orderQuantity(order.quantity)) checks.push({ key: 'stock-shortage', severity: 'blocker', message: `Not enough stock. Current stock is ${Number(product.stockQuantity || 0)}.` });
    if (completing && product && !order.stockReducedAt && !options.reducingStock) checks.push({ key: 'stock-not-reduced', severity: 'blocker', message: 'Use "Mark delivered + reduce stock" so inventory is updated correctly.' });
    if (order.stockReducedAt) checks.push({ key: 'stock', severity: 'warning', message: 'Stock was already reduced for this order.' });
    return checks;
  };

  const orderPayload = (body, existing = {}) => {
    const status = ['draft', 'confirmed', 'paid', 'packed', 'delivered', 'cancelled'].includes(body.status) ? body.status : (existing.status || 'draft');
    const paymentStatus = ['unpaid', 'partial', 'paid', 'refunded'].includes(body.paymentStatus) ? body.paymentStatus : (existing.paymentStatus || 'unpaid');
    const deliveryStatus = ['not-started', 'pending', 'packed', 'out-for-delivery', 'delivered', 'pickup', 'cancelled'].includes(body.deliveryStatus) ? body.deliveryStatus : (existing.deliveryStatus || 'not-started');
    const productionStage = ['not-started', 'sourcing', 'in-production', 'quality-check', 'ready', 'delivered', 'cancelled'].includes(body.productionStage) ? body.productionStage : (existing.productionStage || 'not-started');
    return { status, paymentStatus, deliveryStatus, productionStage };
  };

  return {
    orderQuantity,
    orderUnitPrice,
    orderLineTotal,
    orderRevenue,
    orderCost,
    orderGuardrails,
    orderPayload
  };
}
