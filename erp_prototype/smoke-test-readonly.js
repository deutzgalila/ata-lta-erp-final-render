/**
 * Read-only production smoke test (Spec 1.5).
 *
 * Verifies a freshly deployed production environment WITHOUT mutating any
 * data. Replaces smoke-test.js for production deploys — the old test created
 * a mock client and recorded a real PHP 1,000 payment on the live ledger.
 *
 * Probes performed (all GET/HEAD, zero mutations):
 *   1. SPA shell: GET / returns 200 with the app-shell and login containers.
 *   2. Frontend assets: every <script src> referenced by index.html resolves.
 *   3. env.js API URL injection.
 *   4. Backend probes: /health (required 200), /livez and /readyz (required
 *      200 once deployed; 404 is tolerated with a warning while the probes
 *      roll out — see backend app.js Phase 3 work).
 *   5. Optional read-only session: when SMOKE_READONLY_EMAIL and
 *      SMOKE_READONLY_PASSWORD are set, signs in over the API and performs
 *      GET-only checks (/v1/me, /v1/clients/counts). Never writes a row.
 *
 * Usage:
 *   BASE_URL=https://ata-lta-erp-spa-main.onrender.com node smoke-test-readonly.js
 *
 * Optional env:
 *   SMOKE_READONLY_EMAIL / SMOKE_READONLY_PASSWORD - dedicated read-only user
 */

const http = require('http');
const https = require('https');

const BASE = (process.env.BASE_URL || process.argv[2] || '').replace(/\/+$/, '');
const TIMEOUT_MS = 15000;

let results = [];
let warnings = [];

