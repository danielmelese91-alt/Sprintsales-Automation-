// Approval & Registration Integration Tests
const BASE = 'http://localhost:8080';
let passed=0,failed=0;
async function doTest(name,fn){try{await fn();passed++;}catch(e){failed++;console.log('  FAIL:',name,'—',e.message)}}

let adminCookie='', clientCookie='', clientId='', clientEmail='';
const ts=Date.now().toString(36);

console.log('\n── J) Registration & Approval Flow Tests ──');

await doTest('J1: admin login', async ()=>{
  const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@sprintsales.net',password:'ChangeMe123!'})});
  const d=await r.json();
  if(r.status!==200)throw new Error('status '+r.status);
  if(d.user?.role!=='admin')throw new Error('not admin');
  adminCookie=r.headers.get('set-cookie')?.split(';')[0]||'';
  if(!adminCookie.includes('session'))throw new Error('no session cookie');
});

clientEmail='test'+ts+'@test.com';
await doTest('J2: register new business', async ()=>{
  const r=await fetch(BASE+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Test Owner',businessName:'Test Biz '+ts,businessType:'fashion',phone:'+2519'+ts.slice(-8),email:clientEmail,password:'test123'})});
  if(r.status!==200)throw new Error('status '+r.status);
  const d=await r.json();
  if(d.user?.role!=='client')throw new Error('not client');
  if(d.client?.status!=='pending')throw new Error('status not pending: '+d.client?.status);
  clientCookie=r.headers.get('set-cookie')?.split(';')[0]||'';
  clientId=d.client?.id;
  if(!clientId)throw new Error('no client id');
});

await doTest('J3: pending client can login', async ()=>{
  const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:clientEmail,password:'test123'})});
  if(r.status!==200)throw new Error('login status '+r.status);
});

await doTest('J4: pending client can read dashboard', async ()=>{
  const r=await fetch(BASE+'/api/client/dashboard',{headers:{Cookie:clientCookie}});
  if(r.status!==200)throw new Error('dashboard status '+r.status);
  const d=await r.json();
  if(d.client?.status!=='pending')throw new Error('status not pending');
});

await doTest('J5: pending client BLOCKED from PUT settings', async ()=>{
  const r=await fetch(BASE+'/api/client/settings',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:clientCookie},body:JSON.stringify({businessName:'X'})});
  if(r.status!==403)throw new Error('expected 403, got '+r.status);
});

await doTest('J6: pending client BLOCKED from POST products', async ()=>{
  const r=await fetch(BASE+'/api/client/products',{method:'POST',headers:{'Content-Type':'application/json',Cookie:clientCookie},body:JSON.stringify({name:'X'})});
  if(r.status!==403)throw new Error('expected 403, got '+r.status);
});

await doTest('J7: admin sees pending approvals', async ()=>{
  const r=await fetch(BASE+'/api/admin/pending-approvals',{headers:{Cookie:adminCookie}});
  if(r.status!==200)throw new Error('status '+r.status);
  const d=await r.json();
  if(!Array.isArray(d.pending))throw new Error('not array');
  const f=d.pending.find(p=>p.id===clientId);
  if(!f)throw new Error('test client not in pending list');
  if(f.businessType!=='fashion')throw new Error('wrong type: '+f.businessType);
});

await doTest('J8: admin approves client', async ()=>{
  const r=await fetch(BASE+'/api/admin/clients/'+clientId+'/approve',{method:'PATCH',headers:{Cookie:adminCookie}});
  if(r.status!==200)throw new Error('status '+r.status);
  const d=await r.json();
  if(d.status!=='active')throw new Error('status not active: '+d.status);
});

await doTest('J9: approved client removed from pending', async ()=>{
  const r=await fetch(BASE+'/api/admin/pending-approvals',{headers:{Cookie:adminCookie}});
  const d=await r.json();
  if(d.pending.find(p=>p.id===clientId))throw new Error('client still in pending');
});

await doTest('J10: approved client CAN write', async ()=>{
  const r=await fetch(BASE+'/api/client/settings',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:clientCookie},body:JSON.stringify({businessName:'Updated'})});
  if(r.status!==200)throw new Error('expected 200, got '+r.status);
});

await doTest('J11: admin suspends client', async ()=>{
  const r=await fetch(BASE+'/api/admin/clients/'+clientId+'/suspend',{method:'PATCH',headers:{Cookie:adminCookie}});
  if(r.status!==200)throw new Error('status '+r.status);
  const d=await r.json();
  if(d.status!=='suspended')throw new Error('not suspended: '+d.status);
});

await doTest('J12: suspended client BLOCKED', async ()=>{
  const r=await fetch(BASE+'/api/client/settings',{method:'PUT',headers:{'Content-Type':'application/json',Cookie:clientCookie},body:JSON.stringify({businessName:'X'})});
  if(r.status!==403)throw new Error('expected 403, got '+r.status);
});

await doTest('J13: admin reactivates client', async ()=>{
  const r=await fetch(BASE+'/api/admin/clients/'+clientId+'/reactivate',{method:'PATCH',headers:{Cookie:adminCookie}});
  if(r.status!==200)throw new Error('status '+r.status);
  const d=await r.json();
  if(d.status!=='active')throw new Error('not active: '+d.status);
});

await doTest('J14: admin rejects pending client', async ()=>{
  const ts2=Date.now().toString(36);
  const r1=await fetch(BASE+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'R',businessName:'R'+ts2,businessType:'electronics',phone:'+2519'+ts2.slice(-8),password:'x12345'})});
  const d1=await r1.json();
  if(!d1.client?.id)throw new Error('reg failed');
  const r2=await fetch(BASE+'/api/admin/clients/'+d1.client.id+'/reject',{method:'PATCH',headers:{Cookie:adminCookie}});
  if(r2.status!==200)throw new Error('reject status '+r2.status);
  const d2=await r2.json();
  if(d2.status!=='rejected')throw new Error('not rejected');
});

await doTest('J15: wrong password returns 401', async ()=>{
  const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@sprintsales.net',password:'wrong'})});
  if(r.status!==401)throw new Error('expected 401, got '+r.status);
  const d=await r.json();
  if(!d.error)throw new Error('no error message');
});

await doTest('J16: missing fields returns 400', async ()=>{
  const r=await fetch(BASE+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'X'})});
  if(r.status!==400)throw new Error('expected 400, got '+r.status);
});

console.log('\n'+'═'.repeat(50));
console.log('  Passed: '+passed+'  |  Failed: '+failed);
console.log('═'.repeat(50));
if(failed>0)process.exit(1);
