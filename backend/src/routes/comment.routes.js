const express = require('express');
const commentController = require('../controllers/comment.controller');
const authenticate = require('../middleware/auth.middleware');
const { validate, validateParams } = require('../middleware/validate.middleware');
const {
    createCommentSchema,
    issueIdParamSchema,
    commentIdParamSchema,
} = require('../validators/comment.validator');

// ─── Router 1: issue-scoped comment + activity endpoints ─────────────────────
// Mounted at /api/issues
const issueCommentRouter = express.Router();

issueCommentRouter.use(authenticate);

/**
 * @swagger
 * /api/issues/{id}/comments:
 *   post:
 *     tags: [Comments]
 *     summary: Add a comment to an issue
 *     description: Any project member can add a comment. The authenticated user becomes the author.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Issue UUID
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, minLength: 1, maxLength: 10000 }
 *     responses:
 *       201:
 *         description: Comment created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:        { type: string, format: uuid }
 *                     issueId:   { type: string, format: uuid }
 *                     body:      { type: string }
 *                     createdAt: { type: string, format: date-time }
 *                     author:
 *                       type: object
 *                       properties:
 *                         id:    { type: string, format: uuid }
 *                         name:  { type: string }
 *                         email: { type: string }
 *       400:
 *         description: Validation error (empty body)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or caller is not a project member
 */
issueCommentRouter.post(
    '/:id/comments',
    validateParams(issueIdParamSchema),
    validate(createCommentSchema),
    commentController.create
);

/**
 * @swagger
 * /api/issues/{id}/comments:
 *   get:
 *     tags: [Comments]
 *     summary: List comments on an issue
 *     description: Returns all comments for the issue (oldest first) with author information. Caller must be a project member.
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
 *         description: List of comments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { type: array }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueCommentRouter.get(
    '/:id/comments',
    validateParams(issueIdParamSchema),
    commentController.list
);

/**
 * @swagger
 * /api/issues/{id}/activity:
 *   get:
 *     tags: [Comments]
 *     summary: Get issue activity history (newest first)
 *     description: >
 *       Returns all issue_activity records for the issue sorted newest-first.
 *       Activity is recorded automatically when status, priority, or assignee_id changes.
 *       Each entry includes the user who performed the action.
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
 *         description: Activity history (newest first)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:           { type: string, format: uuid }
 *                       fieldChanged: { type: string }
 *                       oldValue:     { type: string, nullable: true }
 *                       newValue:     { type: string, nullable: true }
 *                       createdAt:    { type: string, format: date-time }
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:    { type: string, format: uuid }
 *                           name:  { type: string }
 *                           email: { type: string }
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Issue not found or not a project member
 */
issueCommentRouter.get(
    '/:id/activity',
    validateParams(issueIdParamSchema),
    commentController.listActivity
);

// ─── Router 2: flat comment delete ───────────────────────────────────────────
// Mounted at /api/comments
const commentRouter = express.Router();

commentRouter.use(authenticate);

/**
 * @swagger
 * /api/comments/{id}:
 *   delete:
 *     tags: [Comments]
 *     summary: Delete a comment
 *     description: Only the comment author or an admin may delete a comment.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Comment UUID
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Comment deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not the author or an admin
 *       404:
 *         description: Comment not found
 */
commentRouter.delete(
    '/:id',
    validateParams(commentIdParamSchema),
    commentController.remove
);

module.exports = { issueCommentRouter, commentRouter };
