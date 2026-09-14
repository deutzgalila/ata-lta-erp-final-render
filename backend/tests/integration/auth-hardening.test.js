/**
 * Auth hardening tests (Spec 2.8 / R-14).
 *
 * Covers the two halves of the hardening:
 * 1. Password complexity: admin-provisioned passwords must be 8-128 chars
 *    with lowercase, uppercase, digit, and special character.
 * 2. Scoped signin rate limiting: /v1/auth/signin is capped at 10 attempts
 *    per 15 minutes per IP, blunting credential brute-forcing independently
 *    of the permissive global limiter.
 */

jest.mock('../../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('../fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('../helpers/testServer');
const { registerUser, seedDefaults, resetMock } = require('../fixtures/supabaseMock');

describe('Auth hardening (R-14)', () => {
  beforeEach(() => {
    resetMock();
    seedDefaults();
  });

  const adminSetup = () =>
    registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });

  it('rejects admin-created users with weak passwords', async () => {
    const admin = adminSetup();

    for (const weak of ['password123', 'PASSWORD123!', 'Password!', 'Passw0rd', 'Sh0rt!a']) {
      const res = await request(app)
        .post('/v1/admin/users')
        .set('Authorization', `Bearer ${admin}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          email: `weak-${Math.random().toString(36).slice(2)}@ata-lta.ph`,
          name: 'Weak Password User',
          role: 'Accounting',
          entities: ['ATA'],
          password: weak,
        });

      expect(res.status).toBe(400);
    }
  });

  it('accepts admin-created users with compliant passwords', async () => {
    const admin = adminSetup();

    const res = await request(app)
      .post('/v1/admin/users')
      .set('Authorization', `Bearer ${admin}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        email: 'strong@ata-lta.ph',
        name: 'Strong Password User',
        role: 'Accounting',
        entities: ['ATA'],
        password: 'Password123!',
      })
      .expect(201);

    expect(res.body.data.email).toBe('strong@ata-lta.ph');
  });

  it('also enforces complexity on admin password resets (updateUser)', async () => {
    const admin = adminSetup();

    // Create with a compliant password first.
    const created = await request(app)
      .post('/v1/admin/users')
      .set('Authorization', `Bearer ${admin}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        email: 'reset-me@ata-lta.ph',
        name: 'Reset Me',
        role: 'Accounting',
        entities: ['ATA'],
        password: 'Password123!',
      })
      .expect(201);

    const res = await request(app)
      .put(`/v1/admin/users/${created.body.data.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .set('X-Active-Entity', 'ATA')
      .send({ password: 'weakpass1' });

    expect(res.status).toBe(400);
  });

  it('rate limits /v1/auth/signin after 10 attempts per IP', async () => {
    const attempt = () =>
      request(app)
        .post('/v1/auth/signin')
        .send({ email: 'brute@ata-lta.ph', password: 'WrongPass1!' });

    // The mock auth backend rejects every attempt with 401; the limiter must
    // count them regardless of outcome.
    for (let i = 0; i < 10; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.detail).toBe(
      'Too many authentication attempts. Please try again in 15 minutes.'
    );
  });
});
