const pool = require('../config/db');

/**
 * Insert one activity record.
 * Always pass a transaction `client` when called alongside an UPDATE issues.
 */
const insert = async (client, { issueId, userId, fieldChanged, oldValue, newValue }) => {
    const db = client || pool;
    const result = await db.query(
        `INSERT INTO issue_activity (issue_id, user_id, field_changed, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, issue_id, user_id, field_changed, old_value, new_value, created_at`,
        [issueId, userId, fieldChanged, oldValue ?? null, newValue ?? null]
    );
    return result.rows[0];
};

const findByIssueId = async (issueId) => {
    const result = await pool.query(
        `SELECT ia.id, ia.field_changed, ia.old_value, ia.new_value, ia.created_at,
            u.id AS user_id, u.name AS user_name
     FROM   issue_activity ia
     JOIN   users u ON u.id = ia.user_id
     WHERE  ia.issue_id = $1
     ORDER  BY ia.created_at ASC`,
        [issueId]
    );
    return result.rows;
};

module.exports = { insert, findByIssueId };
