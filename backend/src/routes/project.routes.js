const express = require('express');
const projectController = require('../controllers/project.controller');
const authenticate = require('../middleware/auth.middleware');
const {
  requireProjectManager,
  loadProject,
  requireProjectMember,
} = require('../middleware/project.middleware');
const { validate, validateParams, validateQuery } = require('../middleware/validate.middleware');
const {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  projectMemberParamsSchema,
  addMemberSchema,
} = require('../validators/project.validator');
const dashboardController = require('../controllers/dashboard.controller');
const { dashboardParamSchema, dashboardQuerySchema } = require('../validators/dashboard.validator');

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a project (admin or project_manager only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Project created; creator is added as owner member atomically
 *       403:
 *         description: Forbidden — requires admin or project_manager role
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/',
  requireProjectManager,
  validate(createProjectSchema),
  projectController.create
);

/**
 * @swagger
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects the current user belongs to
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Projects where the user is a member
 *       401:
 *         description: Unauthorized
 */
router.get('/', projectController.list);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project details (members only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project with member list
 *       404:
 *         description: Project not found or not a member
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/:id',
  validateParams(projectIdParamSchema),
  requireProjectMember,
  loadProject,
  projectController.getById
);

/**
 * @swagger
 * /api/projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update a project (admin or project_manager only)
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
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               status: { type: string, enum: [active, archived, on_hold] }
 *     responses:
 *       200:
 *         description: Project updated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Project not found
 */
router.patch(
  '/:id',
  validateParams(projectIdParamSchema),
  requireProjectManager,
  validate(updateProjectSchema),
  projectController.update
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Archive a project (soft delete via status column)
 *     description: Sets status to archived. Row is kept for history and foreign keys.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Project archived
 *       400:
 *         description: Already archived
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Project not found
 */
router.delete(
  '/:id',
  validateParams(projectIdParamSchema),
  requireProjectManager,
  projectController.archive
);

/**
 * @swagger
 * /api/projects/{id}/members:
 *   post:
 *     tags: [Projects]
 *     summary: Add a member to a project
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
 *             required: [userId]
 *             properties:
 *               userId: { type: string, format: uuid }
 *               projectRole: { type: string, enum: [owner, manager, developer, viewer] }
 *     responses:
 *       201:
 *         description: Member added
 *       409:
 *         description: User is already a member
 *       404:
 *         description: Project or user not found
 *       403:
 *         description: Forbidden
 */
router.post(
  '/:id/members',
  validateParams(projectIdParamSchema),
  requireProjectManager,
  validate(addMemberSchema),
  projectController.addMember
);

/**
 * @swagger
 * /api/projects/{id}/members/{userId}:
 *   delete:
 *     tags: [Projects]
 *     summary: Remove a member from a project
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Member removed
 *       400:
 *         description: Cannot remove project owner
 *       404:
 *         description: Project or member not found
 *       403:
 *         description: Forbidden
 */
router.delete(
  '/:id/members/:userId',
  validateParams(projectMemberParamsSchema),
  requireProjectManager,
  projectController.removeMember
);

/**
 * @swagger
 * /api/projects/{id}/dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get project dashboard aggregations
 *     description: >
 *       Returns five aggregated metrics computed entirely in PostgreSQL:
 *       issue counts by status and priority, workload per assignee,
 *       average resolution time for closed (done) issues, and the most
 *       recent activity across all project issues.
 *       Only authenticated project members may access this endpoint.
 *       Non-members receive 404 to avoid leaking project existence.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Project UUID
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of recent activity entries to return (1–100, default 10)
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 10 }
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     byStatus:
 *                       type: object
 *                       description: Issue count per status (all statuses always present)
 *                       example: { backlog: 4, todo: 8, in_progress: 3, in_review: 2, done: 10 }
 *                     byPriority:
 *                       type: object
 *                       description: Issue count per priority (all priorities always present)
 *                       example: { low: 5, medium: 10, high: 8, critical: 4 }
 *                     byAssignee:
 *                       type: array
 *                       description: Workload per assignee; assigneeId=null means unassigned
 *                       items:
 *                         type: object
 *                         properties:
 *                           assigneeId:    { type: string, format: uuid, nullable: true }
 *                           assigneeName:  { type: string, nullable: true }
 *                           assigneeEmail: { type: string, nullable: true }
 *                           issueCount:    { type: integer }
 *                     averageResolutionTimeSeconds:
 *                       type: number
 *                       nullable: true
 *                       description: >
 *                         Average seconds from created_at to updated_at for done issues.
 *                         Null when no done issues exist.
 *                     recentActivity:
 *                       type: array
 *                       description: Latest activity entries, newest first
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:           { type: string, format: uuid }
 *                           issueId:      { type: string, format: uuid }
 *                           issueTitle:   { type: string }
 *                           fieldChanged: { type: string }
 *                           oldValue:     { type: string, nullable: true }
 *                           newValue:     { type: string, nullable: true }
 *                           createdAt:    { type: string, format: date-time }
 *                           user:
 *                             type: object
 *                             properties:
 *                               id:    { type: string, format: uuid }
 *                               name:  { type: string }
 *                               email: { type: string }
 *       400:
 *         description: Validation error (invalid UUID or limit out of range)
 *       401:
 *         description: Unauthorized — JWT missing or invalid
 *       404:
 *         description: Project not found or caller is not a project member
 */
router.get(
  '/:id/dashboard',
  validateParams(dashboardParamSchema),
  requireProjectMember,
  validateQuery(dashboardQuerySchema),
  dashboardController.get
);

module.exports = router;
