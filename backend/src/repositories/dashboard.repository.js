const pool = require('../config/db');

/**
 * A. Count issues grouped by status for a project.
 *
 * SQL: SELECT status, COUNT(*)::int AS count
 *      FROM issues WHERE project_id = $1
 *      GROUP BY status ORDER BY status
 *
 * GROUP BY status + COUNT(*) produces one row per status present.
 * Existing index idx_issues_project_status (project_id, status) covers
 * both the WHERE and the GROUP BY — this is an index-only scan.
 *
 * @returns {Array<{status: string, count: number}>}
 */
const countByStatus = async (projectId) => {
    const result = await pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM   issues
         WHERE  project_id = $1
         GROUP  BY status
         ORDER  BY status`,
        [projectId]
    );
    return result.rows;
};

/**
 * B. Count issues grouped by priority for a project.
 *
 * SQL: SELECT priority, COUNT(*)::int AS count
 *      FROM issues WHERE project_id = $1
 *      GROUP BY priority ORDER BY priority
 *
 * New index idx_issues_project_priority (project_id, priority) enables
 * an index-only scan — no heap access needed for COUNT.
 *
 * @returns {Array<{priority: string, count: number}>}
 */
const countByPriority = async (projectId) => {
    const result = await pool.query(
        `SELECT priority, COUNT(*)::int AS count
         FROM   issues
         WHERE  project_id = $1
         GROUP  BY priority
         ORDER  BY priority`,
        [projectId]
    );
    return result.rows;
};

/**
 * C. Count issues grouped by assignee for a project.
 *
 * SQL: LEFT JOIN users to get assignee details.
 *      A NULL assignee_id row represents unassigned issues.
 *
 * GROUP BY i.assignee_id, u.name, u.email collapses all rows per person.
 * New index idx_issues_project_assignee (project_id, assignee_id) supports
 * both the WHERE and GROUP BY key in one scan.
 *
 * @returns {Array<{assignee_id: string|null, assignee_name: string|null, assignee_email: string|null, count: number}>}
 */
const countByAssignee = async (projectId) => {
    const result = await pool.query(
        `SELECT
           i.assignee_id,
           u.name  AS assignee_name,
           u.email AS assignee_email,
           COUNT(*)::int AS count
         FROM   issues i
         LEFT   JOIN users u ON u.id = i.assignee_id
         WHERE  i.project_id = $1
         GROUP  BY i.assignee_id, u.name, u.email
         ORDER  BY count DESC`,
        [projectId]
    );
    return result.rows;
};

/**
 * D. Average resolution time (in seconds) for "done" issues in a project.
 *
 * "Closed" is defined as status = 'done', the only terminal state in the schema.
 * updated_at is set to NOW() on every PATCH, so for a done issue it captures
 * the timestamp when the issue was last moved to that state.
 *
 * SQL: SELECT EXTRACT(EPOCH FROM AVG(updated_at - created_at)) AS avg_seconds
 *      FROM issues WHERE project_id = $1 AND status = 'done'
 *
 * AVG() over the interval (updated_at - created_at) computes the mean
 * across all closed issues. EXTRACT(EPOCH ...) converts the PG interval
 * to a float number of seconds so the API can return a plain number.
 * Returns NULL when there are no done issues.
 *
 * Existing index idx_issues_project_status (project_id, status) covers
 * the WHERE clause — no new index needed.
 *
 * @returns {number|null} average seconds, or null
 */
const averageResolutionTime = async (projectId) => {
    const result = await pool.query(
        `SELECT EXTRACT(EPOCH FROM AVG(updated_at - created_at))::numeric(12,2) AS avg_seconds
         FROM   issues
         WHERE  project_id = $1
           AND  status = 'done'`,
        [projectId]
    );
    const raw = result.rows[0].avg_seconds;
    return raw !== null ? parseFloat(raw) : null;
};

/**
 * E. Recent activity for issues belonging to a project.
 *
 * SQL: JOIN issue_activity → issues (filter project) → users (actor name/email)
 *      ORDER BY ia.created_at DESC LIMIT $2
 *
 * The JOIN on issues restricts activity to this project's issues only.
 * ORDER BY newest-first + LIMIT N returns the requested slice efficiently.
 * New index idx_issue_activity_issue_created (issue_id, created_at DESC)
 * lets PostgreSQL satisfy the ORDER BY in index order, avoiding a filesort.
 *
 * @param {string} projectId
 * @param {number} limit  max rows to return (default 10, validated 1-100)
 * @returns {Array}
 */
const recentActivity = async (projectId, limit) => {
    const result = await pool.query(
        `SELECT
           ia.id,
           ia.field_changed,
           ia.old_value,
           ia.new_value,
           ia.created_at,
           ia.issue_id,
           i.title  AS issue_title,
           ia.user_id,
           u.name   AS user_name,
           u.email  AS user_email
         FROM   issue_activity ia
         JOIN   issues i ON i.id = ia.issue_id
         JOIN   users  u ON u.id = ia.user_id
         WHERE  i.project_id = $1
         ORDER  BY ia.created_at DESC
         LIMIT  $2`,
        [projectId, limit]
    );
    return result.rows;
};

module.exports = {
    countByStatus,
    countByPriority,
    countByAssignee,
    averageResolutionTime,
    recentActivity,
};
