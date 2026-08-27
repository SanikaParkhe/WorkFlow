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

// ─── Top-level describe ────────────────────────────────────────────────────────

describe('Comments and Activity API', () => {
    let pmToken, adminToken, devToken, outsiderToken;
    let pmUserId, adminUserId, devUserId;
    let projectId, issueId;

    beforeEach(async () => {
        await cleanupAll();

        // Register users
        ({ accessToken: pmToken, user: { id: pmUserId } } = await registerAndLogin(app, pmUser));
        ({ accessToken: adminToken, user: { id: adminUserId } } = await registerAndLogin(app, adminUser));
        ({ accessToken: devToken, user: { id: devUserId } } = await registerAndLogin(app, devUser));
        ({ accessToken: outsiderToken } = await registerAndLogin(app, outsiderUser));

        // PM creates a project (becomes owner/member automatically)
        const projectRes = await request(app)
            .post('/api/projects')
            .set(authHeader(pmToken))
            .send({ name: 'Test Project' })
            .expect(201);
        projectId = projectRes.body.data.id;

        // Add developer as a project member
        await request(app)
            .post(`/api/projects/${projectId}/members`)
            .set(authHeader(pmToken))
            .send({ userId: devUserId, projectRole: 'developer' })
            .expect(201);

        // PM creates an issue
        const issueRes = await request(app)
            .post(`/api/projects/${projectId}/issues`)
            .set(authHeader(pmToken))
            .send({ title: 'Test Issue', description: 'For comments testing' })
            .expect(201);
        issueId = issueRes.body.data.id;
    });

    afterAll(async () => {
        await cleanupAll();
    });

    // ─── POST /api/issues/:id/comments ──────────────────────────────────────────

    describe('POST /api/issues/:id/comments', () => {
        it('authenticated project member can create a comment', async () => {
            const res = await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: 'This is a comment.' })
                .expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data.body).toBe('This is a comment.');
            expect(res.body.data.issueId).toBe(issueId);
            expect(res.body.data.id).toBeDefined();
            expect(res.body.data.createdAt).toBeDefined();
        });

        it('returns author information on the created comment', async () => {
            const res = await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(devToken))
                .send({ body: 'Dev comment.' })
                .expect(201);

            expect(res.body.data.author).toBeDefined();
            expect(res.body.data.author.id).toBe(devUserId);
            expect(res.body.data.author.name).toBe(devUser.name);
            expect(res.body.data.author.email).toBe(devUser.email);
        });

        it('unauthenticated user cannot create a comment', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .send({ body: 'No auth.' })
                .expect(401);
        });

        it('non-member cannot create a comment (gets 404)', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(outsiderToken))
                .send({ body: 'I am not a member.' })
                .expect(404);
        });

        it('rejects empty body with 400', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: '' })
                .expect(400);
        });

        it('rejects missing body field with 400', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({})
                .expect(400);
        });

        it('returns 404 for non-existent issue', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            await request(app)
                .post(`/api/issues/${fakeId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: 'Test' })
                .expect(404);
        });
    });

    // ─── GET /api/issues/:id/comments ───────────────────────────────────────────

    describe('GET /api/issues/:id/comments', () => {
        it('project member can list comments', async () => {
            // Add two comments
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: 'First comment' });
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(devToken))
                .send({ body: 'Second comment' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data).toHaveLength(2);
        });

        it('returns comments with correct content', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: 'My specific comment' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .expect(200);

            const comment = res.body.data[0];
            expect(comment.body).toBe('My specific comment');
            expect(comment.issueId).toBe(issueId);
        });

        it('returns author information on each comment', async () => {
            await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(devToken))
                .send({ body: 'Dev authored' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .expect(200);

            const comment = res.body.data[0];
            expect(comment.author).toBeDefined();
            expect(comment.author.id).toBe(devUserId);
            expect(comment.author.name).toBe(devUser.name);
            expect(comment.author.email).toBe(devUser.email);
        });

        it('returns empty array when no comments exist', async () => {
            const res = await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(0);
        });

        it('unauthenticated user cannot view comments', async () => {
            await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .expect(401);
        });

        it('non-member cannot view comments (gets 404)', async () => {
            await request(app)
                .get(`/api/issues/${issueId}/comments`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });
    });

    // ─── DELETE /api/comments/:id ────────────────────────────────────────────────

    describe('DELETE /api/comments/:id', () => {
        let commentId;
        let devCommentId;

        beforeEach(async () => {
            // PM creates a comment
            const pmComment = await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(pmToken))
                .send({ body: 'PM comment to delete' });
            commentId = pmComment.body.data.id;

            // Dev creates a comment
            const devComment = await request(app)
                .post(`/api/issues/${issueId}/comments`)
                .set(authHeader(devToken))
                .send({ body: 'Dev comment' });
            devCommentId = devComment.body.data.id;
        });

        it('comment author can delete their own comment', async () => {
            const res = await request(app)
                .delete(`/api/comments/${commentId}`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.message).toBe('Comment deleted successfully');

            // Confirm it's gone
            const comments = await pool.query('SELECT id FROM comments WHERE id = $1', [commentId]);
            expect(comments.rows).toHaveLength(0);
        });

        it('admin can delete another user\'s comment', async () => {
            // Admin is not a project member but IS an admin
            const res = await request(app)
                .delete(`/api/comments/${devCommentId}`)
                .set(authHeader(adminToken))
                .expect(200);

            expect(res.body.success).toBe(true);
        });

        it('non-author non-admin gets 403', async () => {
            // Dev trying to delete PM's comment
            await request(app)
                .delete(`/api/comments/${commentId}`)
                .set(authHeader(devToken))
                .expect(403);
        });

        it('unauthenticated user cannot delete a comment', async () => {
            await request(app)
                .delete(`/api/comments/${commentId}`)
                .expect(401);
        });

        it('returns 404 for non-existent comment', async () => {
            const fakeId = '00000000-0000-0000-0000-000000000000';
            await request(app)
                .delete(`/api/comments/${fakeId}`)
                .set(authHeader(pmToken))
                .expect(404);
        });
    });

    // ─── GET /api/issues/:id/activity ───────────────────────────────────────────

    describe('GET /api/issues/:id/activity', () => {
        it('project member can retrieve issue activity', async () => {
            // Create some activity by changing status
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_progress' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.data.length).toBeGreaterThanOrEqual(1);
        });

        it('activity is returned newest first', async () => {
            // Create activity in sequence
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'todo' });

            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_progress' });

            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_review' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(pmToken))
                .expect(200);

            const rows = res.body.data;
            expect(rows).toHaveLength(3);
            // Newest-first: last status change should be first in the list
            expect(rows[0].newValue).toBe('in_review');
            expect(rows[1].newValue).toBe('in_progress');
            expect(rows[2].newValue).toBe('todo');
        });

        it('activity contains the user who performed the action', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'done' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(pmToken))
                .expect(200);

            const activity = res.body.data[0];
            expect(activity.user).toBeDefined();
            expect(activity.user.id).toBe(pmUserId);
            expect(activity.user.name).toBe(pmUser.name);
            expect(activity.user.email).toBe(pmUser.email);
        });

        it('returns correct field_changed, old_value, new_value', async () => {
            await request(app)
                .patch(`/api/issues/${issueId}/status`)
                .set(authHeader(pmToken))
                .send({ status: 'in_progress' });

            const res = await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(pmToken))
                .expect(200);

            const activity = res.body.data[0];
            expect(activity.fieldChanged).toBe('status');
            expect(activity.oldValue).toBe('backlog');
            expect(activity.newValue).toBe('in_progress');
        });

        it('returns empty array when no activity exists', async () => {
            const res = await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(pmToken))
                .expect(200);

            expect(res.body.data).toHaveLength(0);
        });

        it('unauthenticated user cannot view activity', async () => {
            await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .expect(401);
        });

        it('non-member cannot view activity (gets 404)', async () => {
            await request(app)
                .get(`/api/issues/${issueId}/activity`)
                .set(authHeader(outsiderToken))
                .expect(404);
        });
    });
});
