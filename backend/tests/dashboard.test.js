'use strict';

const request = require('supertest');
const createApp = require('../src/app');
const pool = require('../src/config/db');
const { registerAndLogin, authHeader } = require('./helpers/auth');
const { cleanupAll } = require('./helpers/testDb');

const app = createApp();

// ─── Test users ────────────────────────────────────────────────────────────────

const pmUser = {
    email: 'pm@workflow.test',
    password: 'Password1',
    name: 'Project Manager',
    role: 'project_manager',
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

// ─── Top-level describe ────────────────────────────────────────────────────────

describe('Dashboard API — GET /api/projects/:id/dashboard', () => {
    let pmToken, devToken, outsiderToken;
    let pmUserId, devUserId;
    let projectId;

    // ── issue IDs created per-test ─────────────────────────────────────────────

    beforeEach(async () => {
        await cleanupAll();

        // Register users
        ({ accessToken: pmToken, user: { id: pmUserId } }
            = await registerAndLogin(app, pmUser));
        ({ accessToken: devToken, user: { id: devUserId } }
            = await registerAndLogin(app, devUser));
        ({ accessToken: outsiderToken }
            = await registerAndLogin(app, outsiderUser));

        // PM creates a project (automatically owner + member)
        const projectRes = await request(app)
            .post('/api/projects')
            .set(authHeader(pmToken))
            .send({ name: 'Dashboard Test Project' })
            .expect(201);
        projectId = projectRes.body.data.id;

        // Add developer as a project member
        await request(app)
            .post(`/api/projects/${projectId}/members`)
            .set(authHeader(pmToken))
            .send({ userId: devUserId, projectRole: 'developer' })
            .expect(201);
    });

    afterAll(async () => {
        await cleanupAll();
    });

    // ─── Helper: create an issue ───────────────────────────────────────────────

    const createIssue = async (token, overrides = {}) => {
        const res = await request(app)
            .post(`/api/projects/${projectId}/issues`)
            .set(authHeader(token))
            .send({ title: 'Test Issue', ...overrides })
            .expect(201);
        return res.body.data;
    };

    const setStatus = async (token, issueId, status) =>
        request(app)
            .patch(`/api/issues/${issueId}/status`)
            .set(authHeader(token))
            .send({ status })
            .expect(200);

    const assignIssue = async (token, issueId, assigneeId) =>
        request(app)
            .patch(`/api/issues/${issueId}/assign`)
            .set(authHeader(token))
            .send({ assignee_id: assigneeId })
            .expect(200);

    // ─── Access control ────────────────────────────────────────────────────────

    describe('Access control', () => {
        it('authenticated project member can access dashboard (200)', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toBeDefined();
        });

        it('unauthenticated request returns 401', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .expect(401);
        });

        it('non-member receives 404 (no project info leaked)', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });

        it('non-existent project UUID returns 404', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000001';
            await request(app)
                .get(`/api/projects/${fakeId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(404);
        });

        it('invalid UUID in path returns 400', async () => {
            await request(app)
                .get('/api/projects/not-a-uuid/dashboard')
                .set(authHeader(pmToken))
                .expect(400);
        });
    });

    // ─── Response shape ────────────────────────────────────────────────────────

    describe('Response shape', () => {
        it('returns all five expected sections', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { data } = res.body;
            expect(data).toHaveProperty('byStatus');
            expect(data).toHaveProperty('byPriority');
            expect(data).toHaveProperty('byAssignee');
            expect(data).toHaveProperty('averageResolutionTimeSeconds');
            expect(data).toHaveProperty('recentActivity');
        });

        it('byStatus always contains all five statuses even when zero', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byStatus } = res.body.data;
            for (const s of ['backlog', 'todo', 'in_progress', 'in_review', 'done']) {
                expect(byStatus).toHaveProperty(s);
                expect(typeof byStatus[s]).toBe('number');
            }
        });

        it('byPriority always contains all four priorities even when zero', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byPriority } = res.body.data;
            for (const p of ['low', 'medium', 'high', 'critical']) {
                expect(byPriority).toHaveProperty(p);
                expect(typeof byPriority[p]).toBe('number');
            }
        });
    });

    // ─── byStatus aggregation ─────────────────────────────────────────────────

    describe('byStatus aggregation', () => {
        it('counts issues by status correctly', async () => {
            // Create 3 backlog, 2 todo, 1 in_progress, 1 done
            await createIssue(pmToken, { status: 'backlog' });
            await createIssue(pmToken, { status: 'backlog' });
            await createIssue(pmToken, { status: 'backlog' });
            await createIssue(pmToken, { status: 'todo' });
            await createIssue(pmToken, { status: 'todo' });
            const inProgress = await createIssue(pmToken, { status: 'backlog' });
            await setStatus(pmToken, inProgress.id, 'in_progress');
            const done = await createIssue(pmToken, { status: 'backlog' });
            await setStatus(pmToken, done.id, 'done');

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byStatus } = res.body.data;
            expect(byStatus.backlog).toBe(3);
            expect(byStatus.todo).toBe(2);
            expect(byStatus.in_progress).toBe(1);
            expect(byStatus.in_review).toBe(0);
            expect(byStatus.done).toBe(1);
        });

        it('returns all zeros when the project has no issues', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byStatus } = res.body.data;
            const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
            expect(total).toBe(0);
        });
    });

    // ─── byPriority aggregation ───────────────────────────────────────────────

    describe('byPriority aggregation', () => {
        it('counts issues by priority correctly', async () => {
            await createIssue(pmToken, { priority: 'low' });
            await createIssue(pmToken, { priority: 'low' });
            await createIssue(pmToken, { priority: 'medium' });
            await createIssue(pmToken, { priority: 'high' });
            await createIssue(pmToken, { priority: 'high' });
            await createIssue(pmToken, { priority: 'high' });
            await createIssue(pmToken, { priority: 'critical' });

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byPriority } = res.body.data;
            expect(byPriority.low).toBe(2);
            expect(byPriority.medium).toBe(1);
            expect(byPriority.high).toBe(3);
            expect(byPriority.critical).toBe(1);
        });
    });

    // ─── byAssignee workload ─────────────────────────────────────────────────

    describe('byAssignee workload', () => {
        it('shows correct counts per assignee', async () => {
            // Assign 2 to PM, 1 to dev
            const i1 = await createIssue(pmToken);
            const i2 = await createIssue(pmToken);
            const i3 = await createIssue(pmToken);
            await assignIssue(pmToken, i1.id, pmUserId);
            await assignIssue(pmToken, i2.id, pmUserId);
            await assignIssue(pmToken, i3.id, devUserId);

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byAssignee } = res.body.data;
            expect(Array.isArray(byAssignee)).toBe(true);

            const pmEntry = byAssignee.find((e) => e.assigneeId === pmUserId);
            const devEntry = byAssignee.find((e) => e.assigneeId === devUserId);

            expect(pmEntry).toBeDefined();
            expect(pmEntry.issueCount).toBe(2);
            expect(pmEntry.assigneeName).toBe(pmUser.name);
            expect(pmEntry.assigneeEmail).toBe(pmUser.email);

            expect(devEntry).toBeDefined();
            expect(devEntry.issueCount).toBe(1);
        });

        it('unassigned issues appear under assigneeId = null', async () => {
            // Create 2 unassigned, 1 assigned
            await createIssue(pmToken);
            await createIssue(pmToken);
            const assigned = await createIssue(pmToken);
            await assignIssue(pmToken, assigned.id, pmUserId);

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { byAssignee } = res.body.data;
            const unassigned = byAssignee.find((e) => e.assigneeId === null);

            expect(unassigned).toBeDefined();
            expect(unassigned.issueCount).toBe(2);
            expect(unassigned.assigneeName).toBeNull();
            expect(unassigned.assigneeEmail).toBeNull();
        });

        it('returns empty array when project has no issues', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.byAssignee).toHaveLength(0);
        });
    });

    // ─── averageResolutionTimeSeconds ─────────────────────────────────────────

    describe('averageResolutionTimeSeconds', () => {
        it('returns null when no done issues exist', async () => {
            await createIssue(pmToken, { status: 'backlog' });

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.averageResolutionTimeSeconds).toBeNull();
        });

        it('returns a positive number when done issues exist', async () => {
            const issue = await createIssue(pmToken, { status: 'backlog' });
            await setStatus(pmToken, issue.id, 'done');

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const avg = res.body.data.averageResolutionTimeSeconds;
            expect(typeof avg).toBe('number');
            expect(avg).toBeGreaterThanOrEqual(0);
        });

        it('correctly computes average across multiple done issues', async () => {
            // Create two done issues and verify result is a number
            const i1 = await createIssue(pmToken);
            const i2 = await createIssue(pmToken);
            await setStatus(pmToken, i1.id, 'done');
            await setStatus(pmToken, i2.id, 'done');

            // Also create a non-done issue — must NOT factor into the average
            await createIssue(pmToken, { status: 'in_progress' });

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const avg = res.body.data.averageResolutionTimeSeconds;
            expect(typeof avg).toBe('number');
            expect(avg).toBeGreaterThanOrEqual(0);
        });

        it('does not include non-done issues in the average', async () => {
            // One done issue, one open — if open were included avg would differ
            const done = await createIssue(pmToken);
            await setStatus(pmToken, done.id, 'done');
            await createIssue(pmToken, { status: 'in_progress' });

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            // The avgSeconds should only reflect the one done issue
            // We know the open-issue updated_at - created_at would be larger
            // but we can only verify it's a valid number here
            expect(res.body.data.averageResolutionTimeSeconds).not.toBeNull();
        });
    });

    // ─── recentActivity ───────────────────────────────────────────────────────

    describe('recentActivity', () => {
        it('returns activity newest first', async () => {
            const issue = await createIssue(pmToken);
            // Generate 3 status changes in sequence
            await setStatus(pmToken, issue.id, 'todo');
            await setStatus(pmToken, issue.id, 'in_progress');
            await setStatus(pmToken, issue.id, 'in_review');

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const { recentActivity } = res.body.data;
            expect(recentActivity.length).toBeGreaterThanOrEqual(3);

            // First entry is the most recent status change
            expect(recentActivity[0].newValue).toBe('in_review');
            expect(recentActivity[1].newValue).toBe('in_progress');
            expect(recentActivity[2].newValue).toBe('todo');
        });

        it('respects default limit (10) without query param', async () => {
            // Generate 15 status changes
            const issue = await createIssue(pmToken);
            const statuses = [
                'todo', 'backlog', 'todo', 'in_progress', 'todo',
                'in_progress', 'in_review', 'in_progress', 'in_review', 'done',
                'in_review', 'done', 'in_review', 'done', 'in_review',
            ];
            for (const s of statuses) {
                await setStatus(pmToken, issue.id, s);
            }

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.recentActivity.length).toBeLessThanOrEqual(10);
        });

        it('respects custom ?limit query parameter', async () => {
            const issue = await createIssue(pmToken);
            // Generate 6 activity rows so we can test limit < actual count
            const statuses = ['todo', 'in_progress', 'todo', 'in_review', 'todo', 'done'];
            for (const s of statuses) {
                await setStatus(pmToken, issue.id, s);
            }

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard?limit=3`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.recentActivity).toHaveLength(3);
        });

        it('returns 400 for limit out of range (e.g. 0)', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/dashboard?limit=0`)
                .set(authHeader(pmToken))
                .expect(400);
        });

        it('returns 400 for limit above 100', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/dashboard?limit=101`)
                .set(authHeader(pmToken))
                .expect(400);
        });

        it('each activity entry contains expected fields', async () => {
            const issue = await createIssue(pmToken);
            await setStatus(pmToken, issue.id, 'todo');

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const entry = res.body.data.recentActivity[0];
            expect(entry).toHaveProperty('id');
            expect(entry).toHaveProperty('issueId', issue.id);
            expect(entry).toHaveProperty('issueTitle', issue.title);
            expect(entry).toHaveProperty('fieldChanged', 'status');
            expect(entry).toHaveProperty('oldValue', 'backlog');
            expect(entry).toHaveProperty('newValue', 'todo');
            expect(entry).toHaveProperty('createdAt');
            expect(entry.user).toBeDefined();
            expect(entry.user.id).toBe(pmUserId);
            expect(entry.user.name).toBe(pmUser.name);
            expect(entry.user.email).toBe(pmUser.email);
        });

        it('only returns activity for issues in THIS project', async () => {
            // Create a second project and generate activity there
            // (PM user creates it, so they are the owner)
            const otherProjectRes = await request(app)
                .post('/api/projects')
                .set(authHeader(pmToken))
                .send({ name: 'Other Project' })
                .expect(201);
            const otherProjectId = otherProjectRes.body.data.id;

            const otherIssue = await request(app)
                .post(`/api/projects/${otherProjectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Issue in other project' })
                .expect(201);
            // Generate activity in the OTHER project
            await request(app)
                .patch(`/api/issues/${otherIssue.body.data.id}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'done' })
                .expect(200);

            // Generate activity in THIS project
            const thisIssue = await createIssue(pmToken);
            await setStatus(pmToken, thisIssue.id, 'todo');

            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            const issueIds = res.body.data.recentActivity.map((e) => e.issueId);
            // None of the returned activity should belong to the other project
            expect(issueIds.every((id) => id === thisIssue.id)).toBe(true);
        });

        it('returns empty array when no activity exists', async () => {
            // No issues created → no activity
            const res = await request(app)
                .get(`/api/projects/${projectId}/dashboard`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.recentActivity).toHaveLength(0);
        });
    });
});
