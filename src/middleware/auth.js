import crypto from 'node:crypto';

export function createAuthMiddleware(deps) {
  const {
    sessionSecret,
    readData,
    clientFor,
    isProductBusiness
  } = deps;

  const signedSession = value => crypto
    .createHmac('sha256', sessionSecret)
    .update(value)
    .digest('hex');

  const signaturesMatch = (a, b) => {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  };

  const makeSession = user => {
    const payload = Buffer.from(JSON.stringify({
      userId: user.id,
      role: user.role,
      clientId: user.clientId,
      exp: Date.now() + 1000 * 60 * 60 * 12
    })).toString('base64url');
    return `${payload}.${signedSession(payload)}`;
  };

  const parseSession = token => {
    if (!token || !token.includes('.')) return null;
    const [payload, signature] = token.split('.');
    if (!signaturesMatch(signedSession(payload), signature)) return null;
    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return session.exp > Date.now() ? session : null;
    } catch {
      return null;
    }
  };

  const requireAuth = role => async (req, res, next) => {
    const session = parseSession(req.signedCookies.session);
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    if (role && session.role !== role) return res.status(403).json({ error: 'Access denied' });
    const data = await readData();
    const user = data.users.find(item => item.id === session.userId);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    if (session.role !== user.role) return res.status(401).json({ error: 'Session role changed. Please log in again.' });
    req.session = session;
    req.user = user;
    req.data = data;
    next();
  };

  const requireProductBusiness = async (req, res, next) => {
    const client = clientFor(req.data, req.user.clientId);
    if (!isProductBusiness(client)) return res.status(400).json({ error: 'This feature is available only for product-selling businesses.' });
    next();
  };

  const clientCanAct = (client) => {
    if (!client) return false;
    if (client.billing?.status === 'suspended') return false;
    if (client.status === 'active') return true;
    // pending, rejected, suspended — view only, no write actions
    return false;
  };

  const requireActiveClient = () => async (req, res, next) => {
    const client = clientFor(req.data, req.user.clientId || req.params.clientId);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!clientCanAct(client)) {
      const label = client.billing?.status === 'suspended' ? 'billing suspended' :
        client.status === 'pending' ? 'pending approval' :
          client.status === 'rejected' ? 'rejected' : 'suspended';
      return res.status(403).json({
        error: `Account is ${label}`,
        status: client.status,
        billingStatus: client.billing?.status || '',
        message: client.billing?.status === 'suspended'
          ? 'Your subscription is suspended. Please contact SprintSales to reactivate your service.'
          : client.status === 'pending'
            ? 'Your account is waiting for admin approval. You can explore the dashboard, but features will activate after approval.'
            : client.status === 'rejected'
              ? 'Your registration was not approved. Please contact SprintSales.'
              : 'Your account has been suspended. Please contact SprintSales.'
      });
    }
    next();
  };

  return {
    signedSession,
    makeSession,
    parseSession,
    requireAuth,
    requireProductBusiness,
    clientCanAct,
    requireActiveClient
  };
}
