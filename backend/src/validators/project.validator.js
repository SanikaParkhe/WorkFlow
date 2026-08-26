const { z } = require('zod');

const PROJECT_STATUSES = ['active', 'archived', 'on_hold'];
const PROJECT_ROLES = ['owner', 'manager', 'developer', 'viewer'];

const uuidParam = z.string().uuid('Invalid project ID');

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().max(5000).optional(),
});

const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .refine((data) => data.name || data.description !== undefined || data.status, {
    message: 'At least one field must be provided',
  });

const projectIdParamSchema = z.object({
  id: uuidParam,
});

const projectMemberParamsSchema = z.object({
  id: uuidParam,
  userId: z.string().uuid('Invalid user ID'),
});

const addMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  projectRole: z.enum(PROJECT_ROLES).default('developer'),
});

module.exports = {
  createProjectSchema,
  updateProjectSchema,
  projectIdParamSchema,
  projectMemberParamsSchema,
  addMemberSchema,
  PROJECT_STATUSES,
  PROJECT_ROLES,
};
