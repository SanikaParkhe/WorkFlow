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

afterAll(async () => {
  await pool.end();
});
