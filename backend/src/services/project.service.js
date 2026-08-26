const pool = require('../config/db');
const AppError = require('../utils/AppError');
const projectRepository = require('../repositories/project.repository');
const projectMemberRepository = require('../repositories/projectMember.repository');
const userRepository = require('../repositories/user.repository');
const { canManageProjects } = require('../middleware/project.middleware');

const formatProject = (project, membership = null) => ({
  id: project.id,
  name: project.name,
  description: project.description,
  ownerId: project.owner_id,
  status: project.status,
  createdAt: project.created_at,
  ...(membership && { projectRole: membership.project_role || membership.projectRole }),
});

const formatMember = (row) => ({
  userId: row.user_id,
  projectRole: row.project_role,
  joinedAt: row.joined_at,
  name: row.name,
  email: row.email,
});

const createProject = async (user, { name, description }) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const project = await projectRepository.create(client, {
      name,
      description,
      ownerId: user.id,
    });

    await projectMemberRepository.addMember(client, {
      projectId: project.id,
      userId: user.id,
      projectRole: 'owner',
    });

    await client.query('COMMIT');

    return formatProject(project, { project_role: 'owner' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listProjects = async (userId) => {
  const rows = await projectRepository.listByMemberId(userId);
  return rows.map((row) => formatProject(row, row));
};

const getProject = async (projectId, userId) => {
  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  const membership = await projectMemberRepository.findMembership(projectId, userId);
  if (!membership) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  const members = await projectMemberRepository.listByProjectId(projectId);

  return {
    ...formatProject(project, membership),
    members: members.map(formatMember),
  };
};

const updateProject = async (user, projectId, data) => {
  if (!canManageProjects(user)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  const updated = await projectRepository.update(projectId, {
    name: data.name,
    description: data.description,
    status: data.status,
  });

  return formatProject(updated);
};

const archiveProject = async (user, projectId) => {
  if (!canManageProjects(user)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  if (project.status === 'archived') {
    throw new AppError('Project is already archived', 400, 'ALREADY_ARCHIVED');
  }

  const archived = await projectRepository.archive(projectId);
  return formatProject(archived);
};

const addMember = async (user, projectId, { userId, projectRole }) => {
  if (!canManageProjects(user)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  const targetUser = await userRepository.findById(userId);
  if (!targetUser) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const existing = await projectMemberRepository.findMembership(projectId, userId);
  if (existing) {
    throw new AppError('User is already a project member', 409, 'MEMBER_EXISTS');
  }

  const member = await projectMemberRepository.addMember(null, {
    projectId,
    userId,
    projectRole,
  });

  return {
    userId: member.user_id,
    projectRole: member.project_role,
    joinedAt: member.joined_at,
    name: targetUser.name,
    email: targetUser.email,
  };
};

const removeMember = async (user, projectId, userId) => {
  if (!canManageProjects(user)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const project = await projectRepository.findById(projectId);
  if (!project) {
    throw new AppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }

  const membership = await projectMemberRepository.findMembership(projectId, userId);
  if (!membership) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  if (project.owner_id === userId || membership.project_role === 'owner') {
    throw new AppError('Cannot remove the project owner', 400, 'CANNOT_REMOVE_OWNER');
  }

  await projectMemberRepository.removeMember(projectId, userId);
  return { message: 'Member removed successfully' };
};

module.exports = {
  createProject,
  listProjects,
  getProject,
  updateProject,
  archiveProject,
  addMember,
  removeMember,
};
