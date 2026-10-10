/**
 * Test Suite: UAT2-9 (Assignee task status mutation)
 *
 * Verifies:
 * 1. Task assignees in task_assignees or legacy tasks.assignee_id can transition status
 *    to 'In Progress' or 'Completed' without holding workflow:edit.
 * 2. Status 'Complete' is normalized to 'Completed'.
 * 3. Assignees cannot update other fields (403 Forbidden, "Assignees may only update task status").
 * 4. Assignees cannot set disallowed statuses (400 Bad Request).
 * 5. Non-assignees receive 403 Forbidden ("One of permissions [workflow:edit] is required").
 * 6. Phase prerequisite gate remains enforced (409 Conflict, code: 'PHASE_PREREQUISITE').
 * 7. PUT routes remain strictly guarded by workflow:edit (403 Forbidden).
 * 8. Admin / Manager retain full unrestricted edit access.
 */

jest.mock('../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('./fixtures/supabaseMock');
  return { supabaseAdmin };
});

const request = require('supertest');
const { app } = require('./helpers/testServer');
const {
  registerUser,
  seedDefaults,
  resetMock,
  mockTables,
} = require('./fixtures/supabaseMock');

describe('UAT2-9: Assignee Task Status Mutation', () => {
  const CLIENT_ID = '11111111-0000-0000-0000-000000000001';
  const WR_ID = '22222222-0000-0000-0000-000000000002';
  const TASK_PRE_ID = '33333333-0000-0000-0000-000000000003';
  const TASK_PROC_ID = '44444444-0000-0000-0000-000000000004';
  const TASK_LEGACY_ID = '55555555-0000-0000-0000-000000000005';

  let adminToken;
  let staffToken;
  let staffUser;
  let otherStaffToken;

  beforeEach(() => {
    resetMock();
    seedDefaults();

    adminToken = registerUser({
      id: '99999999-9999-9999-9999-999999999999',
      email: 'UAT-admin@ata-lta.ph',
      name: 'UAT Admin',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    });

    staffUser = {
      id: '88888888-8888-8888-8888-888888888888',
      email: 'UAT-staff-ops@ata-lta.ph',
      name: 'UAT Operations Staff',
      role: 'Operations',
      entities: ['ATA'],
    };
    staffToken = registerUser(staffUser);

    otherStaffToken = registerUser({
      id: '77777777-7777-7777-7777-777777777777',
      email: 'UAT-other-staff@ata-lta.ph',
      name: 'UAT Other Staff',
      role: 'Operations',
      entities: ['ATA'],
    });

    mockTables.clients.set(CLIENT_ID, {
      id: CLIENT_ID,
      entity_id: 'ent-ata',
      name: 'UAT Client',
      status: 'Active',
    });

    mockTables.work_requests.set(WR_ID, {
      id: WR_ID,
      entity_id: 'ent-ata',
      client_id: CLIENT_ID,
      title: 'UAT Work Request',
      status: 'In Progress',
      phase: 'pre_processing',
    });

    // Task 1: pre_processing task assigned to staffUser via task_assignees
    mockTables.tasks.set(TASK_PRE_ID, {
      id: TASK_PRE_ID,
      work_request_id: WR_ID,
      entity_id: 'ent-ata',
      title: 'Pre-processing Task',
      status: 'Assigned',
      phase: 'pre_processing',
      assignee_id: staffUser.id,
      assignee_name: staffUser.name,
      deleted_at: null,
    });
    mockTables.task_assignees.set(`ta-${TASK_PRE_ID}`, {
      id: `ta-${TASK_PRE_ID}`,
      task_id: TASK_PRE_ID,
      user_id: staffUser.id,
    });

    // Task 2: processing task assigned to staffUser via task_assignees
    mockTables.tasks.set(TASK_PROC_ID, {
      id: TASK_PROC_ID,
      work_request_id: WR_ID,
      entity_id: 'ent-ata',
      title: 'Processing Task',
      status: 'Assigned',
      phase: 'processing',
      assignee_id: staffUser.id,
      assignee_name: staffUser.name,
      deleted_at: null,
    });
    mockTables.task_assignees.set(`ta-${TASK_PROC_ID}`, {
      id: `ta-${TASK_PROC_ID}`,
      task_id: TASK_PROC_ID,
      user_id: staffUser.id,
    });

    // Task 3: legacy assignee_id only (no task_assignees row)
    mockTables.tasks.set(TASK_LEGACY_ID, {
      id: TASK_LEGACY_ID,
      work_request_id: WR_ID,
      entity_id: 'ent-ata',
      title: 'Legacy Assigned Task',
      status: 'Assigned',
      phase: 'pre_processing',
      assignee_id: staffUser.id,
      assignee_name: staffUser.name,
      deleted_at: null,
    });
  });

  test('1. Assignee transitions own task to "In Progress" (200 OK)', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('In Progress');
  });

  test('2. Assignee transitions own task to "Completed" (200 OK)', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'Completed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
  });

  test('3. Assignee transitions with "Complete" normalized to "Completed" (200 OK)', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'Complete' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Completed');
  });

  test('4. Assignee via legacy tasks.assignee_id transitions own task (200 OK)', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_LEGACY_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('In Progress');
  });

  test('5. Non-assignee staff without workflow:edit receives 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${otherStaffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress' });

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('One of permissions [workflow:edit] is required');
  });

  test('6. Assignee attempting to mutate extra fields receives 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress', title: 'Tampered Title' });

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('Assignees may only update task status');

    // Verify title not changed in DB
    const task = mockTables.tasks.get(TASK_PRE_ID);
    expect(task.title).toBe('Pre-processing Task');
  });

  test('7. Assignee attempting to mutate non-status field only receives 403 Forbidden', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ description: 'Tampered description' });

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('Assignees may only update task status');
  });

  test('8. Assignee attempting disallowed status receives 400 Bad Request', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'Cancelled' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toBe('Assignees may only update task status to "In Progress" or "Completed"');
  });

  test('9. Processing task prerequisite gate remains active for assignees (409 Conflict)', async () => {
    // pre_processing task is still 'Assigned' (incomplete)
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PROC_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHASE_PREREQUISITE');

    // Complete the pre_processing task
    mockTables.tasks.get(TASK_PRE_ID).status = 'Completed';
    mockTables.tasks.get(TASK_LEGACY_ID).status = 'Completed';

    // Now advance processing task -> 200 OK
    const res2 = await request(app)
      .patch(`/v1/tasks/${TASK_PROC_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({ status: 'In Progress' });

    expect(res2.status).toBe(200);
    expect(res2.body.data.status).toBe('In Progress');
  });

  test('10. Admin retains full unrestricted editing (200 OK)', async () => {
    const res = await request(app)
      .patch(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        title: 'Admin Updated Title',
        description: 'New Description',
        status: 'In Progress',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Admin Updated Title');
  });

  test('11. PUT endpoint strictly rejects non-workflow:edit users (403 Forbidden)', async () => {
    const res = await request(app)
      .put(`/v1/tasks/${TASK_PRE_ID}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        title: 'Full Replacement',
        status: 'In Progress',
      });

    expect(res.status).toBe(403);
    expect(res.body.detail).toBe('One of permissions [workflow:edit] is required');
  });
});
