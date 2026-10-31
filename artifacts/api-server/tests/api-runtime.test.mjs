import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import worker, { handleApiRequest } from '../src/cloudflare-worker.ts';
import { getRuntimeEnv, withRuntimeEnvironment } from '../src/lib/runtime-env.ts';
import { getSupabaseConfigIssue, getSupabaseAdmin } from '../src/lib/supabase.ts';
import { supabaseFailure } from '../src/lib/supabase-diagnostics.ts';
import netlifyApi, { config as netlifyConfig } from '../../../netlify/functions/api.mts';

const bindings = () => ({
  NODE_ENV: 'production',
  ADMIN_PANEL_PASSWORD: randomBytes(24).toString('hex'),
  SESSION_SECRET: randomBytes(32).toString('hex'),
});
let nextIp = 0;
function request(path, body, cookie, ip = `192.0.2.${++nextIp}`) {
  return new Request(`https://store.test/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const invoke = (env, req) => withRuntimeEnvironment(env, () => handleApiRequest(req));

test('missing admin password or signing secret is 503 rather than wrong-password 403', async () => {
  for (const key of ['ADMIN_PANEL_PASSWORD', 'SESSION_SECRET']) {
    const env = bindings();
    delete env[key];
    for (const req of [request('/admin/passcode'), request('/admin/passcode', { passcode: 'invalid' })]) {
      const r = await invoke(env, req);
      assert.equal(r.status, 503);
      assert.equal(r.headers.has('set-cookie'), false);
    }
  }
});

test('signed secure admin sessions work; incorrect, tampered and expired sessions fail', async () => {
  const env = bindings();
  const rejected = await invoke(env, request('/admin/passcode', { passcode: randomBytes(16).toString('hex') }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.has('set-cookie'), false);
  const accepted = await invoke(env, request('/admin/passcode', { passcode: env.ADMIN_PANEL_PASSWORD }));
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).unlocked, true);
  const header = accepted.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', 'Max-Age=1800']) assert.ok(header.includes(flag));
  const cookie = header.split(';')[0];
  const status = await invoke(env, request('/admin/passcode', undefined, cookie));
  assert.equal((await status.json()).unlocked, true);
  for (const invalid of [cookie + 'x', cookie.replace(/=\d+\./, '=1.')]) {
    const r = await invoke(env, request('/admin/passcode', undefined, invalid));
    assert.equal((await r.json()).unlocked, false);
  }
  const rotated = await invoke({ ...env, SESSION_SECRET: randomBytes(32).toString('hex') }, request('/admin/passcode', undefined, cookie));
  assert.equal((await rotated.json()).unlocked, false);
});

test('all tested admin operations reject unauthenticated access before querying data', async () => {
  for (const [path, method] of [['/products', 'POST'], ['/products/1', 'PATCH'], ['/products/1', 'DELETE'], ['/admin/raw-materials', 'GET'], ['/admin/raw-materials/1', 'PATCH'], ['/admin/raw-materials/imports', 'POST']]) {
    const r = await invoke(bindings(), new Request(`https://store.test/api${path}`, { method }));
    assert.equal(r.status, 401, `${method} ${path}`);
  }
});

test('login attempt limit is preserved', async () => {
  const env = bindings();
  const ip = `192.0.2.${++nextIp}`;
  for (let i = 0; i < 5; i++) {
    const r = await invoke(env, request('/admin/passcode', { passcode: 'invalid' }, undefined, ip));
    assert.equal(r.status, 403);
  }
  const r = await invoke(env, request('/admin/passcode', { passcode: env.ADMIN_PANEL_PASSWORD }, undefined, ip));
  assert.equal(r.status, 429);
});

test('API misses return JSON 404 and malformed JSON returns 400', async () => {
  const missing = await invoke(bindings(), request('/unknown'));
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  const malformed = await invoke(bindings(), new Request('https://store.test/api/admin/passcode', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  }));
  assert.equal(malformed.status, 400);
});

test('Cloudflare API routes use explicit runtime bindings and bypass the asset fallback', async () => {
  const env = { ...bindings(), ASSETS: { fetch: async () => { throw new Error('API reached asset fallback'); } } };
  const login = await worker.fetch(request('/admin/passcode', { passcode: env.ADMIN_PANEL_PASSWORD }), env);
  assert.equal(login.status, 200);
  const health = await worker.fetch(request('/healthz'), env);
  assert.equal(health.status, 200);
});

test('Netlify API adapter uses function runtime bindings and preserves secure authentication', async (t) => {
  const env = bindings();
  const previous = globalThis.Netlify;
  globalThis.Netlify = { env: { get: (name) => env[name] } };
  t.after(() => { globalThis.Netlify = previous; });
  assert.deepEqual(netlifyConfig.path, ['/api', '/api/*']);
  const context = { ip: `192.0.2.${++nextIp}` };
  const health = await netlifyApi(request('/healthz'), context);
  assert.equal(health.status, 200);
  const login = await netlifyApi(request('/admin/passcode', { passcode: env.ADMIN_PANEL_PASSWORD }), context);
  assert.equal(login.status, 200);
  assert.ok(login.headers.get('set-cookie').includes('Secure'));
  const denied = await netlifyApi(request('/admin/raw-materials'), context);
  assert.equal(denied.status, 401);
});

test('runtime bindings remain isolated across overlapping requests', async () => {
  const values = await Promise.all(['first', 'second'].map((value) =>
    withRuntimeEnvironment({ TEST_BINDING: value }, async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return getRuntimeEnv('TEST_BINDING');
    })));
  assert.deepEqual(values, ['first', 'second']);
});

test('Supabase server URL and legacy URL are supported without reusing cached credentials', () => {
  const key = randomBytes(24).toString('hex');
  for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    withRuntimeEnvironment({ [name]: 'https://project.test', SUPABASE_SERVICE_ROLE_KEY: key }, () => {
      assert.equal(getSupabaseConfigIssue(), null);
      assert.notEqual(getSupabaseAdmin(), getSupabaseAdmin());
    });
  }
  assert.equal(withRuntimeEnvironment({}, getSupabaseConfigIssue), 'missing');
  assert.equal(withRuntimeEnvironment({ SUPABASE_URL: 'invalid', SUPABASE_SERVICE_ROLE_KEY: key }, getSupabaseConfigIssue), 'invalid_url');
});

test('readiness separates schema, access and connectivity failures without upstream messages', () => {
  assert.equal(supabaseFailure({ code: '42P01' }).status, 'schema_not_ready');
  assert.equal(supabaseFailure({ code: '42501' }).status, 'access_denied');
  assert.equal(supabaseFailure({ message: 'Invalid API key' }).status, 'access_denied');
  assert.equal(supabaseFailure({ message: 'fetch failed' }).status, 'unavailable');
});
