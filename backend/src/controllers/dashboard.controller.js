const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboard.service');

/**
 * GET /api/projects/:id/dashboard
 *
 * req.params.id  — validated project UUID (validateParams upstream)
 * req.parsedQuery.limit — validated integer 1-100 (validateQuery upstream)
 * req.membership  — set by requireProjectMember (confirms project exists + caller is member)
 */
const get = asyncHandler(async (req, res) => {
    const { id: projectId } = req.params;
    const { limit } = req.parsedQuery;

    const data = await dashboardService.getDashboard(projectId, limit);

    res.status(200).json({ success: true, data });
});

module.exports = { get };
