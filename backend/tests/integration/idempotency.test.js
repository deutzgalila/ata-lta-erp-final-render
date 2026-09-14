/**
 * Idempotency middleware integration tests (Spec 2.1 / R-08).
 *
 * Verifies that an Idempotency-Key replay of a mutation returns the stored
 * first response without executing the mutation a second time, and that a
 * re-used key with a different payload is rejected with 422.
 */

jest.mock('../../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('../fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('../helpers/testServer');
const { registerUser, seedDefaults, resetMock, mockTables } = require('../fixtures/supabaseMock');

const baseClient = {
  name: 'Idempotency Test Co',
  tin: '111-222-333-00001',
  entity: 'ATA',
  retainer: false,
};

/** Give fire-and-forget persistence writes time to land in the mock store. */
const flushWrites = () => new Promise((resolve) => setTimeout(resolve, 25));

describe('Idempotency middleware', () => {
  let token;

  beforeEach(() => {
    resetMock();
    seedDefaults();
    token = registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });
  });

  it('passes mutations through unchanged when no Idempotency-Key is sent', async () => {
    const res = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(baseClient)
      .expect(201);

    expect(res.headers['idempotent-replay']).toBeUndefined();
    expect(mockTables.idempotency_keys.size).toBe(0);
  });

  it('replays the stored response for a repeated key without duplicating the record', async () => {
    const first = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send(baseClient)
      .expect(201);

    await flushWrites();
    expect(mockTables.idempotency_keys.size).toBe(1);

    const replay = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send(baseClient)
      .expect(201);

    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);

    // No second client was created.
    expect(mockTables.clients.size).toBe(1);
  });

  it('rejects a key re-used with a different payload with 422', async () => {
    await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', '2b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send(baseClient)
      .expect(201);

    await flushWrites();

    const res = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', '2b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send({ ...baseClient, name: 'Different Name Co', tin: '111-222-333-00002' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ERR_IDEMPOTENCY_KEY_REUSED');
    expect(mockTables.clients.size).toBe(1);
  });

  it('rejects an out-of-range Idempotency-Key with 422', async () => {
    const res = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', 'x'.repeat(300))
      .send(baseClient);

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ERR_INVALID_IDEMPOTENCY_KEY');
  });

  it('treats the same key under a different entity as an independent operation', async () => {
    await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .set('Idempotency-Key', '3b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send(baseClient)
      .expect(201);

    await flushWrites();

    const second = await request(app)
      .post('/v1/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'LTA')
      .set('Idempotency-Key', '3b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
      .send({ ...baseClient, entity: 'LTA', tin: '111-222-333-00003' })
      .expect(201);

    expect(second.headers['idempotent-replay']).toBeUndefined();
    expect(mockTables.clients.size).toBe(2);
  });
});
