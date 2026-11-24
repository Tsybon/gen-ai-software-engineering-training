import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ACCOUNT_PATTERN, MAX_AMOUNT, transactionErrors, monetaryLimitErrors, validationError, fieldError, parseFilters, filterTransactions, accountBalance, accountSummary, interestResult, exportCsv } from './domain.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Content-Disposition', 'Cache-Control': 'no-store' };
const BODY_LIMIT = 64 * 1024;

function send(response, status, body, headers = {}) {
 response.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...headers });
 response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(request) {
 let body = '';
 let bytes = 0;
 request.setEncoding('utf8');
 for await (const chunk of request) {
  bytes += Buffer.byteLength(chunk);
  if (bytes <= BODY_LIMIT) body += chunk;
 }
 if (bytes > BODY_LIMIT) {
  const error = new Error('Request body exceeds 64 KB'); error.status = 413; throw error;
 }
 try { return JSON.parse(body); } catch { throw new Error('Body must contain valid JSON'); }
}

function interestErrors(params) {
 const errors = [];
 const rate = Number(params.get('rate'));
 const days = Number(params.get('days'));
 if (!params.has('rate') || !params.get('rate').trim() || !Number.isFinite(rate) || rate < 0 || rate > 1) errors.push(fieldError('rate', 'Rate must be a number between 0 and 1 (annual decimal rate)'));
 if (!params.has('days') || !params.get('days').trim() || !Number.isInteger(days) || days < 0 || days > 36500) errors.push(fieldError('days', 'Days must be an integer between 0 and 36500'));
 return { errors, rate, days };
}

export function createApiServer() {
 let transactions = [];
 return http.createServer(async (request, response) => {
  try {
   const url = new URL(request.url, 'http://localhost');
   const path = url.pathname.replace(/\/$/, '') || '/';
   if (request.method === 'OPTIONS') return send(response, 204, '');
   if (!['GET', 'POST'].includes(request.method)) return send(response, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST, OPTIONS' });
   if (path === '/health' && request.method === 'GET') return send(response, 200, { status: 'ok' });
   if (path === '/transactions' && request.method === 'POST') {
    let body;
    try { body = await readBody(request); } catch (error) { return send(response, error.status || 400, validationError([fieldError('body', error.message)])); }
    const errors = transactionErrors(body);
    if (errors.length) return send(response, 400, validationError(errors));
    const item = { id: randomUUID(), fromAccount: body.fromAccount || '', toAccount: body.toAccount || '', amount: body.amount, currency: body.currency, type: body.type, timestamp: new Date().toISOString(), status: body.status || 'completed', ...(body.demo === true ? { demo: true } : {}) };
    const limitErrors = monetaryLimitErrors(transactions, item);
    if (limitErrors.length) return send(response, 400, validationError(limitErrors));
    transactions = [...transactions, item];
    return send(response, 201, item, { Location: '/transactions/' + item.id });
   }
   if (['/transactions', '/transactions/export'].includes(path) && request.method === 'GET') {
    const filters = parseFilters(url.searchParams);
    if (path.endsWith('/export') && url.searchParams.get('format') !== 'csv') filters.errors.push(fieldError('format', 'Format must be csv'));
    if (filters.errors.length) return send(response, 400, validationError(filters.errors));
    const items = filterTransactions(transactions, filters);
    if (path.endsWith('/export')) return send(response, 200, exportCsv(items), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="transactions.csv"' });
    return send(response, 200, items);
   }
   const itemMatch = path.match(/^\/transactions\/([^/]+)$/);
   if (itemMatch && request.method === 'GET') {
    const item = transactions.find(transaction => transaction.id === itemMatch[1]);
    return send(response, item ? 200 : 404, item || { error: 'Transaction not found' });
   }
   const accountMatch = path.match(/^\/accounts\/([^/]+)\/(balance|summary|interest)$/);
   if (accountMatch && request.method === 'GET') {
    const [, accountId, action] = accountMatch;
    if (!ACCOUNT_PATTERN.test(accountId)) return send(response, 400, validationError([fieldError('accountId', 'Account must match ACC-XXXXX (5 alphanumeric characters)')]));
    if (action === 'balance') return send(response, 200, accountBalance(transactions, accountId));
    if (action === 'summary') return send(response, 200, accountSummary(transactions, accountId));
    const { errors, rate, days } = interestErrors(url.searchParams);
    if (errors.length) return send(response, 400, validationError(errors));
    const result = interestResult(transactions, accountId, rate, days);
    if (Object.values(result.interest).some(amount => Math.abs(amount) > MAX_AMOUNT)) return send(response, 400, validationError([fieldError('days', 'Projected interest exceeds the supported monetary range; reduce rate or days')]));
    return send(response, 200, result);
   }
   return send(response, 404, { error: 'Endpoint not found' });
  } catch (error) {
   console.error('API request failed:', error);
   if (!response.headersSent) send(response, 500, { error: 'Internal server error' });
   else response.end();
  }
 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const port = Number(process.env.API_PORT || 3001);
 const server = createApiServer();
 server.on('error', error => { console.error('API failed:', error.message); process.exit(1); });
 server.listen(port, '0.0.0.0', () => console.log(`API listening on http://localhost:${port}`));
 for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
