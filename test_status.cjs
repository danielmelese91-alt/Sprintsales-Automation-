const http = require('http');

function req(method, path, body, cookies) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 8080, path, method, headers: { 'Content-Type': 'application/json' } };
    if (cookies) opts.headers.Cookie = cookies;
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ headers: res.headers, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const login = await req('POST', '/api/login', { email: 'demo@sprintsales.net', password: 'demo12345' });
  const cookies = (login.headers['set-cookie'] || []).join('; ');
  
  const status = await req('GET', '/api/client/bot/status', null, cookies);
  console.log('Bot Status:', status.body);
  
  // Also check bot health endpoint
  const profile = await req('GET', '/api/client/profile', null, cookies);
  const p = JSON.parse(profile.body);
  if (p.client) {
    console.log('Business Name:', p.client.businessName);
    console.log('Business Type:', p.client.settings?.businessProfile?.businessType);
    console.log('Is Active:', p.client.settings?.isActive);
    console.log('Status:', p.client.status);
    console.log('Bot Token configured:', p.client.settings?.botToken ? 'YES (length ' + p.client.settings.botToken.length + ')' : 'NO');
  }
})().catch(e => console.error(e));
