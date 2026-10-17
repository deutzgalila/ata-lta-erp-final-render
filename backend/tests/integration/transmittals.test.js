/**
 * /v1/transmittals integration tests.
 */

jest.mock('../../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('../fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('../helpers/testServer');
const { registerUser, seedDefaults, resetMock, mockTables } = require('../fixtures/supabaseMock');

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const WORK_REQUEST_ID = '33333333-3333-3333-3333-333333333333';

const seedClient = () => {
  mockTables.clients.set(CLIENT_ID, {
    id: CLIENT_ID,
    entity_id: 'ent-ata',
    name: 'Acme Corp',
    tin: '123-456-789-00001',
    status: 'Active',
    created_by: 'user-1',
    updated_by: 'user-1',
  });
  mockTables.work_requests.set(WORK_REQUEST_ID, {
    id: WORK_REQUEST_ID,
    entity_id: 'ent-ata',
    client_id: CLIENT_ID,
    title: 'Acme Audit',
    status: 'In Progress',
  });
};

const validTransmittal = {
  clientId: CLIENT_ID,
  workRequestId: WORK_REQUEST_ID,
  trackingNumber: 'TR-12345',
  items: [{ description: 'Tax returns', documentType: 'Tax', quantity: 1 }],
  notes: 'Urgent',
  recipientName: 'Juan Dela Cruz',
  recipientDetails: 'Office address',
};

describe('/v1/transmittals', () => {
  beforeEach(() => {
    resetMock();
    seedDefaults();
    seedClient();
  });

  it('creates a transmittal in Draft status with approved = false', async () => {
    const token = registerUser({
      email: 'doc@ata-lta.ph',
      name: 'Doc Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    const res = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(validTransmittal)
      .expect(201);

    expect(res.body.data.status).toBe('Draft');
    expect(res.body.data.approved).toBe(false);
  });

  it('includes transmittal items in the list response', async () => {
    const USER_ID = '44444444-4444-4444-4444-444444444444';
    const token = registerUser({
      id: USER_ID,
      email: 'doc2@ata-lta.ph',
      name: 'Doc Staff Two',
      role: 'Documentation',
      entities: ['ATA'],
    });

    mockTables.tasks.set('task-trans-list', {
      id: 'task-trans-list',
      work_request_id: WORK_REQUEST_ID,
      assignee_id: USER_ID,
      deleted_at: null,
    });

    const createRes = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(validTransmittal)
      .expect(201);

    const listRes = await request(app)
      .get('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    const row = (listRes.body.data || []).find((t) => t.id === createRes.body.data.id);
    expect(row).toBeDefined();
    expect(Array.isArray(row.items)).toBe(true);
    expect(row.items.length).toBe(validTransmittal.items.length);
    expect(row.items[0].description).toBe(validTransmittal.items[0].description);
  });

  it('blocks a non-admin user from approving a transmittal', async () => {
    const token = registerUser({
      email: 'doc@ata-lta.ph',
      name: 'Doc Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    // Seed a draft transmittal
    const transmittalId = 'trans-1';
    mockTables.transmittals.set(transmittalId, {
      id: transmittalId,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      tracking_number: 'TR-12345',
      status: 'Draft',
      approved: false,
    });

    await request(app)
      .post(`/v1/transmittals/${transmittalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(403);
  });

  it('allows an admin user to approve a transmittal', async () => {
    const token = registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin User',
      role: 'Admin',
      entities: ['ATA'],
    });

    // Seed a draft transmittal
    const transmittalId = 'trans-1';
    mockTables.transmittals.set(transmittalId, {
      id: transmittalId,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      tracking_number: 'TR-12345',
      status: 'Draft',
      approved: false,
    });

    const res = await request(app)
      .post(`/v1/transmittals/${transmittalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    expect(res.body.data.approved).toBe(true);

    // Check in mock database
    const dbRecord = mockTables.transmittals.get(transmittalId);
    expect(dbRecord.approved).toBe(true);
  });

  it('blocks a non-admin user from sending an unapproved transmittal', async () => {
    const token = registerUser({
      email: 'doc@ata-lta.ph',
      name: 'Doc Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    // Seed a draft transmittal
    const transmittalId = 'trans-1';
    mockTables.transmittals.set(transmittalId, {
      id: transmittalId,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      tracking_number: 'TR-12345',
      status: 'Draft',
      approved: false,
    });

    const res = await request(app)
      .post(`/v1/transmittals/${transmittalId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(403);

    expect(res.body.detail).toContain('approved by Admin');
  });

  it('allows a non-admin user to send an approved transmittal', async () => {
    const token = registerUser({
      email: 'doc@ata-lta.ph',
      name: 'Doc Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    // Seed an approved draft transmittal
    const transmittalId = 'trans-1';
    mockTables.transmittals.set(transmittalId, {
      id: transmittalId,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      tracking_number: 'TR-12345',
      status: 'Draft',
      approved: true,
    });

    const res = await request(app)
      .post(`/v1/transmittals/${transmittalId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    expect(res.body.data.status).toBe('Sent');
  });

  it('allows an admin to send an unapproved transmittal directly', async () => {
    const token = registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin User',
      role: 'Admin',
      entities: ['ATA'],
    });

    // Seed an unapproved draft transmittal
    const transmittalId = 'trans-1';
    mockTables.transmittals.set(transmittalId, {
      id: transmittalId,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      tracking_number: 'TR-12345',
      status: 'Draft',
      approved: false,
    });

    const res = await request(app)
      .post(`/v1/transmittals/${transmittalId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .expect(200);

    expect(res.body.data.status).toBe('Sent');
  });

  it('allows an admin user to create a transmittal when active entity is ALL (resolves to fallback)', async () => {
    const token = registerUser({
      email: 'admin@ata-lta.ph',
      name: 'Admin User',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });

    const res = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ALL')
      .send(validTransmittal)
      .expect(201);

    expect(res.body.data.status).toBe('Draft');
    expect(res.body.data.entity_id).toBe('ent-ata'); // Fallback resolves to first entity UUID/ID
  });

  it('creates a transmittal linked to a task', async () => {
    const token = registerUser({
      email: 'doc@ata-lta.ph',
      name: 'Doc Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    const taskId = 'd3b07384-d113-460b-80a2-234567890123';
    const res = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send({ ...validTransmittal, linkedTaskId: taskId })
      .expect(201);

    expect(res.body.data.linked_task_id).toBe(taskId);
  });

  it('allocates sequential unique tracking numbers when trackingNumber is omitted', async () => {
    const token = registerUser({
      email: 'doc-seq@ata-lta.ph',
      name: 'Doc Seq Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    const year = new Date().getFullYear();
    const payloadWithoutTracking = {
      clientId: CLIENT_ID,
      workRequestId: WORK_REQUEST_ID,
      items: [{ description: 'Document Batch 1', documentType: 'Contract', quantity: 1 }],
    };

    const res1 = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(payloadWithoutTracking)
      .expect(201);

    expect(res1.body.data.tracking_number).toBe(`TR-ATA-${year}-0001`);

    const res2 = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(payloadWithoutTracking)
      .expect(201);

    expect(res2.body.data.tracking_number).toBe(`TR-ATA-${year}-0002`);
  });

  it('disallows updating tracking_number on existing transmittal', async () => {
    const token = registerUser({
      email: 'doc-update@ata-lta.ph',
      name: 'Doc Update Staff',
      role: 'Documentation',
      entities: ['ATA'],
    });

    const createRes = await request(app)
      .post('/v1/transmittals')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send(validTransmittal)
      .expect(201);

    const initialTracking = createRes.body.data.tracking_number;
    expect(initialTracking).toBe('TR-12345');

    const updateRes = await request(app)
      .put(`/v1/transmittals/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        trackingNumber: 'TR-TAMPERED-9999',
        notes: 'Updated notes',
      })
      .expect(200);

    expect(updateRes.body.data.notes).toBe('Updated notes');
    expect(updateRes.body.data.tracking_number).toBe('TR-12345');
  });
  it.each(['Sent', 'Acknowledged'])('allows Admin to correct %s contents without changing status', async (status) => {
    const token = registerUser({ email: 'admin-edit@ata-lta.ph', name: 'Admin', role: 'Admin', entities: ['ATA'] });
    mockTables.transmittals.set('tx-edit', {
      id: 'tx-edit', entity_id: 'ent-ata', client_id: CLIENT_ID,
      status, tracking_number: 'TR-KEEP', approved: true, version: 1,
    });
    const res = await request(app).put('/v1/transmittals/tx-edit')
      .set('Authorization', `Bearer ${token}`).set('X-Active-Entity', 'ATA')
      .send({ notes: 'Corrected', recipientName: 'New recipient',
        items: [{ description: 'Corrected document', documentType: 'Tax', quantity: 2 }], expectedVersion: 1 })
      .expect(200);
    expect(res.body.data.status).toBe(status);
    expect(res.body.data.tracking_number).toBe('TR-KEEP');
    expect(res.body.data.recipient_name).toBe('New recipient');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].description).toBe('Corrected document');
  });

  it('still rejects non-Admin edits to sent contents, including a forged role', async () => {
    const token = registerUser({ email: 'doc-edit@ata-lta.ph', name: 'Doc', role: 'Documentation', entities: ['ATA'] });
    mockTables.transmittals.set('tx-edit', {
      id: 'tx-edit', entity_id: 'ent-ata', client_id: CLIENT_ID, status: 'Sent', notes: 'Original', version: 1,
    });
    await request(app).put('/v1/transmittals/tx-edit')
      .set('Authorization', `Bearer ${token}`).set('X-Active-Entity', 'ATA')
      .send({ notes: 'Tampered', user: { role: 'Admin' }, expectedVersion: 1 }).expect(409);
    expect(mockTables.transmittals.get('tx-edit').notes).toBe('Original');
  });

  it('does not replace documents when an Admin saves a stale version', async () => {
    const token = registerUser({ email: 'admin-stale@ata-lta.ph', name: 'Admin', role: 'Admin', entities: ['ATA'] });
    mockTables.transmittals.set('tx-edit', {
      id: 'tx-edit', entity_id: 'ent-ata', client_id: CLIENT_ID, status: 'Sent', version: 2,
    });
    mockTables.transmittal_items.set('original-item', {
      id: 'original-item', transmittal_id: 'tx-edit', description: 'Original document', quantity: 1,
    });
    await request(app).put('/v1/transmittals/tx-edit')
      .set('Authorization', `Bearer ${token}`).set('X-Active-Entity', 'ATA')
      .send({ items: [{ description: 'Stale document' }], expectedVersion: 1 }).expect(409);
    expect(mockTables.transmittal_items.get('original-item').description).toBe('Original document');
  });

  it('returns the LTA entity code for company defaults when printing from detail', async () => {
    const token = registerUser({ email: 'admin-lta@ata-lta.ph', name: 'Admin', role: 'Admin', entities: ['LTA'] });
    mockTables.transmittals.set('tx-lta', {
      id: 'tx-lta', entity_id: 'ent-lta', client_id: CLIENT_ID, status: 'Draft', version: 1,
    });
    const res = await request(app).get('/v1/transmittals/tx-lta')
      .set('Authorization', `Bearer ${token}`).set('X-Active-Entity', 'LTA').expect(200);
    expect(res.body.data.entity_code).toBe('LTA');
  });

});
