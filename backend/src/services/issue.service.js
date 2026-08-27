const pool = require('../config/db');
const AppError = require('../utils/AppError');
const issueRepository = require('../repositories/issue.repository');
const issueActivityRepository = require('../repositories/issueActivity.repository');
const projectMemberRepository = require('../repositories/projectMember.repository');
const { canManageProjects } = require('../middleware/project.middleware');

// Only these fields produce an activity log entry when they change
const TRACKED_FIELDS = ['status', 'priority', 'assignee_id'];

// ─── Formatters ──────────────────────────────────────────────────────────────

const formatIssue = (row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    type: row.type,
    assigneeId: row.assignee_id,
    reporterId: row.reporter_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // reporter/assignee names are present when fetched via JOIN (findById, list)
    ...(row.reporter_name !== undefined && {
        reporter: { id: row.reporter_id, name: row.reporter_name, email: row.reporter_email },
    }),
    ...(row.assignee_name !== undefined && {
        assignee: row.assignee_id
            ? { id: row.assignee_id, name: row.assignee_name, email: row.assignee_email }
            : null,
    }),
});

const formatActivity = (row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensures the user is a member of the given project.
 * Throws a 404 (not 403) to avoid leaking existence of the project.
 */
const requireMembership = async (projectId, userId) => {
    const membership = await projectMemberRepository.findMembership(projectId, userId);
    if (!membership) {
        throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }
    return membership;
};

/**
 * Core transactional update used by updateIssue, updateStatus, and assignIssue.
 *
 * WHY THIS MUST BE A SINGLE TRANSACTION
 * ──────────────────────────────────────
 * The UPDATE to `issues` and the INSERT to `issue_activity` must be atomic.
 * If they are separate statements:
 *   - A crash between the two leaves the issue updated but no audit trail.
 *   - Conversely, if the INSERT runs first and the UPDATE fails, we log a
 *     change that never happened.
 * With BEGIN…COMMIT both operations either land together or roll back together,
 * so `issue_activity` is always a faithful mirror of actual issue state.
 */
const _applyUpdate = async (user, issueId, fields) => {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');

    await requireMembership(issue.project_id, user.id);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const updated = await issueRepository.update(client, issueId, fields);

        for (const field of TRACKED_FIELDS) {
            if (!(field in fields)) continue;
            const oldVal = issue[field] != null ? String(issue[field]) : null;
            const newVal = fields[field] != null ? String(fields[field]) : null;
            if (oldVal !== newVal) {
                await issueActivityRepository.insert(client, {
                    issueId,
                    userId: user.id,
                    fieldChanged: field,
                    oldValue: oldVal,
                    newValue: newVal,
                });
            }
        }

        await client.query('COMMIT');
        return updated;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// ─── Public service functions ─────────────────────────────────────────────────

const createIssue = async (user, projectId, body) => {
    const issue = await issueRepository.create(null, {
        projectId,
        title: body.title,
        description: body.description,
        status: body.status || 'backlog',
        priority: body.priority || 'medium',
        type: body.type || 'task',
        assigneeId: body.assignee_id ?? null,
        reporterId: user.id,
    });
    return formatIssue(issue);
};

const listIssues = async (user, projectId, query) => {
    const { rows, total } = await issueRepository.list(projectId, query);
    const { page, page_size } = query;
    return {
        issues: rows.map(formatIssue),
        pagination: {
            page,
            page_size,
            total,
            total_pages: Math.ceil(total / page_size) || 1,
        },
    };
};

const getIssue = async (user, issueId) => {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');

    await requireMembership(issue.project_id, user.id);

    const activity = await issueActivityRepository.findByIssueId(issueId);
    return {
        ...formatIssue(issue),
        activity: activity.map(formatActivity),
    };
};

const updateIssue = async (user, issueId, body) => {
    const updated = await _applyUpdate(user, issueId, body);
    return formatIssue(updated);
};

const updateStatus = async (user, issueId, { status }) => {
    const updated = await _applyUpdate(user, issueId, { status });
    return formatIssue(updated);
};

const assignIssue = async (user, issueId, { assignee_id }) => {
    const updated = await _applyUpdate(user, issueId, { assignee_id: assignee_id ?? null });
    return formatIssue(updated);
};

const deleteIssue = async (user, issueId) => {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');

    await requireMembership(issue.project_id, user.id);

    if (issue.reporter_id !== user.id && !canManageProjects(user)) {
        throw new AppError(
            'Only the reporter, an admin, or a project manager can delete issues',
            403,
            'FORBIDDEN'
        );
    }

    await issueRepository.remove(issueId);
    return { message: 'Issue deleted successfully' };
};

module.exports = {
    createIssue,
    listIssues,
    getIssue,
    updateIssue,
    updateStatus,
    assignIssue,
    deleteIssue,
};