function log(label, passed, detail) {
  results.push({ label, passed, detail });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${label}${detail ? ': ' + detail : ''}`);
}

function warn(label, detail) {
  warnings.push({ label, detail });
  console.log(`⚠️  ${label}: ${detail}`);
}

function fetchRaw(url, { method = 'GET', headers = {}, body = null, timeout = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method, headers, timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });
    if (body) req.write(body);
    req.end();
  });
}

function fetchJson(url, options) {
  return fetchRaw(url, options).then((res) => {
    let parsed = null;
    try {
      parsed = res.body ? JSON.parse(res.body) : null;
    } catch (e) {
      /* leave parsed as null */
    }
    return { ...res, json: parsed };
  });
}

async function run() {
  if (!BASE) {
    console.error('❌ BASE_URL is required (e.g. https://ata-lta-erp-spa-main.onrender.com)');
    process.exit(1);
  }
  console.log(`Running READ-ONLY smoke tests against ${BASE}...`);
  console.log('(No mutating requests will be issued.)\n');

  // ─── 1. SPA shell ────────────────────────────────────────────────
  let indexHtml = null;
  try {
    const res = await fetchRaw(`${BASE}/`);
    indexHtml = res.body;
    const hasShell = indexHtml.includes('id="app-shell"');
    const hasLogin = indexHtml.includes('id="login-screen"');
    log('SPA app shell', res.status === 200 && hasShell && hasLogin, `status=${res.status}, appShell=${hasShell}, login=${hasLogin}`);
  } catch (e) {
    log('SPA app shell', false, e.message);
  }

  // ─── 2. Frontend script asset resolution ─────────────────────────
  if (indexHtml) {
    const srcs = [...indexHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    let resolved = 0;
    let failedAssets = [];
    for (const src of srcs) {
      const assetUrl = src.startsWith('http') ? src : `${BASE}/${src.replace(/^\/+/, '')}`;
      try {
        const res = await fetchRaw(assetUrl);
        if (res.status === 200) {
          resolved += 1;
        } else {
          failedAssets.push(`${src} (${res.status})`);
        }
      } catch (e) {
        failedAssets.push(`${src} (${e.message})`);
      }
    }
    log(
      'Frontend script assets resolve',
      srcs.length > 0 && failedAssets.length === 0,
      `${resolved}/${srcs.length} scripts 200 OK${failedAssets.length ? ', failed: ' + failedAssets.join(', ') : ''}`
    );
  } else {
    log('Frontend script assets resolve', false, 'index.html unavailable');
  }

  // ─── 3. env.js API URL injection ─────────────────────────────────
  let apiBaseUrl = null;
  try {
    const res = await fetchRaw(`${BASE}/env.js`);
    const match = res.body.match(/window\.__ERP_API_BASE_URL__\s*=\s*"([^"]+)"/);
    apiBaseUrl = match ? match[1] : null;
    const valid = res.status === 200 && apiBaseUrl && /^https?:\/\//.test(apiBaseUrl) && apiBaseUrl.endsWith('/v1');
    log('env.js API URL injection', Boolean(valid), apiBaseUrl || `status=${res.status}`);
  } catch (e) {
    log('env.js API URL injection', false, e.message);
  }

  // ─── 4. Backend probes (GET only) ────────────────────────────────
  if (apiBaseUrl) {
    const rootUrl = apiBaseUrl.replace(/\/v1\/?$/, '');

    // /health is the production dependency probe — must be fully ok.
    try {
      const res = await fetchJson(`${rootUrl}/health`);
      log('Backend /health', res.status === 200 && res.json?.status === 'ok', `status=${res.status} body=${res.body.slice(0, 200)}`);
    } catch (e) {
      log('Backend /health', false, e.message);
    }

    // /livez and /readyz ship with the probe-decoupling work (Spec 3.2).
    // Tolerate 401/404 during rollout: unknown paths on older deployments hit
    // the globally mounted auth middleware (401) or the 404 handler, and
    // Render may still be building the new API while this smoke test runs.
    for (const probe of ['/livez', '/readyz']) {
      try {
        const res = await fetchJson(`${rootUrl}${probe}`);
        if (res.status === 200) {
          log(`Backend ${probe}`, true, `status=200`);
        } else if (res.status === 401 || res.status === 404) {
          warn(`Backend ${probe}`, `not deployed yet (${res.status}) — tolerated during rollout`);
        } else {
          log(`Backend ${probe}`, false, `status=${res.status} body=${res.body.slice(0, 200)}`);
        }
      } catch (e) {
        log(`Backend ${probe}`, false, e.message);
      }
    }
  } else {
    log('Backend probes', false, 'API base URL not discovered');
  }

  // ─── 5. Optional read-only session (GET-only API calls) ──────────
  const roEmail = process.env.SMOKE_READONLY_EMAIL;
  const roPassword = process.env.SMOKE_READONLY_PASSWORD;
  if (apiBaseUrl && roEmail && roPassword) {
    try {
      const signin = await fetchJson(`${apiBaseUrl}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: roEmail, password: roPassword }),
      });
      const token = signin.json?.data?.accessToken || signin.json?.accessToken;
      log('Read-only user sign-in', signin.status === 200 && Boolean(token), `status=${signin.status}`);

      if (token) {
        const auth = { Authorization: `Bearer ${token}` };
        for (const path of ['/me', '/clients/counts']) {
          const res = await fetchJson(`${apiBaseUrl}${path}`, { headers: auth });
          log(`Read-only GET ${path}`, res.status === 200, `status=${res.status}`);
        }
      }
    } catch (e) {
      log('Read-only user session', false, e.message);
    }
  } else {
    console.log('ℹ️  Read-only session check skipped (set SMOKE_READONLY_EMAIL / SMOKE_READONLY_PASSWORD to enable)');
  }

  // ─── Summary ─────────────────────────────────────────────────────
  console.log('\n========== READ-ONLY SMOKE TEST SUMMARY ==========');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
    warnings.forEach((w) => console.log(`  ⚠️  ${w.label}: ${w.detail}`));
  }
  if (failed > 0) {
    console.log('\nFailed probes:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ❌ ${r.label}: ${r.detail}`));
  }
  console.log('==================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
