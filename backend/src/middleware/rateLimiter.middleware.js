/**
 * Rate-limiting middleware (express-rate-limit v7+).
 *
 * WHY TWO LIMITERS?
 * ─────────────────
 * Authentication endpoints (/login, /register, /refresh) are the primary
 * targets for brute-force and credential-stuffing attacks. They receive a
 * tighter window (30 req / 15 min) so an attacker cannot enumerate passwords
 * at speed. General API endpoints are limited more generously (300 req / 15 min)
 * to allow normal usage and automated tests without interference.
 *
 * PROTECTED ROUTES
 * ────────────────
 * authLimiter    → POST /api/auth/register
 *                  POST /api/auth/login
 *                  POST /api/auth/refresh
 *
 * generalLimiter → All /api/* routes (applied globally in app.js before routes)
 *
 * TEST ISOLATION
 * ──────────────
 * Both limiters ship with skip: () => process.env.NODE_ENV === 'test' so the
 * full jest suite is never rate-limited during automated testing.
 *
 * The security tests that specifically verify 429 behaviour call
 * createLimiters({ skipInTest: false }) to obtain limiters with the skip
 * guard disabled, used only on an isolated Express app instance.
 */

const rateLimit = require('express-rate-limit');

/**
 * Build a standard 429 response body that matches the existing API envelope:
 * { success: false, error: { code, message } }
 */
const make429Handler = (message) => (req, res) => {
    res.status(429).json({
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message,
        },
    });
};

/**
 * Factory — creates a fresh pair of { authLimiter, generalLimiter }.
 *
 * @param {object} options
 * @param {boolean} [options.skipInTest=true]
 *   When true (default), limiters skip when NODE_ENV === 'test'.
 *   Pass false to create limiters that always enforce limits
 *   (used by security tests that need to verify 429 behaviour).
 */
const createLimiters = ({ skipInTest = true } = {}) => {
    const skipFn = skipInTest ? () => process.env.NODE_ENV === 'test' : () => false;

    /**
     * General limiter — 300 req / 15 min per IP.
     * Covers all /api/* traffic. Generous enough for the full jest suite.
     */
    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 300,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        handler: make429Handler('Too many requests. Please try again later.'),
        skip: skipFn,
    });

    /**
     * Auth limiter — 30 req / 15 min per IP.
     * Stricter: login/register/refresh are brute-force targets.
     */
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 30,
        standardHeaders: 'draft-6',
        legacyHeaders: false,
        handler: make429Handler(
            'Too many authentication attempts. Please wait 15 minutes before trying again.'
        ),
        skip: skipFn,
    });

    return { authLimiter, generalLimiter };
};

// Default export uses the test-safe skip guard (NODE_ENV check at request time)
const { authLimiter, generalLimiter } = createLimiters();

module.exports = { authLimiter, generalLimiter, createLimiters };
