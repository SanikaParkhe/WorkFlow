const AppError = require('../utils/AppError');
const projectRepository = require('../repositories/project.repository');
const projectMemberRepository = require('../repositories/projectMember.repository');

const MANAGER_ROLES = ['admin', 'project_manager'];

const canManageProjects = (user) => MANAGER_ROLES.includes(user.role);

const requireProjectManager = (req, res, next) => {
  if (!canManageProjects(req.user)) {
    return next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
  }
  next();
};

const loadProject = async (req, res, next) => {
  const project = await projectRepository.findById(req.params.id);

  if (!project) {
    return next(new AppError('Project not found', 404, 'PROJECT_NOT_FOUND'));
  }

  req.project = project;
  next();
};

const requireProjectMember = async (req, res, next) => {
  const membership = await projectMemberRepository.findMembership(
    req.params.id,
    req.user.id
  );

  if (!membership) {
    return next(new AppError('Project not found', 404, 'PROJECT_NOT_FOUND'));
  }

  req.membership = membership;
  next();
};

module.exports = {
  requireProjectManager,
  loadProject,
  requireProjectMember,
  canManageProjects,
};
