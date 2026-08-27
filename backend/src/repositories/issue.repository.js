const pool = require('../config/db');

// Columns for JOIN queries (reporter + assignee names)
const ISSUE_COLUMNS = `
  i.id, i.project_id, i.title, i.description, i.status, i.priority, i.type,
  i.assignee_id, i.reporter_id, i.created_at, i.updated_at,
  r.name  AS reporter_name,  r.email  AS reporter_email,
  a.name  AS assignee_name,  a.email  AS assignee_email
`;

const ISSUE_BASE_COLUMNS = `
  id, project_id, title, description, status, priority, type,
  assignee_id, reporter_id, created_at, updated_at
`;

// Fields allowed in a dynamic UPDATE
const ALLOWED_UPDATE_FIELDS = ['title', 'description', 'status', 'priority', 'type', 'assignee_id'];

// Whitelist for ORDER BY to prevent SQL injection (values come from Zod enum, extra safety)
const SORT_COLUMN_MAP = {
    created_at: 'i.created_at',
    updated_at: 'i.updated_at',
    priority: 'i.priority',
    status: 'i.status',
    title: 'i.title',
};

const create = async (client, { projectId, title, description, status, priority, type, assigneeId, reporterId }) => {
    const db = client || pool;
    const result = await db.query(
        `INSERT INTO issues (project_id, title, description, status, priority, type, assignee_id, reporter_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${ISSUE_BASE_COLUMNS}`,
        [projectId, title, description ?? null, status, priority, type, assigneeId ?? null, reporterId]
    );
    return result.rows[0];
};

const findById = async (id) => {
    const result = await pool.query(
        `SELECT ${ISSUE_COLUMNS}
     FROM   issues i
     LEFT JOIN users r ON r.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE  i.id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

/**
 * Filtered, sorted, paginated issue list for a project.
 * Returns { rows, total } — total is the count BEFORE pagination.
 */
const list = async (projectId, { status, priority, type, assignee_id, search, sort_by, sort_order, page, page_size }) => {
    const conditions = ['i.project_id = $1'];
    const params = [projectId];
    let idx = 2;

    if (status) { conditions.push(`i.status = $${idx++}`); params.push(status); }
    if (priority) { conditions.push(`i.priority = $${idx++}`); params.push(priority); }
    if (type) { conditions.push(`i.type = $${idx++}`); params.push(type); }
    if (assignee_id) { conditions.push(`i.assignee_id = $${idx++}`); params.push(assignee_id); }
    if (search) { conditions.push(`i.title ILIKE $${idx++}`); params.push(`%${search}%`); }

    const where = conditions.join(' AND ');

    // Safe interpolation — both values come from Zod enum whitelist
    const orderCol = SORT_COLUMN_MAP[sort_by] || 'i.created_at';
    const orderDir = sort_order === 'asc' ? 'ASC' : 'DESC';

    const countResult = await pool.query(
        `SELECT COUNT(*) FROM issues i WHERE ${where}`,
        params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (page - 1) * page_size;
    const dataResult = await pool.query(
        `SELECT ${ISSUE_COLUMNS}
     FROM   issues i
     LEFT JOIN users r ON r.id = i.reporter_id
     LEFT JOIN users a ON a.id = i.assignee_id
     WHERE  ${where}
     ORDER  BY ${orderCol} ${orderDir}
     LIMIT  $${idx++} OFFSET $${idx++}`,
        [...params, page_size, offset]
    );

    return { rows: dataResult.rows, total };
};

/**
 * Dynamic UPDATE — only sets columns that are present in `fields`.
 * Always sets updated_at = NOW().
 * Must be called with a transaction client when combined with activity logging.
 */
const update = async (client, id, fields) => {
    const db = client || pool;
    const sets = [];
    const params = [id];
    let idx = 2;

    for (const key of ALLOWED_UPDATE_FIELDS) {
        if (key in fields) {
            sets.push(`${key} = $${idx++}`);
            params.push(fields[key]);
        }
    }
    sets.push('updated_at = NOW()');

    const result = await db.query(
        `UPDATE issues
     SET    ${sets.join(', ')}
     WHERE  id = $1
     RETURNING ${ISSUE_BASE_COLUMNS}`,
        params
    );
    return result.rows[0] || null;
};

const remove = async (id) => {
    await pool.query('DELETE FROM issues WHERE id = $1', [id]);
};

module.exports = { create, findById, list, update, remove };
