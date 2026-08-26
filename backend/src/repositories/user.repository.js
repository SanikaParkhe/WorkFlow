const pool = require('../config/db');

const USER_COLUMNS = 'id, email, name, role, created_at, updated_at';

const findByEmail = async (email) => {
  const result = await pool.query(
    `SELECT id, email, password_hash, name, role, created_at, updated_at
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const create = async ({ email, passwordHash, name, role }) => {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_COLUMNS}`,
    [email, passwordHash, name, role]
  );
  return result.rows[0];
};

const updateProfile = async (id, { name, email }) => {
  const result = await pool.query(
    `UPDATE users
     SET name = COALESCE($2, name),
         email = COALESCE($3, email),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_COLUMNS}`,
    [id, name ?? null, email ?? null]
  );
  return result.rows[0] || null;
};

const updatePassword = async (id, passwordHash) => {
  await pool.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [id, passwordHash]
  );
};

const findByIdWithPassword = async (id) => {
  const result = await pool.query(
    `SELECT id, email, password_hash, name, role, created_at, updated_at
     FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  findByEmail,
  findById,
  findByIdWithPassword,
  create,
  updateProfile,
  updatePassword,
};
