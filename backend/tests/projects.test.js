const request = require('supertest');
const createApp = require('../src/app');
const pool = require('../src/config/db');
const { registerAndLogin, authHeader } = require('./helpers/auth');
const { cleanupAll } = require('./helpers/testDb');

const app = createApp();

const pmUser = {
  email: 'pm@workflow.test',
  password: 'Password1',
  name: 'Project Manager',
  role: 'project_manager',
};

const adminUser = {
  email: 'admin@workflow.test',
  password: 'Password1',
  name: 'Admin User',
  role: 'admin',
};

const devUser = {
  email: 'dev@workflow.test',
  password: 'Password1',
  name: 'Developer',
  role: 'developer',
};

const outsiderUser = {
  email: 'outsider@workflow.test',
  password: 'Password1',
  name: 'Outsider',
  role: 'developer',
};

const memberUser = {
  email: 'member@workflow.test',
  password: 'Password1',
  name: 'Team Member',
  role: 'developer',
};

describe('Projects API', () => {
  let pmToken;
  let adminToken;
  let devToken;
  let outsiderToken;
  let memberToken;
  let memberUserId;

  beforeEach(async () => {
    await cleanupAll();

    ({ accessToken: pmToken } = await registerAndLogin(app, pmUser));
    ({ accessToken: adminToken } = await registerAndLogin(app, adminUser));
    ({ accessToken: devToken } = await registerAndLogin(app, devUser));
    ({ accessToken: outsiderToken } = await registerAndLogin(app, outsiderUser));
    ({ accessToken: memberToken, user: { id: memberUserId } } = await registerAndLogin(
      app,
      memberUser
    ));
  });

  afterAll(async () => {
    await cleanupAll();
  });

  describe('POST /api/projects', () => {
    it('allows project_manager to create a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'PM Project', description: 'Created by PM' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('PM Project');
      expect(res.body.data.status).toBe('active');
      expect(res.body.data.projectRole).toBe('owner');
    });

    it('allows admin to create a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(adminToken))
        .send({ name: 'Admin Project' })
        .expect(201);

      expect(res.body.data.name).toBe('Admin Project');
    });

    it('rejects developer from creating a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(devToken))
        .send({ name: 'Dev Project' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('creates creator membership in the same transaction', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Atomic Project' })
        .expect(201);

      const projectId = res.body.data.id;

      const members = await pool.query(
        'SELECT * FROM project_members WHERE project_id = $1',
        [projectId]
      );
      expect(members.rows).toHaveLength(1);
      expect(members.rows[0].project_role).toBe('owner');

      const projects = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      expect(projects.rows).toHaveLength(1);
    });

    it('does not leave orphan project if member insert fails', async () => {
      const originalAddMember = require('../src/repositories/projectMember.repository').addMember;
      const projectMemberRepository = require('../src/repositories/projectMember.repository');

      projectMemberRepository.addMember = jest.fn(async () => {
        throw new Error('Simulated member insert failure');
      });

      await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Rollback Project' })
        .expect(500);

      const projects = await pool.query(
        "SELECT * FROM projects WHERE name = 'Rollback Project'"
      );
      expect(projects.rows).toHaveLength(0);

      projectMemberRepository.addMember = originalAddMember;
    });
  });

  describe('GET /api/projects', () => {
    it('returns only projects the user is a member of', async () => {
      await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'PM Only Project' });

      const pmList = await request(app)
        .get('/api/projects')
        .set(authHeader(pmToken))
        .expect(200);

      const outsiderList = await request(app)
        .get('/api/projects')
        .set(authHeader(outsiderToken))
        .expect(200);

      expect(pmList.body.data.projects).toHaveLength(1);
      expect(outsiderList.body.data.projects).toHaveLength(0);
    });
  });

  describe('GET /api/projects/:id', () => {
    let projectId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Shared Project' });
      projectId = res.body.data.id;
    });

    it('allows members to view the project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set(authHeader(pmToken))
        .expect(200);

      expect(res.body.data.name).toBe('Shared Project');
      expect(res.body.data.members).toHaveLength(1);
    });

    it('blocks non-members from viewing the project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set(authHeader(outsiderToken))
        .expect(404);

      expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    let projectId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Original Name' });
      projectId = res.body.data.id;
    });

    it('allows project_manager to update', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set(authHeader(pmToken))
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Name');
    });

    it('rejects developer from updating', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set(authHeader(devToken))
        .send({ name: 'Hacked Name' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('DELETE /api/projects/:id', () => {
    let projectId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Archive Me' });
      projectId = res.body.data.id;
    });

    it('archives the project instead of hard deleting', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set(authHeader(pmToken))
        .expect(200);

      expect(res.body.data.status).toBe('archived');

      const row = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].status).toBe('archived');
    });

    it('still allows members to view archived projects', async () => {
      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set(authHeader(pmToken));

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set(authHeader(pmToken))
        .expect(200);

      expect(res.body.data.status).toBe('archived');
    });

    it('rejects developer from archiving', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}`)
        .set(authHeader(devToken))
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Project members', () => {
    let projectId;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/projects')
        .set(authHeader(pmToken))
        .send({ name: 'Team Project' });
      projectId = res.body.data.id;
    });

    it('allows manager to add a member with a project role', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(pmToken))
        .send({ userId: memberUserId, projectRole: 'developer' })
        .expect(201);

      expect(res.body.data.userId).toBe(memberUserId);
      expect(res.body.data.projectRole).toBe('developer');
    });

    it('rejects duplicate membership', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(pmToken))
        .send({ userId: memberUserId, projectRole: 'developer' });

      const res = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(pmToken))
        .send({ userId: memberUserId, projectRole: 'viewer' })
        .expect(409);

      expect(res.body.error.code).toBe('MEMBER_EXISTS');
    });

    it('allows newly added member to access the project', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(pmToken))
        .send({ userId: memberUserId, projectRole: 'developer' });

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set(authHeader(memberToken))
        .expect(200);

      expect(res.body.data.name).toBe('Team Project');
    });

    it('allows manager to remove a non-owner member', async () => {
      await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(pmToken))
        .send({ userId: memberUserId, projectRole: 'developer' });

      await request(app)
        .delete(`/api/projects/${projectId}/members/${memberUserId}`)
        .set(authHeader(pmToken))
        .expect(200);

      await request(app)
        .get(`/api/projects/${projectId}`)
        .set(authHeader(memberToken))
        .expect(404);
    });

    it('prevents removing the project owner', async () => {
      const owner = await pool.query(
        'SELECT owner_id FROM projects WHERE id = $1',
        [projectId]
      );

      const res = await request(app)
        .delete(`/api/projects/${projectId}/members/${owner.rows[0].owner_id}`)
        .set(authHeader(pmToken))
        .expect(400);

      expect(res.body.error.code).toBe('CANNOT_REMOVE_OWNER');
    });

    it('rejects developer from managing members', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/members`)
        .set(authHeader(devToken))
        .send({ userId: memberUserId, projectRole: 'developer' })
        .expect(403);

      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
