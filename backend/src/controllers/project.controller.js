const projectService = require('../services/project.service');
const { sendSuccess } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const project = await projectService.createProject(req.user, req.body);
  sendSuccess(res, project, 201);
});

const list = asyncHandler(async (req, res) => {
  const projects = await projectService.listProjects(req.user.id);
  sendSuccess(res, { projects });
});

const getById = asyncHandler(async (req, res) => {
  const project = await projectService.getProject(req.params.id, req.user.id);
  sendSuccess(res, project);
});

const update = asyncHandler(async (req, res) => {
  const project = await projectService.updateProject(req.user, req.params.id, req.body);
  sendSuccess(res, project);
});

const archive = asyncHandler(async (req, res) => {
  const project = await projectService.archiveProject(req.user, req.params.id);
  sendSuccess(res, project);
});

const addMember = asyncHandler(async (req, res) => {
  const member = await projectService.addMember(req.user, req.params.id, req.body);
  sendSuccess(res, member, 201);
});

const removeMember = asyncHandler(async (req, res) => {
  const result = await projectService.removeMember(
    req.user,
    req.params.id,
    req.params.userId
  );
  sendSuccess(res, result);
});

module.exports = {
  create,
  list,
  getById,
  update,
  archive,
  addMember,
  removeMember,
};
