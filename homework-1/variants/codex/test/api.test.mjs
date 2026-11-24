import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../api/server.mjs';

async function withApi(fn) {
 const server = createApiServer();
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const request = async (path, body, options={}) => {
  const response = await fetch(base + path, {method:body === undefined ? 'GET' : 'POST', ...(body === undefined ? {} : {headers:{'content-type':'application/json'},body:JSON.stringify(body)}),...options});
  const data = response.status !== 204 && response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text();
  return {response,data};
 };
 try {await fn(request,base);} finally {await new Promise(resolve => server.close(resolve));}
}
const deposit = {type:'deposit',toAccount:'ACC-12345',amount:100,currency:'USD'};

test('creates and retrieves transactions with generated identity and defaults', () => withApi(async request => {
 assert.deepEqual((await request('/transactions')).data, []);
 const {response,data} = await request('/transactions',deposit);
 assert.equal(response.status,201); assert.match(data.id,/^[a-f0-9-]{36}$/); assert.equal(data.status,'completed'); assert.equal(data.fromAccount,''); assert.ok(Date.parse(data.timestamp));
 assert.deepEqual((await request('/transactions/'+data.id)).data,data);
 assert.equal((await request('/transactions/missing')).response.status,404);
 assert.equal((await request('/missing')).response.status,404);
}));

test('validates amount, account, currency and type using the required error shape',()=>withApi(async request=>{
 for (const amount of [0,-1,1.001,1.0000000001,0.0000000001,'1',null,[],{},0.0001]) {
  const {response,data}=await request('/transactions',{...deposit,amount});
  assert.equal(response.status,400); assert.equal(data.error,'Validation failed'); assert.ok(data.details.some(item=>item.field==='amount'));
 }
 for (const patch of [{toAccount:'ACC-1234'},{currency:'ZZZ'},{currency:'usd'},{type:'other'},{status:'other'},{demo:'yes'},{toAccount:2}]) {
  const result=await request('/transactions',{...deposit,...patch}); assert.equal(result.response.status,400);
 }
 assert.equal((await request('/transactions',{...deposit,currency:'JPY',amount:0.01})).response.status,201);
 assert.equal((await request('/transactions',{...deposit,amount:0.29})).response.status,201);
 assert.equal((await request('/transactions',{...deposit,amount:90071992547409.92})).response.status,400);
 assert.equal((await request('/transactions',{type:'transfer',fromAccount:'ACC-12345',toAccount:'ACC-12345',amount:1,currency:'USD'})).response.status,400);
 assert.equal((await request('/transactions',[])).response.status,400);
 assert.equal((await request('/transactions',null)).response.status,400);
}));

test('balances are per currency, completed only, with exact decimal arithmetic',()=>withApi(async request=>{
 for (const data of [deposit,{...deposit,amount:0.1},{...deposit,amount:0.2},{...deposit,currency:'EUR',amount:50},{...deposit,amount:99,status:'pending'},{...deposit,amount:99,status:'failed'},
 {type:'withdrawal',fromAccount:'ACC-12345',amount:10,currency:'USD'},
 {type:'transfer',fromAccount:'ACC-12345',toAccount:'ACC-ABCDE',amount:20,currency:'USD'}]) assert.equal((await request('/transactions',data)).response.status,201);
 assert.deepEqual((await request('/accounts/ACC-12345/balance')).data,{accountId:'ACC-12345',balances:{USD:70.3,EUR:50}});
 assert.deepEqual((await request('/accounts/ACC-ABCDE/balance')).data.balances,{USD:20});
 assert.deepEqual((await request('/accounts/ACC-EMPTY/balance')).data.balances,{});
 assert.equal((await request('/accounts/bad/balance')).response.status,400);
 const summary=(await request('/accounts/ACC-12345/summary')).data;
 assert.equal(summary.transactionCount,8); assert.ok(summary.mostRecentTransactionDate);
 assert.deepEqual(summary.totalDeposits,{USD:100.3,EUR:50}); assert.deepEqual(summary.totalWithdrawals,{USD:30});
 const interest=(await request('/accounts/ACC-12345/interest?rate=0.05&days=365')).data;
 assert.equal(interest.interest.USD,3.52); assert.equal(interest.interest.EUR,2.5);
 assert.equal((await request('/accounts/ACC-12345/interest?rate=bad&days=-1')).response.status,400);
}));

test('combines account, type and inclusive UTC date filters',()=>withApi(async request=>{
 const created=(await request('/transactions',deposit)).data;
 await request('/transactions',{...deposit,type:'withdrawal',toAccount:undefined,fromAccount:'ACC-ABCDE'});
 const day=created.timestamp.slice(0,10);
 assert.equal((await request(`/transactions?accountId=ACC-12345&type=deposit&from=${day}&to=${day}`)).data.length,1);
 assert.equal((await request('/transactions?from=2000-01-01&to=2000-01-31')).data.length,0);
 for (const query of ['accountId=bad','type=bad','from=bad','from=2024-02-30','from=2024-02-02&to=2024-02-01']) assert.equal((await request('/transactions?'+query)).response.status,400);
}));

test('CSV export is ordered before ID matching and supports filters and demo marker',()=>withApi(async request=>{
 await request('/transactions',{...deposit,demo:true});
 const {response,data}=await request('/transactions/export?format=csv&accountId=ACC-12345');
 assert.equal(response.status,200); assert.match(response.headers.get('content-type'),/text\/csv/); assert.match(data,/id,fromAccount,toAccount,amount,currency,type,timestamp,status,demo/); assert.match(data,/,"true"/);
 assert.equal((await request('/transactions/export?format=json')).response.status,400);
}));

