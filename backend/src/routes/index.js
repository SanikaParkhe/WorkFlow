const express = require('express');
const authRoutes = require('./auth.routes');
const projectRoutes = require('./project.routes');
const { projectIssueRouter, issueRouter } = require('./issue.routes');
const { issueCommentRouter, commentRouter } = require('./comment.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/projects', projectIssueRouter);
router.use('/issues', issueRouter);
router.use('/issues', issueCommentRouter);
router.use('/comments', commentRouter);

module.exports = router;
