const { z } = require('zod');

// Validates the :id path parameter on /api/projects/:id/dashboard
const dashboardParamSchema = z.object({
    id: z.string().uuid('Invalid project ID'),
});

// Validates optional ?limit query parameter for recent activity
const dashboardQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(10),
});

module.exports = { dashboardParamSchema, dashboardQuerySchema };
