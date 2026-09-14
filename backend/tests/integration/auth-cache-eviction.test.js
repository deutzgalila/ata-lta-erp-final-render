/**
 * Auth profile-cache eviction tests (Spec 2.4 / R-13).
 *
 * The auth middleware caches user profiles in memory (5-min TTL). These
 * tests prove that admin updates and account disablement evict the cached
 * profile immediately, so permission changes take effect on the very next
 * request instead of lingering for up to the cache TTL.
 */

jest.mock('../../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('../fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('../helpers/testServer');
const { registerUser, seedDefaults, resetMock, mockTables } = require('../fixtures/supabaseMock');

const BOB_ID = 'bob-user-id';
const BOB_AUTH_ID = 'bob-auth-user-id';

const seedBob = () => {
  mockTables.users.set(BOB_ID, {
    id: BOB_ID,
    auth_user_id: BOB_AUTH_ID,
    email: 'bob@ata-lta.ph',
    name: 'Bob',
    role: 'Accounting',
    entities: ['ATA'],
    is_active: true,
  });
};

describe('Auth profile-cache eviction (R-13)', () => {
  let admin;
  let bob;

  beforeEach(() => {
    resetMock();
    seedDefaults();
    admin = registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });
    // registerUser under the same internal/auth ids so the seeded row and the
    // token both resolve to the cached profile.
    bob = registerUser({
      id: BOB_ID,
      authUserId: BOB_AUTH_ID,
      email: 'bob@ata-lta.ph',
      name: 'Bob',
      role: 'Accounting',
      entities: ['ATA'],
    });
    seedBob();
  });

  it('applies an admin role change on the very next request', async () => {
    // First request populates the profile cache with the Accounting role.
    const before = await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${bob}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    expect(before.body.data.permissions).not.toContain('users:manage');

    // Admin promotes Bob to Admin.
    await request(app)
      .put(`/v1/admin/users/${BOB_ID}`)
      .set('Authorization', `Bearer ${admin}`)
      .set('X-Active-Entity', 'ATA')
      .send({ role: 'Admin' })
      .expect(200);

    // Without eviction this would keep serving the stale Accounting profile
    // for up to 5 minutes; with eviction the new role is live immediately.
    const after = await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${bob}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    expect(after.body.data.permissions).toContain('users:manage');
  });

  it('rejects a disabled account on the very next request', async () => {
    // Populate the profile cache while the account is still active.
    await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${bob}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    // Admin disables Bob (soft delete).
    await request(app)
      .delete(`/v1/admin/users/${BOB_ID}`)
      .set('Authorization', `Bearer ${admin}`)
      .set('X-Active-Entity', 'ATA')
      .expect(204);

    // The stale cached profile would have kept Bob authenticated; eviction
    // forces a reload that sees is_active=false and rejects with 403.
    const res = await request(app)
      .get('/v1/me')
      .set('Authorization', `Bearer ${bob}`)
      .set('X-Active-Entity', 'ATA');

    expect(res.status).toBe(403);
  });
});
