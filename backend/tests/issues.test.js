const request = require('supertest');
const createApp = require('../src/app');
const pool = require('../src/config/db');
const { registerAndLogin, authHeader } = require('./helpers/auth');
const { cleanupAll } = require('./helpers/testDb');

const app = createApp();

// ─── Test users ───────────────────────────────────────────────────────────────
const pmUser = {
    email: 'pm.issues@workflow.test',
    password: 'Password1',
    name: 'Issues PM',
    role: 'project_manager',
};
const devUser = {
    email: 'dev.issues@workflow.test',
    password: 'Password1',
    name: 'Issues Dev',
    role: 'developer',
};
const outsiderUser = {
    email: 'outsider.issues@workflow.test',
    password: 'Password1',
    name: 'Issues Outsider',
    role: 'developer',
};

// Extend testDb cleanup to also remove our test emails
const EXTRA_EMAILS = [pmUser.email, devUser.email, outsiderUser.email];

const cleanupExtended = async () => {
    await cleanupAll();
    // cleanupAll already targets TEST_EMAILS; clean ours too in case they differ
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [EXTRA_EMAILS]);
};

// ─── Test suite ───────────────────────────────────────────────────────────────
describe('Issues API', () => {
    let pmToken, pmUserId;
    let devToken, devUserId;
    let outsiderToken;
    let projectId;

    beforeEach(async () => {
        await cleanupExtended();

        ({ accessToken: pmToken, user: { id: pmUserId } } = await registerAndLogin(app, pmUser));
        ({ accessToken: devToken, user: { id: devUserId } } = await registerAndLogin(app, devUser));
        ({ accessToken: outsiderToken } = await registerAndLogin(app, outsiderUser));

        // Create a project (PM becomes owner-member automatically)
        const res = await request(app)
            .post('/api/projects')
            .set(authHeader(pmToken))
            .send({ name: 'Issue Test Project' });
        projectId = res.body.data.id;

        // Add dev as a project member
        await request(app)
            .post(`/api/projects/${projectId}/members`)
            .set(authHeader(pmToken))
            .send({ userId: devUserId, projectRole: 'developer' });
    });

    afterAll(async () => {
        await cleanupExtended();
    });

    // ─── POST /api/projects/:id/issues ─────────────────────────────────────────
    describe('POST /api/projects/:id/issues', () => {
        it('creates an issue and returns 201 with formatted data', async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Fix login bug', priority: 'high', type: 'bug' })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.title).toBe('Fix login bug');
            expect(res.body.data.priority).toBe('high');
            expect(res.body.data.type).toBe('bug');
            expect(res.body.data.status).toBe('backlog');
            expect(res.body.data.reporterId).toBe(pmUserId);
        });

        it('applies default status/priority/type when not provided', async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Minimal issue' })
                .expect(201);

            expect(res.body.data.status).toBe('backlog');
            expect(res.body.data.priority).toBe('medium');
            expect(res.body.data.type).toBe('task');
        });

        it('allows a project member (developer) to create an issue', async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(devToken))
                .send({ title: 'Dev-created issue' })
                .expect(201);

            expect(res.body.data.reporterId).toBe(devUserId);
        });

        it('rejects a non-member with 404', async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(outsiderToken))
                .send({ title: 'Sneaky issue' })
                .expect(404);

            expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
        });

        it('rejects missing title with 400', async () => {
            await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ priority: 'high' })
                .expect(400);
        });

        it('rejects invalid status enum with 400', async () => {
            await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Bad status issue', status: 'invalid_status' })
                .expect(400);
        });
    });

    // ─── GET /api/projects/:id/issues ──────────────────────────────────────────
    describe('GET /api/projects/:id/issues', () => {
        beforeEach(async () => {
            // Seed a variety of issues
            await request(app).post(`/api/projects/${projectId}/issues`).set(authHeader(pmToken))
                .send({ title: 'Alpha bug', status: 'todo', priority: 'high', type: 'bug' });
            await request(app).post(`/api/projects/${projectId}/issues`).set(authHeader(pmToken))
                .send({ title: 'Beta task', status: 'in_progress', priority: 'medium', type: 'task' });
            await request(app).post(`/api/projects/${projectId}/issues`).set(authHeader(pmToken))
                .send({ title: 'Gamma story', status: 'todo', priority: 'low', type: 'story', assignee_id: devUserId });
            await request(app).post(`/api/projects/${projectId}/issues`).set(authHeader(pmToken))
                .send({ title: 'Delta epic', status: 'backlog', priority: 'critical', type: 'epic' });
        });

        it('returns all issues with correct pagination shape', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toHaveLength(4);
            expect(res.body.pagination).toMatchObject({
                page: 1,
                page_size: 20,
                total: 4,
                total_pages: 1,
            });
        });

        it('filters by status', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?status=todo`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(2);
            res.body.data.forEach((i) => expect(i.status).toBe('todo'));
        });

        it('filters by priority', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?priority=high`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Alpha bug');
        });

        it('filters by type', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?type=bug`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].type).toBe('bug');
        });

        it('filters by assignee_id', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?assignee_id=${devUserId}`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Gamma story');
        });

        it('filters by search text (case-insensitive)', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?search=beta`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Beta task');
        });

        it('combines multiple filters', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?status=todo&type=bug`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(1);
            expect(res.body.data[0].title).toBe('Alpha bug');
        });

        it('paginates correctly — page 1 of 2 with page_size=2', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?page=1&page_size=2&sort_by=title&sort_order=asc`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(2);
            expect(res.body.pagination).toMatchObject({
                page: 1,
                page_size: 2,
                total: 4,
                total_pages: 2,
            });
            // asc by title: Alpha, Beta
            expect(res.body.data[0].title).toBe('Alpha bug');
            expect(res.body.data[1].title).toBe('Beta task');
        });

        it('paginates correctly — page 2 of 2 with page_size=2', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?page=2&page_size=2&sort_by=title&sort_order=asc`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(2);
            expect(res.body.pagination.page).toBe(2);
            // asc, second page: Delta, Gamma
            expect(res.body.data[0].title).toBe('Delta epic');
            expect(res.body.data[1].title).toBe('Gamma story');
        });

        it('returns empty data array when no issues match filter', async () => {
            const res = await request(app)
                .get(`/api/projects/${projectId}/issues?status=done`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(0);
            expect(res.body.pagination.total).toBe(0);
        });

        it('blocks non-member from listing issues with 404', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/issues`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });

        it('rejects invalid page_size with 400', async () => {
            await request(app)
                .get(`/api/projects/${projectId}/issues?page_size=999`)
                .set(authHeader(pmToken))
                .expect(400);
        });
    });

    // ─── GET /api/issues/:id ────────────────────────────────────────────────────
    describe('GET /api/issues/:id', () => {
        let issueId;

        beforeEach(async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Viewable issue', status: 'todo' });
            issueId = res.body.data.id;
        });

        it('returns the issue with an activity key', async () => {
            const res = await request(app)
                .get(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.id).toBe(issueId);
            expect(res.body.data.title).toBe('Viewable issue');
            expect(Array.isArray(res.body.data.activity)).toBe(true);
        });

        it('includes reporter and assignee objects from JOIN', async () => {
            const res = await request(app)
                .get(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data.reporter).toMatchObject({ id: pmUserId });
            expect(res.body.data.assignee).toBeNull();
        });

        it('blocks non-member with 404', async () => {
            await request(app)
                .get(`/api/issues/${issueId}`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });

        it('returns 404 for non-existent issue', async () => {
            await request(app)
                .get('/api/issues/00000000-0000-0000-0000-000000000000')
                .set(authHeader(pmToken))
                .expect(404);
        });
    });

    // ─── PATCH /api/issues/:id ──────────────────────────────────────────────────
    describe('PATCH /api/issues/:id (bulk update)', () => {
        let issueId;

        beforeEach(async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Original title', status: 'backlog', priority: 'low' });
            issueId = res.body.data.id;
        });

        it('updates title and non-tracked fields without creating activity rows', async () => {
            const res = await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({ title: 'Updated title', type: 'bug' })
                .expect(200);

            expect(res.body.data.title).toBe('Updated title');
            expect(res.body.data.type).toBe('bug');

            // title and type are not tracked, so no activity rows
            const activity = await pool.query(
                'SELECT * FROM issue_activity WHERE issue_id = $1',
                [issueId]
            );
            expect(activity.rows).toHaveLength(0);
        });

        it('records activity when status changes', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({ status: 'in_progress' })
                .expect(200);

            const activity = await pool.query(
                "SELECT * FROM issue_activity WHERE issue_id = $1 AND field_changed = 'status'",
                [issueId]
            );
            expect(activity.rows).toHaveLength(1);
            expect(activity.rows[0].old_value).toBe('backlog');
            expect(activity.rows[0].new_value).toBe('in_progress');
        });

        it('records activity when priority changes', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({ priority: 'critical' })
                .expect(200);

            const activity = await pool.query(
                "SELECT * FROM issue_activity WHERE issue_id = $1 AND field_changed = 'priority'",
                [issueId]
            );
            expect(activity.rows).toHaveLength(1);
            expect(activity.rows[0].old_value).toBe('low');
            expect(activity.rows[0].new_value).toBe('critical');
        });

        it('records multiple activity rows in one request when multiple tracked fields change', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({ status: 'done', priority: 'high', assignee_id: devUserId })
                .expect(200);

            const activity = await pool.query(
                'SELECT field_changed FROM issue_activity WHERE issue_id = $1 ORDER BY created_at ASC',
                [issueId]
            );
            const fields = activity.rows.map((r) => r.field_changed);
            expect(fields).toContain('status');
            expect(fields).toContain('priority');
            expect(fields).toContain('assignee_id');
            expect(activity.rows).toHaveLength(3);
        });

        it('does NOT write an activity row when value is identical', async () => {
            // Set status to something then update it to the same value
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({ status: 'backlog' }); // same as current

            const activity = await pool.query(
                'SELECT * FROM issue_activity WHERE issue_id = $1',
                [issueId]
            );
            expect(activity.rows).toHaveLength(0);
        });

        it('blocks non-member with 404', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(outsiderToken))
                .send({ title: 'Hacked' })
                .expect(404);
        });

        it('rejects empty body with 400', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .send({})
                .expect(400);
        });
    });

    // ─── PATCH /api/issues/:id/status ──────────────────────────────────────────
    describe('PATCH /api/issues/:id/status', () => {
        let issueId;

        beforeEach(async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Status issue', status: 'backlog' });
            issueId = res.body.data.id;
        });

        it('updates status and writes exactly one activity row', async () => {
            const res = await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_review' })
                .expect(200);

            expect(res.body.data.status).toBe('in_review');

            const activity = await pool.query(
                'SELECT * FROM issue_activity WHERE issue_id = $1',
                [issueId]
            );
            expect(activity.rows).toHaveLength(1);
            expect(activity.rows[0].field_changed).toBe('status');
            expect(activity.rows[0].old_value).toBe('backlog');
            expect(activity.rows[0].new_value).toBe('in_review');
        });

        it('atomically rolls back if something fails mid-transaction', async () => {
            // Patch the repository to throw after the UPDATE
            const issueRepo = require('../src/repositories/issue.repository');
            const activityRepo = require('../src/repositories/issueActivity.repository');
            const origInsert = activityRepo.insert;

            activityRepo.insert = jest.fn(async () => {
                throw new Error('Simulated activity insert failure');
            });

            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'done' })
                .expect(500);

            // Issue status must still be 'backlog' — UPDATE was rolled back
            const row = await pool.query('SELECT status FROM issues WHERE id = $1', [issueId]);
            expect(row.rows[0].status).toBe('backlog');

            // No orphan activity row
            const activity = await pool.query('SELECT * FROM issue_activity WHERE issue_id = $1', [issueId]);
            expect(activity.rows).toHaveLength(0);

            activityRepo.insert = origInsert;
        });

        it('rejects invalid status value with 400', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'flying' })
                .expect(400);
        });
    });

    // ─── PATCH /api/issues/:id/assign ──────────────────────────────────────────
    describe('PATCH /api/issues/:id/assign', () => {
        let issueId;

        beforeEach(async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Assign me' });
            issueId = res.body.data.id;
        });

        it('assigns a user and writes an activity row', async () => {
            const res = await request(app)
                .patch(`/api/issues/${issueId}/assign`)
                .set(authHeader(pmToken))
                .send({ assignee_id: devUserId })
                .expect(200);

            expect(res.body.data.assigneeId).toBe(devUserId);

            const activity = await pool.query(
                "SELECT * FROM issue_activity WHERE issue_id = $1 AND field_changed = 'assignee_id'",
                [issueId]
            );
            expect(activity.rows).toHaveLength(1);
            expect(activity.rows[0].old_value).toBeNull();
            expect(activity.rows[0].new_value).toBe(devUserId);
        });

        it('unassigns a user (null) and writes an activity row', async () => {
            // First assign
            await request(app)
                .patch(`/api/issues/${issueId}/assign`)
                .set(authHeader(pmToken))
                .send({ assignee_id: devUserId });

            // Then unassign
            const res = await request(app)
                .patch(`/api/issues/${issueId}/assign`)
                .set(authHeader(pmToken))
                .send({ assignee_id: null })
                .expect(200);

            expect(res.body.data.assigneeId).toBeNull();

            const activity = await pool.query(
                "SELECT * FROM issue_activity WHERE issue_id = $1 AND field_changed = 'assignee_id' ORDER BY created_at ASC",
                [issueId]
            );
            expect(activity.rows).toHaveLength(2);
            expect(activity.rows[1].old_value).toBe(devUserId);
            expect(activity.rows[1].new_value).toBeNull();
        });
    });

    // ─── DELETE /api/issues/:id ─────────────────────────────────────────────────
    describe('DELETE /api/issues/:id', () => {
        let issueId;

        beforeEach(async () => {
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Delete me' });
            issueId = res.body.data.id;
        });

        it('reporter can delete their own issue', async () => {
            await request(app)
                .delete(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .expect(200);

            const row = await pool.query('SELECT id FROM issues WHERE id = $1', [issueId]);
            expect(row.rows).toHaveLength(0);
        });

        it('project_manager can delete any issue', async () => {
            // Dev creates an issue
            const devRes = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(devToken))
                .send({ title: 'Dev issue' });
            const devIssueId = devRes.body.data.id;

            // PM (manager) deletes it
            await request(app)
                .delete(`/api/issues/${devIssueId}`)
                .set(authHeader(pmToken))
                .expect(200);
        });

        it("non-reporter project member cannot delete another member's issue", async () => {
            // PM created `issueId`; dev tries to delete
            const res = await request(app)
                .delete(`/api/issues/${issueId}`)
                .set(authHeader(devToken))
                .expect(403);

            expect(res.body.error.code).toBe('FORBIDDEN');
        });

        it('non-member gets 404', async () => {
            await request(app)
                .delete(`/api/issues/${issueId}`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });

        it('returns 404 for already-deleted issue', async () => {
            await request(app).delete(`/api/issues/${issueId}`).set(authHeader(pmToken));
            await request(app)
                .delete(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .expect(404);
        });
    });

    // ─── Activity log — GET shows accumulated history ──────────────────────────
    describe('Activity log accumulation', () => {
        it('GET /api/issues/:id returns all activity rows in chronological order', async () => {
            // Create issue
            const res = await request(app)
                .post(`/api/projects/${projectId}/issues`)
                .set(authHeader(pmToken))
                .send({ title: 'Activity tracked issue', status: 'backlog', priority: 'low' });
            const issueId = res.body.data.id;

            // Make three sequential changes
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'todo' });

            await request(app)
                .patch(`/api/issues/${issueId}/assign`)
                .set(authHeader(pmToken))
                .send({ assignee_id: devUserId });

            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_progress' });

            const getRes = await request(app)
                .get(`/api/issues/${issueId}`)
                .set(authHeader(pmToken))
                .expect(200);

            const activity = getRes.body.data.activity;
            expect(activity).toHaveLength(3);
            expect(activity[0].fieldChanged).toBe('status');
            expect(activity[0].newValue).toBe('todo');
            expect(activity[1].fieldChanged).toBe('assignee_id');
            expect(activity[2].fieldChanged).toBe('status');
            expect(activity[2].newValue).toBe('in_progress');
        });
    });
});
