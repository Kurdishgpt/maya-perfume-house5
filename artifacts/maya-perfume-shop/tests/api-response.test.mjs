import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customFetch, ResponseParseError, ApiError } from '../../../lib/api-client-react/src/custom-fetch.ts';

test('HTML fallback is rejected instead of reaching catalog rendering', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_input, options) => {
    assert.match(options.headers.get('accept'), /application\/json/);
    return new Response('<!doctype html><html><body>Store</body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  });
  await assert.rejects(customFetch('/api/products'), ResponseParseError);
});

test('JSON catalog data is returned unchanged', async (t) => {
  const products = [{ id: 1, name: 'Perfume' }];
  t.mock.method(globalThis, 'fetch', async () => Response.json(products));
  assert.deepEqual(await customFetch('/api/products'), products);
});

test('API failures remain errors and empty responses remain supported', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Unavailable' }, { status: 503 }));
  await assert.rejects(customFetch('/api/products'), ApiError);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  assert.equal(await customFetch('/api/cart', { method: 'DELETE' }), null);
});

test('explicit text responses remain supported', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('name,price'));
  assert.equal(await customFetch('/api/export', { responseType: 'text' }), 'name,price');
});
