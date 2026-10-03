/**
 * Integration tests for Notifications module (/v1/notifications).
 * Validates AC-1, AC-4, cursor pagination, read-all, and /v1/me unread counter.
 */

jest.mock('../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('./fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('./helpers/testServer');
const { registerUser, seedDefaults, resetMock, mockTables } = require('./fixtures/supabaseMock');
const { DEPARTMENT_PERMISSIONS } = require('../src/lib/permissions');

describe('/v1/notifications API Endpoints', () => {
  let userAToken;
  let userBToken;
  const userAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeAll(() => {
    // Grant notifications:view to standard departments for integration testing
    Object.keys(DEPARTMENT_PERMISSIONS).forEach((dept) => {
      if (!DEPARTMENT_PERMISSIONS[dept].includes('notifications:view')) {
        DEPARTMENT_PERMISSIONS[dept].push('notifications:view');
      }
    });
  });

  beforeEach(() => {
    resetMock();
    seedDefaults();
    if (!mockTables.notifications) {
      mockTables.notifications = new Map();
    }
    mockTables.notifications.clear();

    userAToken = registerUser({
      id: userAId,
      email: 'usera@ata-lta.ph',
      name: 'User A',
      role: 'Accounting',
      departments: ['Accounting'],
      entities: ['ATA'],
    });

    userBToken = registerUser({
      id: userBId,
      email: 'userb@ata-lta.ph',
      name: 'User B',
      role: 'Operations',
      departments: ['Operations'],
      entities: ['ATA'],
    });
  });

  describe('AC-1 (R1): User-Scoping & Cross-User Tamper Protection', () => {
    it('prevents user B from reading or seeing user A notification via GET', async () => {
      const notifAId = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      mockTables.notifications.set(notifAId, {
        id: notifAId,
        user_id: userAId,
        type: 'pending_request.resolved',
        payload: { title: 'User A Notification' },
        read_at: null,
        created_at: new Date('2026-10-03T10:00:00.000Z').toISOString(),
      });

      const resA = await request(app)
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(resA.body.data).toHaveLength(1);
      expect(resA.body.data[0].id).toBe(notifAId);

      // User B makes GET /v1/notifications - should NOT see User A's notification
      const resB = await request(app)
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(resB.body.data).toHaveLength(0);
    });

    it('prevents user B from marking user A notification as read via POST :id/read (returns 403)', async () => {
      const notifAId = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      mockTables.notifications.set(notifAId, {
        id: notifAId,
        user_id: userAId,
        type: 'wr.transition_request.received',
        payload: { title: 'User A WR Transition' },
        read_at: null,
        created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post(`/v1/notifications/${notifAId}/read`)
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(403);

      expect(res.body.title).toBe('Forbidden');
      expect(res.body.detail).toContain('permission');

      // Assert User A's notification remains unread
      const notif = mockTables.notifications.get(notifAId);
      expect(notif.read_at).toBeNull();
    });

    it('returns 404 Not Found when attempting to read a non-existent notification', async () => {
      const nonExistentId = '99999999-9999-9999-9999-999999999999';

      const res = await request(app)
        .post(`/v1/notifications/${nonExistentId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(404);

      expect(res.body.title).toBe('Not Found');
    });
  });

  describe('AC-4 (R4): Idempotent Read-Marking', () => {
    it('returns 200 on first POST :id/read and 200 on second call as a verified no-op', async () => {
      const notifId = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      mockTables.notifications.set(notifId, {
        id: notifId,
        user_id: userAId,
        type: 'wr.qa_reroute',
        payload: { title: 'QA Reroute Notice' },
        read_at: null,
        created_at: new Date().toISOString(),
      });

      // First call: marks as read
      const res1 = await request(app)
        .post(`/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(res1.body.data.id).toBe(notifId);
      expect(res1.body.data.read_at).toBeTruthy();
      const firstReadAt = res1.body.data.read_at;

      // Second call: idempotent no-op, returns 200 with unchanged read_at
      const res2 = await request(app)
        .post(`/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(res2.body.data.id).toBe(notifId);
      expect(res2.body.data.read_at).toBe(firstReadAt);

      // Verify record in database
      const row = mockTables.notifications.get(notifId);
      expect(row.read_at).toBe(firstReadAt);
    });
  });

  describe('Cursor Pagination & Ordering', () => {
    beforeEach(() => {
      // Seed 3 notifications with distinct timestamps for User A
      const timestamps = [
        '2026-10-03T10:00:00.000Z',
        '2026-10-03T11:00:00.000Z',
        '2026-10-03T12:00:00.000Z',
      ];
      timestamps.forEach((ts, idx) => {
        const id = `00000000-0000-0000-0000-00000000000${idx + 1}`;
        mockTables.notifications.set(id, {
          id,
          user_id: userAId,
          type: 'pending_request.resolved',
          payload: { index: idx },
          read_at: null,
          created_at: ts,
        });
      });
    });

    it('returns notifications newest first and paginates with cursor', async () => {
      // Page 1: limit=2
      const page1 = await request(app)
        .get('/v1/notifications?limit=2')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.data[0].created_at).toBe('2026-10-03T12:00:00.000Z');
      expect(page1.body.data[1].created_at).toBe('2026-10-03T11:00:00.000Z');
      expect(page1.body.meta.limit).toBe(2);
      expect(page1.body.meta.next_cursor).toBe('2026-10-03T11:00:00.000Z');

      // Page 2: using cursor from Page 1
      const page2 = await request(app)
        .get(`/v1/notifications?limit=2&cursor=${encodeURIComponent(page1.body.meta.next_cursor)}`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].created_at).toBe('2026-10-03T10:00:00.000Z');
      expect(page2.body.meta.next_cursor).toBeNull();
    });

    it('rejects invalid limit values (< 1 or > 100)', async () => {
      await request(app)
        .get('/v1/notifications?limit=0')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(400);

      await request(app)
        .get('/v1/notifications?limit=101')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(400);
    });

    it('rejects invalid cursor format', async () => {
      const res = await request(app)
        .get('/v1/notifications?cursor=invalid-date')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(400);

      expect(res.body.title).toBe('Validation Error');
    });
  });

  describe('POST /v1/notifications/read-all', () => {
    it('marks all own unread notifications as read and reports count', async () => {
      // 2 unread for User A, 1 already read for User A, 1 unread for User B
      mockTables.notifications.set('notif-a1', {
        id: 'notif-a1',
        user_id: userAId,
        type: 'pending_request.resolved',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });
      mockTables.notifications.set('notif-a2', {
        id: 'notif-a2',
        user_id: userAId,
        type: 'pending_request.resolved',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });
      mockTables.notifications.set('notif-a3', {
        id: 'notif-a3',
        user_id: userAId,
        type: 'pending_request.resolved',
        payload: {},
        read_at: '2026-10-01T00:00:00.000Z',
        created_at: new Date().toISOString(),
      });
      mockTables.notifications.set('notif-b1', {
        id: 'notif-b1',
        user_id: userBId,
        type: 'pending_request.resolved',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });

      const res = await request(app)
        .post('/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(res.body.data.marked).toBe(2);

      // Verify User A rows are now all read
      expect(mockTables.notifications.get('notif-a1').read_at).toBeTruthy();
      expect(mockTables.notifications.get('notif-a2').read_at).toBeTruthy();

      // Verify User B row is UNCHANGED (still unread)
      expect(mockTables.notifications.get('notif-b1').read_at).toBeNull();

      // Subsequent call marks 0
      const res2 = await request(app)
        .post('/v1/notifications/read-all')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(res2.body.data.marked).toBe(0);
    });
  });

  describe('Integration with /v1/me (unread_notifications counter)', () => {
    it('reflects correct unread count in /v1/me and updates dynamically', async () => {
      // Initially 0 unread
      const me1 = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(me1.body.data.unread_notifications).toBe(0);

      // Add 2 unread notifications for User A, 1 for User B
      const notif1 = '33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const notif2 = '44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      mockTables.notifications.set(notif1, {
        id: notif1,
        user_id: userAId,
        type: 'wr.transition_request.received',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });
      mockTables.notifications.set(notif2, {
        id: notif2,
        user_id: userAId,
        type: 'wr.transition_request.resolved',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });
      mockTables.notifications.set('b-notif', {
        id: 'b-notif',
        user_id: userBId,
        type: 'wr.transition_request.resolved',
        payload: {},
        read_at: null,
        created_at: new Date().toISOString(),
      });

      // User A should see 2 unread
      const me2 = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(me2.body.data.unread_notifications).toBe(2);

      // Mark one notification as read
      await request(app)
        .post(`/v1/notifications/${notif1}/read`)
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      // User A should now see 1 unread
      const me3 = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${userAToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(me3.body.data.unread_notifications).toBe(1);

      // User B should see 1 unread
      const meB = await request(app)
        .get('/v1/me')
        .set('Authorization', `Bearer ${userBToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(200);

      expect(meB.body.data.unread_notifications).toBe(1);
    });
  });

  describe('RBAC Guard & Authentication', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      await request(app).get('/v1/notifications').expect(401);
      await request(app).post('/v1/notifications/read-all').expect(401);
      await request(app).post('/v1/notifications/11111111-1111-1111-1111-111111111111/read').expect(401);
    });

    it('rejects users lacking notifications:view permission with 403 Forbidden', async () => {
      const restrictedToken = registerUser({
        email: 'restricted@ata-lta.ph',
        name: 'Restricted User',
        role: 'CustomRoleWithoutPermissions',
        departments: [],
        entities: ['ATA'],
      });

      const res = await request(app)
        .get('/v1/notifications')
        .set('Authorization', `Bearer ${restrictedToken}`)
        .set('X-Active-Entity', 'ATA')
        .expect(403);

      expect(res.body.title).toBe('Forbidden');
      expect(res.body.detail).toContain('notifications:view');
    });
  });
});
