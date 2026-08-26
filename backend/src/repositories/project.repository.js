const pool = require('../config/db');

const PROJECT_COLUMNS = 'id, name, description, owner_id, status, created_at';

const create = async (client, { name, description, ownerId }) => {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO projects (name, description, owner_id)
     VALUES ($1, $2, $3)
     RETURNING ${PROJECT_COLUMNS}`,
    [name, description ?? null, ownerId]
  );
  return result.rows[0];
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

const listByMemberId = async (userId) => {
  const result = await pool.query(
    `SELECT p.id, p.name, p.description, p.owner_id, p.status, p.created_at,
            pm.project_role
     FROM projects p
     INNER JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return result.rows;
};

const update = async (id, { name, description, status }) => {
  const result = await pool.query(
    `UPDATE projects
     SET name = COALESCE($2, name),
         description = COALESCE($3, description),
         status = COALESCE($4, status)
     WHERE id = $1
     RETURNING ${PROJECT_COLUMNS}`,
    [id, name ?? null, description ?? null, status ?? null]
  );
  return result.rows[0] || null;
};

const archive = async (id) => {
  const result = await pool.query(
    `UPDATE projects SET status = 'archived' WHERE id = $1
     RETURNING ${PROJECT_COLUMNS}`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  create,
  findById,
  listByMemberId,
  update,
  archive,
};
