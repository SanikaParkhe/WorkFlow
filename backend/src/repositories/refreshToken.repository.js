const pool = require('../config/db');

const create = async (client, { userId, tokenHash, expiresAt }) => {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, expires_at, revoked, created_at`,
    [userId, tokenHash, expiresAt]
  );
  return result.rows[0];
};

const findValidByHash = async (client, tokenHash) => {
  const db = client || pool;
  const result = await db.query(
    `SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked,
            u.email, u.name, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1
       AND rt.revoked = FALSE
       AND rt.expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] || null;
};

const revokeById = async (client, id) => {
  const db = client || pool;
  await db.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1`,
    [id]
  );
};

const revokeAllForUser = async (client, userId) => {
  const db = client || pool;
  await db.query(
    `UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1 AND revoked = FALSE`,
    [userId]
  );
};

module.exports = {
  create,
  findValidByHash,
  revokeById,
  revokeAllForUser,
};
