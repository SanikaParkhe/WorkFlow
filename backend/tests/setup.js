const pool = require('../src/config/db');

beforeAll(async () => {
  // Ensure migrations have been run before tests
  const result = await pool.query(
    `SELECT to_regclass('public.users') AS users_table`
  );
  if (!result.rows[0].users_table) {
    throw new Error(
      'Test database not migrated. Run: npm run migrate (with DB_NAME=workflow_test or your test DB)'
    );
  }
});

// NOTE: pool.end() is intentionally NOT called here.
//
// setup.js is a setupFilesAfterEnv file — Jest re-runs its afterAll hook
// after EVERY test file completes. With --runInBand all test files share the
// same Node.js process and therefore the same pg-pool singleton (module cache).
// Calling pool.end() after the first file (auth.test.js) permanently destroys
// the pool, causing all subsequent suites to fail with:
//   "Error: Cannot use a pool after calling end on the pool"
//
// jest.config.js already sets forceExit: true which terminates the process
// (and its open connections) cleanly after all suites finish.
// No explicit pool.end() is needed or safe here.
