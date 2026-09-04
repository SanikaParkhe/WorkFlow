const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const errorHandler = require('./middleware/error.middleware');
const { generalLimiter } = require('./middleware/rateLimiter.middleware');

// ─── Allowed CORS origins ────────────────────────────────────────────────────
// FRONTEND_URL can be a single URL or a comma-separated list of URLs.
// In development, requests with no Origin header (Postman, curl, server-to-server)
// are also allowed. Set FRONTEND_URL in production to restrict origins.
const buildAllowedOrigins = () => {
  const raw = process.env.FRONTEND_URL || '';
  // Parse any explicitly configured origins
  const explicit = raw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return explicit;
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = buildAllowedOrigins();

    // Allow requests with no origin (Postman, curl, server-to-server calls)
    if (!origin) {
      return callback(null, true);
    }

    // In development (or when no FRONTEND_URL set) allow localhost origins
    if (allowedOrigins.length === 0) {
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
      if (isLocalhost || process.env.NODE_ENV === 'test') {
        return callback(null, true);
      }
      // Still reject unknown non-localhost origins even in dev
      return callback(new Error(`CORS: origin '${origin}' not allowed`), false);
    }

    // Production / explicit allowlist
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Test environment: allow everything so supertest works without origin header issues
    if (process.env.NODE_ENV === 'test') {
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin '${origin}' not allowed`), false);
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const createApp = () => {
  const app = express();

  // ── Security headers (Helmet) ────────────────────────────────────────────
  // helmet() sets many HTTP response headers that prevent common browser-based
  // attacks. We configure explicitly so behaviour is documented and predictable.
  app.use(
    helmet({
      // X-Content-Type-Options: nosniff
      //   Prevents browsers from MIME-sniffing a response away from the declared
      //   content-type. Stops certain XSS vectors via crafted file uploads.
      contentSecurityPolicy: false, // Disabled: Swagger UI requires inline scripts/styles.
      // Enable + configure CSP if you add a frontend.
      crossOriginEmbedderPolicy: false, // Disabled for Swagger UI compatibility.
      // X-Frame-Options: SAMEORIGIN (default) — prevents clickjacking via iframes.
      // X-XSS-Protection: 0 — modern browsers use CSP; the old header can create new
      //   vulnerabilities in older browsers, so Helmet disables it.
      // Strict-Transport-Security (HSTS) — forces HTTPS for 180 days in production.
      hsts: {
        maxAge: 15552000, // 180 days in seconds
        includeSubDomains: true,
      },
      // Referrer-Policy: no-referrer — no URL sent in Referer header; stops leaking
      //   internal paths to third-party requests.
      referrerPolicy: { policy: 'no-referrer' },
      // X-DNS-Prefetch-Control: off — prevents browsers from DNS-prefetching links
      //   visible in the page, which could leak visited URLs.
      dnsPrefetchControl: { allow: false },
    })
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  // Explicit allowlist — replaces the previous permissive cors() call.
  // Credential-bearing requests (Authorization header) MUST have a specific
  // origin instead of '*'; wildcard + credentials is forbidden by the CORS spec.
  app.use(cors(corsOptions));

  // ── General rate limiting ─────────────────────────────────────────────────
  // Applied before routes so every /api/* endpoint is covered.
  // Auth endpoints receive an additional, stricter limiter in auth.routes.js.
  app.use('/api', generalLimiter);

  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs.json', (req, res) => {
    res.json(swaggerSpec);
  });

  app.use('/api', routes);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(errorHandler);

  return app;
};

module.exports = createApp;
