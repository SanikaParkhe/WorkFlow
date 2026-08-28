const dashboardRepository = require('../repositories/dashboard.repository');

// All possible statuses in schema order
const ALL_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
// All possible priorities in schema order
const ALL_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/**
 * Build a normalised byStatus object ensuring every status is present (zero if missing).
 * This avoids the UI having to handle missing keys.
 */
const normaliseStatus = (rows) => {
    const map = Object.fromEntries(rows.map((r) => [r.status, r.count]));
    const result = {};
    for (const s of ALL_STATUSES) result[s] = map[s] ?? 0;
    return result;
};

/**
 * Build a normalised byPriority object ensuring every priority is present.
 */
const normalisePriority = (rows) => {
    const map = Object.fromEntries(rows.map((r) => [r.priority, r.count]));
    const result = {};
    for (const p of ALL_PRIORITIES) result[p] = map[p] ?? 0;
    return result;
};

/**
 * Format assignee workload rows.
 * Rows with assignee_id = NULL represent unassigned issues.
 */
const formatAssignee = (rows) =>
    rows.map((r) => ({
        assigneeId: r.assignee_id,       // null for unassigned
        assigneeName: r.assignee_name,   // null for unassigned
        assigneeEmail: r.assignee_email, // null for unassigned
        issueCount: r.count,
    }));

/**
 * Format recent activity rows into camelCase.
 */
const formatActivity = (rows) =>
    rows.map((r) => ({
        id: r.id,
        issueId: r.issue_id,
        issueTitle: r.issue_title,
        fieldChanged: r.field_changed,
        oldValue: r.old_value,
        newValue: r.new_value,
        createdAt: r.created_at,
        user: {
            id: r.user_id,
            name: r.user_name,
            email: r.user_email,
        },
    }));

/**
 * Fetch and assemble all five dashboard aggregations in parallel.
 *
 * Authorization is enforced by the requireProjectMember middleware before
 * this service is called — no need to repeat that check here.
 *
 * @param {string} projectId  UUID of the project
 * @param {number} limit      max recent-activity rows (1-100)
 */
const getDashboard = async (projectId, limit) => {
    const [
        statusRows,
        priorityRows,
        assigneeRows,
        avgSeconds,
        activityRows,
    ] = await Promise.all([
        dashboardRepository.countByStatus(projectId),
        dashboardRepository.countByPriority(projectId),
        dashboardRepository.countByAssignee(projectId),
        dashboardRepository.averageResolutionTime(projectId),
        dashboardRepository.recentActivity(projectId, limit),
    ]);

    return {
        byStatus: normaliseStatus(statusRows),
        byPriority: normalisePriority(priorityRows),
        byAssignee: formatAssignee(assigneeRows),
        averageResolutionTimeSeconds: avgSeconds,
        recentActivity: formatActivity(activityRows),
    };
};

module.exports = { getDashboard };
