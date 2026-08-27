const issueService = require('../services/issue.service');
const { sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
    const issue = await issueService.createIssue(req.user, req.params.id, req.body);
    sendSuccess(res, issue, 201);
});

const list = asyncHandler(async (req, res) => {
    // Use req.parsedQuery (set by validateQuery middleware) because Express 5
    // makes req.query read-only — the Zod-coerced result is stored there instead.
    const result = await issueService.listIssues(req.user, req.params.id, req.parsedQuery);
    res.status(200).json({
        success: true,
        data: result.issues,
        pagination: result.pagination,
    });
});

const getById = asyncHandler(async (req, res) => {
    const issue = await issueService.getIssue(req.user, req.params.id);
    sendSuccess(res, issue);
});

const update = asyncHandler(async (req, res) => {
    const issue = await issueService.updateIssue(req.user, req.params.id, req.body);
    sendSuccess(res, issue);
});

const updateStatus = asyncHandler(async (req, res) => {
    const issue = await issueService.updateStatus(req.user, req.params.id, req.body);
    sendSuccess(res, issue);
});

const assign = asyncHandler(async (req, res) => {
    const issue = await issueService.assignIssue(req.user, req.params.id, req.body);
    sendSuccess(res, issue);
});

const remove = asyncHandler(async (req, res) => {
    const result = await issueService.deleteIssue(req.user, req.params.id);
    sendSuccess(res, result);
});

module.exports = { create, list, getById, update, updateStatus, assign, remove };
