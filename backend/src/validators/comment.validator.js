const { z } = require('zod');

const createCommentSchema = z.object({
    body: z.string().min(1, 'Comment body is required').max(10000),
});

// Validates :id in /api/issues/:id/comments and /api/issues/:id/activity
const issueIdParamSchema = z.object({
    id: z.string().uuid('Invalid issue ID'),
});

// Validates :id in /api/comments/:id
const commentIdParamSchema = z.object({
    id: z.string().uuid('Invalid comment ID'),
});

module.exports = {
    createCommentSchema,
    issueIdParamSchema,
    commentIdParamSchema,
};
