const pool = require('../../src/config/db');

const TEST_EMAILS = [
  'pm@workflow.test',
  'admin@workflow.test',
  'dev@workflow.test',
  'outsider@workflow.test',
  'member@workflow.test',
];

const cleanupProjects = async () => {
  await pool.query(`
    DELETE FROM issue_activity;
    DELETE FROM comments;
    DELETE FROM issues;
    DELETE FROM project_members;
    DELETE FROM projects;
  `);
};

const cleanupUsers = async () => {
  await pool.query('DELETE FROM refresh_tokens');
  await pool.query(
    `DELETE FROM users WHERE email = ANY($1::text[])`,
    [TEST_EMAILS]
  );
};

const cleanupAll = async () => {
  await cleanupProjects();
  await cleanupUsers();
};

module.exports = {
  TEST_EMAILS,
  cleanupProjects,
  cleanupUsers,
  cleanupAll,
};
