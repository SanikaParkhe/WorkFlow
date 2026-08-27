const pool = require('../config/db');

const COMMENT_COLUMNS = `
  c.id, c.issue_id, c.body, c.created_at,
  u.id   AS author_id,
  u.name AS author_name,
  u.email AS author_email
`;

/**
 * Insert a new comment and return it with author info.
 */
const create = async (issueId, userId, body) => {
    // Insert first, then fetch with JOIN so the response shape matches listByIssueId
    const insert = await pool.query(
        `INSERT INTO comments (issue_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
        [issueId, userId, body]
    );
    const id = insert.rows[0].id;
    return findById(id);
};

/**
 * Fetch all comments for an issue, oldest-first, with author info.
 */
const findByIssueId = async (issueId) => {
    const result = await pool.query(
        `SELECT ${COMMENT_COLUMNS}
     FROM   comments c
     JOIN   users u ON u.id = c.user_id
     WHERE  c.issue_id = $1
     ORDER  BY c.created_at ASC`,
        [issueId]
    );
    return result.rows;
};

/**
 * Fetch a single comment by its own ID (used for auth checks before delete).
 */
const findById = async (commentId) => {
    const result = await pool.query(
        `SELECT ${COMMENT_COLUMNS}
     FROM   comments c
     JOIN   users u ON u.id = c.user_id
     WHERE  c.id = $1`,
        [commentId]
    );
    return result.rows[0] || null;
};

/**
 * Hard-delete a comment.
 */
const remove = async (commentId) => {
    await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
};

module.exports = { create, findByIssueId, findById, remove };