test('handles malformed JSON, unsupported methods, CORS and preflight',()=>withApi(async request=>{
 const malformed=await request('/transactions',undefined,{method:'POST',body:'{'});
 assert.equal(malformed.response.status,400); assert.equal(malformed.data.error,'Validation failed');
 const cors=await request('/transactions',undefined,{method:'OPTIONS'});
 assert.equal(cors.response.status,204); assert.equal(cors.response.headers.get('access-control-allow-origin'),'*');
 assert.equal((await request('/transactions',undefined,{method:'DELETE'})).response.status,405);
 assert.equal((await request('/health')).data.status,'ok');
}));


test('validates datetime filters, interest boundaries and oversized JSON',()=>withApi(async request=>{
 await request('/transactions',deposit);
 assert.equal((await request('/transactions?from=2000-01-01T00:00:00Z&to=2099-01-01T00:00:00Z')).data.length,1);
 assert.equal((await request('/transactions?from=2024-02-30T12:00:00Z')).response.status,400);
 assert.equal((await request('/transactions?to=bad')).response.status,400);
 for (const query of ['', '?rate=0.1', '?rate=-1&days=1','?rate=2&days=1','?rate=0.1&days=1.5','?rate=0.1&days=36501']) assert.equal((await request('/accounts/ACC-12345/interest'+query)).response.status,400);
 assert.deepEqual((await request('/accounts/ACC-EMPTY/summary')).data,{accountId:'ACC-EMPTY',totalDeposits:{},totalWithdrawals:{},transactionCount:0,mostRecentTransactionDate:null});
 const oversized=await request('/transactions',{...deposit,extra:'x'.repeat(70000)});
 assert.equal(oversized.response.status,413);
}));

test('rejects monetary overflow without partial writes or transfer side effects',()=>withApi(async request=>{
 const max = 900719925474.09;
 assert.equal((await request('/transactions',{...deposit,amount:max})).response.status,201);
 assert.equal((await request('/transactions',{...deposit,amount:0.01})).response.status,400);
 assert.equal((await request('/transactions')).data.length,1);
 assert.equal((await request('/transactions',{type:'transfer',fromAccount:'ACC-OTHER',toAccount:deposit.toAccount,currency:'USD',amount:1})).response.status,400);
 assert.deepEqual((await request('/accounts/ACC-OTHER/balance')).data.balances,{});
 assert.equal((await request('/transactions',{...deposit,amount:max,status:'pending'})).response.status,201);
 assert.equal((await request('/transactions',{...deposit,currency:'EUR',amount:0.01})).response.status,201);
 assert.deepEqual((await request('/accounts/ACC-12345/balance')).data.balances,{USD:max,EUR:0.01});
}));

test('accepts leap dates and rejects invalid time or timezone components',()=>withApi(async request=>{
 for(const query of ['from=2024-02-29','from=2024-01-01T23:59:59.999Z','from=2024-01-01T12:00:00%2B02:30']) assert.equal((await request('/transactions?'+query)).response.status,200);
 for(const value of ['2023-02-29','2024-04-31','2024-13-01','2024-01-01T25:00:00Z','2024-01-01T12:60:00Z','2024-01-01T12:00:00%2B25:00']) assert.equal((await request('/transactions?from='+value)).response.status,400);
}));


test('oversized streamed bodies preserve keepalive and subsequent valid writes',()=>withApi(async (request,base)=>{
 const agent=new http.Agent({keepAlive:true,maxSockets:1});
 const raw = (path,body) => new Promise((resolve,reject)=>{
  const req=http.request(new URL(path,base),{method:body ? 'POST' : 'GET',agent,headers:body ? {'content-type':'application/json'} : {}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),reusedSocket:req.reusedSocket}));
  });
  req.on('error',reject);
  if(body) for(let i=0;i<body.length;i+=8192) req.write(body.slice(i,i+8192));
  req.end();
 });
 try {
  assert.equal((await raw('/health')).status,200);
  const oversized=await raw('/transactions',JSON.stringify({...deposit,extra:'x'.repeat(260000)}));
  assert.equal(oversized.status,413);assert.equal(oversized.reusedSocket,true);
  const valid=await raw('/transactions',JSON.stringify(deposit));
  assert.equal(valid.status,201);assert.equal(valid.reusedSocket,true);
  assert.equal((await request('/transactions')).data.length,1);
 } finally {agent.destroy();}
}));

test('interest rounds half cents symmetrically and supports small decimal rates',()=>withApi(async request=>{
 await request('/transactions',{...deposit,amount:0.1});
 await request('/transactions',{type:'withdrawal',fromAccount:'ACC-ABCDE',amount:0.1,currency:'USD'});
 assert.equal((await request('/accounts/ACC-12345/interest?rate=0.05&days=365')).data.interest.USD,0.01);
 assert.equal((await request('/accounts/ACC-ABCDE/interest?rate=0.05&days=365')).data.interest.USD,-0.01);
 assert.equal((await request('/accounts/ACC-12345/interest?rate=0.0000001&days=365')).data.interest.USD,0);
}));

test('rejects interest projections beyond the supported monetary range',()=>withApi(async request=>{
 await request('/transactions',{...deposit,amount:900719925474.09});
 const result=await request('/accounts/ACC-12345/interest?rate=1&days=366');
 assert.equal(result.response.status,400);
 assert.equal(result.data.error,'Validation failed');
 assert.equal(result.data.details[0].field,'days');
}));
