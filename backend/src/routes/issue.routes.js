const express = require('express');
const issueController = require('../controllers/issue.controller');
const authenticate = require('../middleware/auth.middleware');
const { requireProjectMember } = require('../middleware/project.middleware');
const { validate, validateParams, validateQuery } = require('../middleware/validate.middleware');
const {
    createIssueSchema,
    updateIssueSchema,
    updateStatusSchema,
    assignIssueSchema,
    listIssuesQuerySchema,
    issueIdParamSchema,
    projectIssuesParamSchema,
} = require('../validators/issue.validator');

// ─── Router 1: project-scoped issue endpoints ─────────────────────────────────
// Mounted at /api/projects — handles /:id/issues
const projectIssueRouter = express.Router();

projectIssueRouter.use(authenticate);

/**
 * @swagger
 * /api/projects/{id}/issues:
 *   post:
 *     tags: [Issues]
 *     summary: Create an issue in a project
 *     description: Any project member can create an issue. The caller becomes the reporter.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project UUID
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:       { type: string, maxLength: 300 }
 *               description: { type: string }
 *               status:      { type: string, enum: [backlog, todo, in_progress, in_review, done], default: backlog }
 *               priority:    { type: string, enum: [low, medium, high, critical], default: medium }
 *               type:        { type: string, enum: [bug, task, story, epic], default: task }
 *               assignee_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       201:
 *         description: Issue created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found or not a member
 */
projectIssueRouter.post(
    '/:id/issues',
    validateParams(projectIssuesParamSchema),
    requireProjectMember,
    validate(createIssueSchema),
    issueController.create
);

/**
 * @swagger
 * /api/projects/{id}/issues:
 *   get:
 *     tags: [Issues]
 *     summary: List issues in a project (filtered, sorted, paginated)
 *     description: >
 *       Returns paginated issues for the project. All query params are optional.
 *       Pagination uses LIMIT/OFFSET — suitable for issue boards where random page
 *       access and total-count displays are required.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project UUID
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [backlog, todo, in_progress, in_review, done] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [bug, task, story, epic] }
 *       - in: query
 *         name: assignee_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: search
 *         description: Case-insensitive substring search on issue title
 *         schema: { type: string }
 *       - in: query
 *         name: sort_by
 *         schema: { type: string, enum: [created_at, updated_at, priority, status, title], default: created_at }
 *       - in: query
 *         name: sort_order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated issue list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:    { type: boolean }
 *                 data:       { type: array }
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:        { type: integer }
 *                     page_size:   { type: integer }
 *                     total:       { type: integer }
 *                     total_pages: { type: integer }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Project not found or not a member
 */
projectIssueRouter.get(
    '/:id/issues',
    validateParams(projectIssuesParamSchema),
    requireProjectMember,
    validateQuery(listIssuesQuerySchema),
    issueController.list
);

// ─── Router 2: flat issue endpoints ──────────────────────────────────────────
// Mounted at /api/issues — handles /:id, /:id/status, /:id/assign
const issueRouter = express.Router();

issueRouter.use(authenticate);

/**
 * @swagger
 * /api/issues/{id}:
 *   get:
 *     tags: [Issues]
 *     summary: Get a single issue (with full activity log)
 *     description: Caller must be a member of the issue's project.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Issue UUID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Issue with activity array
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or caller is not a project member
 */
issueRouter.get(
    '/:id',
    validateParams(issueIdParamSchema),
    issueController.getById
);

/**
 * @swagger
 * /api/issues/{id}:
 *   patch:
 *     tags: [Issues]
 *     summary: Update issue fields
 *     description: >
 *       Any project member may update any field. Changes to status, priority,
 *       and assignee_id are recorded atomically in issue_activity within the
 *       same transaction as the UPDATE.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:       { type: string }
 *               description: { type: string, nullable: true }
 *               status:      { type: string, enum: [backlog, todo, in_progress, in_review, done] }
 *               priority:    { type: string, enum: [low, medium, high, critical] }
 *               type:        { type: string, enum: [bug, task, story, epic] }
 *               assignee_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       200:
 *         description: Updated issue
 *       400:
 *         description: Validation error or no fields provided
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueRouter.patch(
    '/:id',
    validateParams(issueIdParamSchema),
    validate(updateIssueSchema),
    issueController.update
);

/**
 * @swagger
 * /api/issues/{id}/status:
 *   patch:
 *     tags: [Issues]
 *     summary: Update issue status (focused endpoint)
 *     description: Records a status change in issue_activity atomically.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [backlog, todo, in_progress, in_review, done] }
 *     responses:
 *       200:
 *         description: Issue with updated status
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueRouter.patch(
    '/:id/status',
    validateParams(issueIdParamSchema),
    validate(updateStatusSchema),
    issueController.updateStatus
);

/**
 * @swagger
 * /api/issues/{id}/assign:
 *   patch:
 *     tags: [Issues]
 *     summary: Assign or unassign an issue
 *     description: >
 *       Pass assignee_id as a UUID to assign, or null to unassign.
 *       Change is recorded in issue_activity atomically.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assignee_id]
 *             properties:
 *               assignee_id: { type: string, format: uuid, nullable: true }
 *     responses:
 *       200:
 *         description: Issue with updated assignee
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueRouter.patch(
    '/:id/assign',
    validateParams(issueIdParamSchema),
    validate(assignIssueSchema),
    issueController.assign
);

/**
 * @swagger
 * /api/issues/{id}:
 *   delete:
 *     tags: [Issues]
 *     summary: Delete an issue
 *     description: Only the reporter, an admin, or a project_manager may delete an issue.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Issue deleted
 *       403:
 *         description: Not the reporter or a manager
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueRouter.delete(
    '/:id',
    validateParams(issueIdParamSchema),
    issueController.remove
);

module.exports = { projectIssueRouter, issueRouter };
