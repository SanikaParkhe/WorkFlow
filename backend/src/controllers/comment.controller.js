const asyncHandler = require('../utils/asyncHandler');
const commentService = require('../services/comment.service');

const create = asyncHandler(async (req, res) => {
    const comment = await commentService.createComment(req.user, req.params.id, req.body.body);
    res.status(201).json({ success: true, data: comment });
});

const list = asyncHandler(async (req, res) => {
    const comments = await commentService.listComments(req.user, req.params.id);
    res.status(200).json({ success: true, data: comments });
});

const remove = asyncHandler(async (req, res) => {
    const result = await commentService.deleteComment(req.user, req.params.id);
    res.status(200).json({ success: true, data: result });
});

const listActivity = asyncHandler(async (req, res) => {
    const activity = await commentService.listActivity(req.user, req.params.id);
    res.status(200).json({ success: true, data: activity });
});

module.exports = { create, list, remove, listActivity };
