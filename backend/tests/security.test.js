/**
 * Phase 6 — Security Tests
 *
 * Covers:
 *  1. Rate limiting  — 429 after limit; 200 below; correct body format
 *  2. Helmet         — key security headers present
 *  3. CORS           — allowed origin passes; disallowed origin blocked
 *  4. Sensitive data — no password_hash / JWT secret in any response
 *  5. SQL injection  — malicious input treated as data, not SQL
 *  6. Dynamic sort   — invalid sort_by values rejected by validation
 *  7. Error handling — errors never expose stack traces / internals
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const createApp = require('../src/app');
const { createLimiters } = require('../src/middleware/rateLimiter.middleware');
const pool = require('../src/config/db');

// ── Shared app (NODE_ENV=test, limiters skipped) ───────────────────────────
const app = createApp();

// ── Test state ─────────────────────────────────────────────────────────────
const UNIQUE_EMAIL = `sec-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password1!';

let accessToken;
let projectId;
let issueId;

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
    // Register as admin so we can create projects
    const reg = await request(app)
        .post('/api/auth/register')
        .send({ email: UNIQUE_EMAIL, password: TEST_PASSWORD, name: 'Security Tester', role: 'admin' });

    expect(reg.status).toBe(201);
    accessToken = reg.body.data.accessToken;

    // Create a project (requires admin/project_manager role)
    const proj = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Sec Test Project', description: 'Phase 6 security tests' });

    expect(proj.status).toBe(201);
    projectId = proj.body.data.id;

    // Create an issue
    const iss = await request(app)
        .post(`/api/projects/${projectId}/issues`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Sec issue', status: 'backlog', priority: 'medium', type: 'bug' });

    expect(iss.status).toBe(201);
    issueId = iss.body.data.id;
});

afterAll(async () => {
    try {
        if (issueId) {
            await pool.query('DELETE FROM issue_activity WHERE issue_id = $1', [issueId]);
            await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
        }
        if (projectId) {
            await pool.query('DELETE FROM project_members WHERE project_id = $1', [projectId]);
            await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
        }
        await pool.query(
            'DELETE FROM refresh_tokens WHERE user_id = (SELECT id FROM users WHERE email = $1)',
            [UNIQUE_EMAIL]
        );
        await pool.query('DELETE FROM users WHERE email = $1', [UNIQUE_EMAIL]);
    } catch (_) {
        // Best-effort cleanup
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════
//
// Build a minimal isolated Express app with REAL enforcing limiters
// (skipInTest: false). The skip function in these limiters is () => false
// regardless of process.env.NODE_ENV  —  so no env mutation is needed and
// there is zero bleed-through to the shared `app`.

describe('1. Rate Limiting', () => {
    let limitedApp;

    beforeAll(() => {
        const { authLimiter, generalLimiter } = createLimiters({ skipInTest: false });

        limitedApp = express();
        limitedApp.use(express.json());
        limitedApp.use('/api', generalLimiter);
        // Minimal auth route that always returns 401 (credentials never valid here)
        limitedApp.post(
            '/api/auth/login',
            authLimiter,
            (req, res) => res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'bad' } })
        );
        limitedApp.get('/api/test', (req, res) => res.json({ ok: true }));
    });

    it('returns a non-429 status for a single request (below limit)', async () => {
        const res = await request(limitedApp)
            .post('/api/auth/login')
            .send({ email: 'x@x.com', password: 'wrong' });
        expect(res.status).not.toBe(429);
    });

    it('eventually returns 429 when the auth rate limit is exceeded', async () => {
        // authLimiter max=30; send 32 to guarantee hitting the ceiling
        let finalStatus = null;
        for (let i = 0; i < 32; i++) {
            const res = await request(limitedApp)
                .post('/api/auth/login')
                .send({ email: `brute${i}@x.com`, password: 'bad' });
            finalStatus = res.status;
            if (res.status === 429) break;
        }
        expect(finalStatus).toBe(429);
    });

    it('429 body follows the { success: false, error } envelope', async () => {
        let body = null;
        for (let i = 0; i < 35; i++) {
            const res = await request(limitedApp)
                .post('/api/auth/login')
                .send({ email: `env${i}@x.com`, password: 'bad' });
            if (res.status === 429) { body = res.body; break; }
        }
        expect(body).not.toBeNull();
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(typeof body.error.message).toBe('string');
    });

    it('test-suite skip guard prevents 429 in the shared app during normal test runs', async () => {
        const responses = await Promise.all(
            Array.from({ length: 10 }, () =>
                request(app)
                    .get('/api/auth/me')
                    .set('Authorization', `Bearer ${accessToken}`)
            )
        );
        for (const res of responses) {
            expect(res.status).not.toBe(429);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. HELMET — Security Headers
// ═══════════════════════════════════════════════════════════════════════════════

describe('2. Helmet Security Headers', () => {
    let headers;

    beforeAll(async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`);
        headers = res.headers;
    });

    it('sets X-Content-Type-Options: nosniff', () => {
        expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('sets X-Frame-Options', () => {
        expect(headers['x-frame-options']).toBeDefined();
        expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options'].toUpperCase());
    });

    it('sets X-DNS-Prefetch-Control: off', () => {
        expect(headers['x-dns-prefetch-control']).toBe('off');
    });

    it('sets Referrer-Policy: no-referrer', () => {
        expect(headers['referrer-policy']).toBe('no-referrer');
    });

    it('sets Strict-Transport-Security with max-age', () => {
        expect(headers['strict-transport-security']).toBeDefined();
        expect(headers['strict-transport-security']).toContain('max-age=');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CORS
// ═══════════════════════════════════════════════════════════════════════════════

describe('3. CORS', () => {
    it('allows a request from the configured FRONTEND_URL origin', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .set('Origin', 'http://localhost:3000');

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('allows preflight OPTIONS from an allowed origin', async () => {
        const res = await request(app)
            .options('/api/auth/me')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'GET');

        expect([200, 204]).toContain(res.status);
        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('rejects an unknown origin with an explicit allowlist (CORS isolation test)', async () => {
        // Build a minimal express app using cors() with an explicit origin allowlist.
        // This is the exact same logic used in app.js, verified in isolation.
        const allowedOrigin = 'http://localhost:3000';
        const corsApp = express();
        corsApp.use(cors({
            origin: (origin, cb) => {
                if (!origin || origin === allowedOrigin) return cb(null, true);
                cb(null, false);
            },
            credentials: true,
        }));
        corsApp.get('/health', (req, res) => res.json({ ok: true }));

        const res = await request(corsApp)
            .get('/health')
            .set('Origin', 'https://evil.example.com');

        // An unknown origin should NOT be echoed back in Access-Control-Allow-Origin
        expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
    });

    it('allows requests with no Origin header (Postman / curl)', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`);
        expect(res.status).toBe(200);
    });

    it('includes Access-Control-Allow-Credentials: true for credentialed preflight', async () => {
        const res = await request(app)
            .options('/api/auth/me')
            .set('Origin', 'http://localhost:3000')
            .set('Access-Control-Request-Method', 'GET')
            .set('Access-Control-Request-Headers', 'Authorization');

        expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SENSITIVE DATA EXPOSURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('4. Sensitive Data Exposure', () => {
    const sensitiveKeys = ['"password"', '"password_hash"', '"passwordHash"'];
    const secretPatterns = [/jwt[_-]?secret/i, /DB_PASSWORD/, /db[_-]?password/i];

    const assertNoSensitiveData = (body) => {
        const raw = JSON.stringify(body);
        for (const key of sensitiveKeys) {
            expect(raw).not.toContain(key);
        }
        for (const pattern of secretPatterns) {
            expect(raw).not.toMatch(pattern);
        }
    };

    it('register response does not expose password_hash', async () => {
        const email = `no-pw-${Date.now()}@example.com`;
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email, password: 'Password1!', name: 'NoPW' });

        expect(res.status).toBe(201);
        assertNoSensitiveData(res.body);

        await pool.query(
            'DELETE FROM refresh_tokens WHERE user_id=(SELECT id FROM users WHERE email=$1)',
            [email]
        );
        await pool.query('DELETE FROM users WHERE email=$1', [email]);
    });

    it('login response does not expose password_hash', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: UNIQUE_EMAIL, password: TEST_PASSWORD });

        expect(res.status).toBe(200);
        assertNoSensitiveData(res.body);
    });

    it('GET /api/auth/me does not expose password_hash', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        assertNoSensitiveData(res.body);
    });

    it('project list response does not expose sensitive fields', async () => {
        const res = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        assertNoSensitiveData(res.body);
    });

    it('issue list response does not expose sensitive fields', async () => {
        const res = await request(app)
            .get(`/api/projects/${projectId}/issues`)
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        assertNoSensitiveData(res.body);
    });

    it('dashboard response does not expose sensitive fields', async () => {
        const res = await request(app)
            .get(`/api/projects/${projectId}/dashboard`)
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        assertNoSensitiveData(res.body);
    });

    it('JWT tokens only appear in auth endpoint responses, not in general API responses', async () => {
        const res = await request(app)
            .get('/api/projects')
            .set('Authorization', `Bearer ${accessToken}`);

        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain('"accessToken"');
        expect(raw).not.toContain('"refreshToken"');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. SQL INJECTION PREVENTION
// ═══════════════════════════════════════════════════════════════════════════════

describe('5. SQL Injection Prevention', () => {
    const sqliPayloads = [
        "' OR 1=1 --",
        "'; DROP TABLE users; --",
        "' UNION SELECT id, password_hash FROM users --",
        '1; SELECT * FROM users',
    ];

    describe('Login endpoint (email field)', () => {
        sqliPayloads.forEach((payload) => {
            it(`treats payload as data: ${payload.slice(0, 35)}`, async () => {
                const res = await request(app)
                    .post('/api/auth/login')
                    .send({ email: payload, password: 'anything' });

                // 400 (Zod validation) or 401 (bad credentials) — never 200 or 500
                expect(res.status).not.toBe(200);
                expect(res.status).not.toBe(500);
                expect(res.body.success).toBe(false);
                expect(JSON.stringify(res.body)).not.toContain('password_hash');
                expect(JSON.stringify(res.body)).not.toContain('syntax error');
            });
        });
    });

    describe('Issue search parameter', () => {
        sqliPayloads.forEach((payload) => {
            it(`parameterised ILIKE treats as literal string: ${payload.slice(0, 35)}`, async () => {
                const res = await request(app)
                    .get(`/api/projects/${projectId}/issues`)
                    .query({ search: payload })
                    .set('Authorization', `Bearer ${accessToken}`);

                // Parameterised query → payload is data, not SQL → 200 with normal result
                expect(res.status).not.toBe(500);
                expect(res.body.success).toBe(true);
            });
        });
    });

    describe('Dynamic sort_by (allowlist validation)', () => {
        const validSortFields = ['created_at', 'updated_at', 'priority', 'status', 'title'];
        const invalidSortFields = [
            "'; DROP TABLE issues; --",
            'password_hash',
            '1=1',
            'users.password_hash',
        ];

        validSortFields.forEach((field) => {
            it(`accepts valid sort_by: ${field}`, async () => {
                const res = await request(app)
                    .get(`/api/projects/${projectId}/issues`)
                    .query({ sort_by: field, sort_order: 'asc' })
                    .set('Authorization', `Bearer ${accessToken}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            });
        });

        invalidSortFields.forEach((field) => {
            it(`rejects invalid sort_by: ${field.slice(0, 35)}`, async () => {
                const res = await request(app)
                    .get(`/api/projects/${projectId}/issues`)
                    .query({ sort_by: field })
                    .set('Authorization', `Bearer ${accessToken}`);

                // Zod enum validation rejects non-whitelisted values with 400
                expect(res.status).toBe(400);
                expect(res.body.success).toBe(false);
            });
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ERROR RESPONSE SECURITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('6. Error Response Security', () => {
    const assertSafeEnvelope = (body) => {
        const raw = JSON.stringify(body);
        // Must follow { success, error } structure
        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBeDefined();
        expect(body.error.message).toBeDefined();
        // Must NOT expose internals
        expect(raw).not.toMatch(/at .+\.(js|ts):\d+/);   // stack frames
        expect(raw).not.toContain('node_modules');
        expect(raw).not.toContain('SELECT');
        expect(raw).not.toContain('"stack"');
    };

    it('404 responses expose no internals', async () => {
        const res = await request(app)
            .get('/api/this-route-does-not-exist')
            .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(404);
        assertSafeEnvelope(res.body);
    });

    it('validation errors expose no internals', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'not-an-email', password: 'x', name: '' });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        assertSafeEnvelope(res.body);
    });

    it('auth errors (missing token) expose no internals', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
        assertSafeEnvelope(res.body);
    });

    it('non-existent project UUID returns safe error without DB internals', async () => {
        const fakeUuid = '00000000-0000-0000-0000-000000000000';
        const res = await request(app)
            .get(`/api/projects/${fakeUuid}`)
            .set('Authorization', `Bearer ${accessToken}`);

        expect([403, 404]).toContain(res.status);
        const raw = JSON.stringify(res.body);
        expect(raw).not.toContain('"pg"');
        expect(raw).not.toContain('SELECT');
        expect(raw).not.toContain('syntax error');
    });
});
