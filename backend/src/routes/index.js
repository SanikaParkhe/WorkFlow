const express = require('express');
const authRoutes = require('./auth.routes');
const projectRoutes = require('./project.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);

module.exports = router;
