const { z } = require('zod');

const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];
const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'];
const ISSUE_TYPES = ['bug', 'task', 'story', 'epic'];
const SORT_BY_OPTIONS = ['created_at', 'updated_at', 'priority', 'status', 'title'];
const SORT_ORDERS = ['asc', 'desc'];

const createIssueSchema = z.object({
    title: z.string().min(1, 'Title is required').max(300),
    description: z.string().max(10000).optional(),
    status: z.enum(ISSUE_STATUSES).default('backlog'),
    priority: z.enum(ISSUE_PRIORITIES).default('medium'),
    type: z.enum(ISSUE_TYPES).default('task'),
    assignee_id: z.string().uuid('Invalid assignee ID').nullable().optional(),
});

const updateIssueSchema = z
    .object({
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(10000).nullable().optional(),
        status: z.enum(ISSUE_STATUSES).optional(),
        priority: z.enum(ISSUE_PRIORITIES).optional(),
        type: z.enum(ISSUE_TYPES).optional(),
        assignee_id: z.string().uuid('Invalid assignee ID').nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided',
    });

const updateStatusSchema = z.object({
    status: z.enum(ISSUE_STATUSES),
});

const assignIssueSchema = z.object({
    assignee_id: z.string().uuid('Invalid assignee ID').nullable(),
});

const listIssuesQuerySchema = z.object({
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    type: z.enum(ISSUE_TYPES).optional(),
    assignee_id: z.string().uuid('Invalid assignee ID').optional(),
    search: z.string().max(200).optional(),
    sort_by: z.enum(SORT_BY_OPTIONS).default('created_at'),
    sort_order: z.enum(SORT_ORDERS).default('desc'),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20),
});

const issueIdParamSchema = z.object({
    id: z.string().uuid('Invalid issue ID'),
});

const projectIssuesParamSchema = z.object({
    id: z.string().uuid('Invalid project ID'),
});

module.exports = {
    createIssueSchema,
    updateIssueSchema,
    updateStatusSchema,
    assignIssueSchema,
    listIssuesQuerySchema,
    issueIdParamSchema,
    projectIssuesParamSchema,
    ISSUE_STATUSES,
    ISSUE_PRIORITIES,
    ISSUE_TYPES,
};
