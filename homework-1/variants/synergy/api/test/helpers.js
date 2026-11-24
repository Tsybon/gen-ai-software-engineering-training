import request from 'supertest';
import { createApp } from '../src/app.js';

export function setup(options = {}) {
  const app = createApp({ rateLimitMax: 10_000, ...options });
  const api = request(app);
  const post = (body) => api.post('/transactions').send(body);
  const deposit = (toAccount, amount, extra = {}) =>
    post({ toAccount, amount, currency: 'USD', type: 'deposit', ...extra });
  return { app, api, post, deposit };
}

export const fieldsOf = (res) => res.body.details.map((d) => d.field);
