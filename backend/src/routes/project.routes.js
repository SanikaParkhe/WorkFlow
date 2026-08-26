const express = require('express');
const projectController = require('../controllers/project.controller');
const authenticate = require('../middleware/auth.middleware');
const {
  requireProjectManager,
  loadProject,
  requireProjectMember,
} = require('../middleware/project.middleware');
const { validate, validateParams } = require('../middleware/validate.middleware');
const {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  projectMemberParamsSchema,
  addMemberSchema,
} = require('../validators/project.validator');

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

module.exports = router;
