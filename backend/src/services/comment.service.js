const pool = require('../config/db');
const AppError = require('../utils/AppError');
const issueRepository = require('../repositories/issue.repository');
const commentRepository = require('../repositories/comment.repository');
const issueActivityRepository = require('../repositories/issueActivity.repository');
const projectMemberRepository = require('../repositories/projectMember.repository');

// ─── Formatters ──────────────────────────────────────────────────────────────

const formatComment = (row) => ({
    id: row.id,
    issueId: row.issue_id,
    body: row.body,
    createdAt: row.created_at,
    author: {
        id: row.author_id,
        name: row.author_name,
        email: row.author_email,
    },
});

const formatActivity = (row) => ({
    id: row.id,
    fieldChanged: row.field_changed,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
    user: {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email,
    },
});

// ─── Guard helpers ────────────────────────────────────────────────────────────

/**
 * Verifies the issue exists and the caller is a project member.
 * Always throws 404 (not 403) to avoid leaking issue existence to non-members.
 */
const requireIssueMembership = async (issueId, userId) => {
    const issue = await issueRepository.findById(issueId);
    if (!issue) throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');

    const membership = await projectMemberRepository.findMembership(issue.project_id, userId);
    if (!membership) throw new AppError('Issue not found', 404, 'ISSUE_NOT_FOUND');

    return issue;
};

/**
 * Fetch the raw comment row (user_id + issue_id) needed for delete auth checks.
 * The comment.repository returns joined rows (author_*), so we query directly here.
 */
const findRawComment = async (commentId) => {
    const result = await pool.query(
        'SELECT id, issue_id, user_id FROM comments WHERE id = $1',
        [commentId]
    );
    return result.rows[0] || null;
};

// ─── Public service functions ──────────────────────────────────────────────────

const createComment = async (user, issueId, body) => {
    await requireIssueMembership(issueId, user.id);
    const comment = await commentRepository.create(issueId, user.id, body);
    return formatComment(comment);
};

const listComments = async (user, issueId) => {
    await requireIssueMembership(issueId, user.id);
    const rows = await commentRepository.findByIssueId(issueId);
    return rows.map(formatComment);
};

const deleteComment = async (user, commentId) => {
    const raw = await findRawComment(commentId);
    if (!raw) throw new AppError('Comment not found', 404, 'COMMENT_NOT_FOUND');

    // Admins can delete any comment without needing to be a project member,
    // but they still cannot delete another user's comment if they are not the author
    // unless they ARE an admin. We check the role first, then enforce membership
    // for non-admins.
    if (user.role !== 'admin') {
        // Non-admins must be a member of the issue's project
        await requireIssueMembership(raw.issue_id, user.id);

        // And must be the comment author
        if (raw.user_id !== user.id) {
            throw new AppError(
                'Only the comment author or an admin may delete this comment',
                403,
                'FORBIDDEN'
            );
        }
    }
    // Admins can delete any comment regardless of project membership

    await commentRepository.remove(commentId);
    return { message: 'Comment deleted successfully' };
};

const listActivity = async (user, issueId) => {
    await requireIssueMembership(issueId, user.id);
    const rows = await issueActivityRepository.findByIssueIdDesc(issueId);
    return rows.map(formatActivity);
};

module.exports = { createComment, listComments, deleteComment, listActivity };
