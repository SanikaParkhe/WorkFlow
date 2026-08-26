const pool = require('../config/db');

const addMember = async (client, { projectId, userId, projectRole }) => {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO project_members (project_id, user_id, project_role)
     VALUES ($1, $2, $3)
     RETURNING project_id, user_id, project_role, joined_at`,
    [projectId, userId, projectRole]
  );
  return result.rows[0];
};

const findMembership = async (projectId, userId) => {
  const result = await pool.query(
    `SELECT project_id, user_id, project_role, joined_at
     FROM project_members
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows[0] || null;
};

const listByProjectId = async (projectId) => {
  const result = await pool.query(
    `SELECT pm.project_id, pm.user_id, pm.project_role, pm.joined_at,
            u.name, u.email
     FROM project_members pm
     INNER JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.joined_at ASC`,
    [projectId]
  );
  return result.rows;
};

const removeMember = async (projectId, userId) => {
  const result = await pool.query(
    `DELETE FROM project_members
     WHERE project_id = $1 AND user_id = $2
     RETURNING project_id, user_id, project_role`,
    [projectId, userId]
  );
  return result.rows[0] || null;
};

module.exports = {
  addMember,
  findMembership,
  listByProjectId,
  removeMember,
};
