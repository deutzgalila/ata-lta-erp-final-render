/**
 * P0-D PR-2 Test Suite: Phase-Lock Guards & Prerequisite Gates
 *
 * Verifies:
 * 1. Task Phase-Lock Guard:
 *    - Tasks receive phase from their section at creation (pre_processing or processing).
 *    - Task phase is immutable thereafter: any attempt to update, alter, or patch phase
 *      via PUT/PATCH /v1/work-requests/:wrId/tasks/:taskId, /v1/operations/tasks/:taskId,
 *      or /v1/tasks/:taskId returns 400 Bad Request with code: 'TASK_PHASE_IMMUTABLE'.
 * 2. Prerequisite Gates (Rule R5 & Spec §3.2):
 *    - A processing task cannot transition out of Draft or Assigned (e.g. to In Progress,
 *      For Review, Completed) while ANY active (non-Cancelled) pre_processing task of the
 *      same WR is not Completed -> returns 409 Conflict with code: 'PHASE_PREREQUISITE'.
 *    - Once all active pre_processing tasks of the same WR are Completed, the processing
 *      task transition succeeds with 200 OK.
 * 3. Cancelled Tasks Exclusion:
 *    - Cancelled pre_processing tasks are strictly excluded from the prerequisite gate check.
 *    - Cancelled pre_processing tasks do NOT block processing tasks.
 *    - Cancelling a processing task is allowed even if pre_processing tasks are open.
 * 4. Phase Model API Cleanliness:
 *    - toApiTask and toApiWorkRequest return phase, qaStatus/qa_status, phase_entered_at,
 *      and assignees with attribution.
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

const createClient = async (token, entity = 'ATA') => {
  const res = await request(app)
    .post('/v1/clients')
    .set('Authorization', `Bearer ${token}`)
    .set('X-Active-Entity', entity)
    .send({
      name: 'Phase Routing Test Client',
      tin: `999-000-${String(Math.random()).slice(2, 7)}`,
      entity,
    });
  return res.body.data;
};

describe('P0-D PR-2: Phase-Lock Guards & Prerequisite Gates', () => {
  let adminToken;
  let adminUser;
  let client;

  beforeEach(async () => {
    resetMock();
    seedDefaults();

    adminUser = {
      id: '99999999-8888-7777-6666-555555555555',
      email: 'admin-routing@ata-lta.ph',
      name: 'Admin Routing',
      role: 'Admin',
      entities: ['ATA', 'LTA'],
    };
    adminToken = registerUser(adminUser);

    client = await createClient(adminToken, 'ATA');
  });

  const createWorkRequestWithPhases = async (phasesConfig) => {
    const res = await request(app)
      .post('/v1/operations/work-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Active-Entity', 'ATA')
      .send({
        title: 'Phase Routing Integration WR',
        clientId: client.id,
        entity: 'ATA',
        phases: phasesConfig,
      });
    return res.body.data;
  };

  describe('1. Task Phase-Lock Guard (Task Phase Immutability)', () => {
    it('rejects attempt to mutate task phase via PUT /v1/work-requests/:wrId/tasks/:taskId with 400 Bad Request', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [{ title: 'Pre Task 1', local_id: 'pre1' }],
        },
        processing: {
          tasks: [{ title: 'Proc Task 1', local_id: 'proc1' }],
        },
      });

      const preTask = wr.phases.pre_processing.tasks[0];
      expect(preTask.phase).toBe('pre_processing');

      // Attempt to mutate phase to 'processing'
      const putRes = await request(app)
        .put(`/v1/work-requests/${wr.id}/tasks/${preTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Pre Task 1 Renamed',
          phase: 'processing',
        });

      expect(putRes.status).toBe(400);
      expect(putRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
      expect(putRes.body.detail).toMatch(/phase is immutable/i);

      // Verify phase remained unchanged in DB
      const taskInDb = mockTables.tasks.get(preTask.id);
      expect(taskInDb.phase).toBe('pre_processing');
    });

    it('rejects attempt to mutate task phase via PATCH /v1/work-requests/:wrId/tasks/:taskId with 400 Bad Request', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [{ title: 'Pre Task 1', local_id: 'pre1' }],
        },
      });

      const task = wr.phases.pre_processing.tasks[0];

      const patchRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          phase: 'processing',
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
    });

    it('rejects attempt to mutate task phase via PUT /v1/operations/tasks/:taskId with 400 Bad Request', async () => {
      const wr = await createWorkRequestWithPhases({
        processing: {
          tasks: [{ title: 'Proc Task 1', local_id: 'proc1' }],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const putRes = await request(app)
        .put(`/v1/operations/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          phase: 'pre_processing',
        });

      expect(putRes.status).toBe(400);
      expect(putRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
    });

    it('rejects attempt to mutate task phase via PATCH /v1/operations/tasks/:taskId with 400 Bad Request', async () => {
      const wr = await createWorkRequestWithPhases({
        processing: {
          tasks: [{ title: 'Proc Task 1', local_id: 'proc1' }],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const patchRes = await request(app)
        .patch(`/v1/operations/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          phase: 'pre_processing',
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
    });

    it('rejects attempt to mutate task phase via PATCH /v1/tasks/:taskId with 400 Bad Request', async () => {
      const wr = await createWorkRequestWithPhases({
        processing: {
          tasks: [{ title: 'Proc Task 1', local_id: 'proc1' }],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const patchRes = await request(app)
        .patch(`/v1/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          phase: null,
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
    });

    it('rejects setting phase even if passed identical to existing phase value', async () => {
      const wr = await createWorkRequestWithPhases({
        processing: {
          tasks: [{ title: 'Proc Task 1', local_id: 'proc1' }],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const patchRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          phase: 'processing',
        });

      expect(patchRes.status).toBe(400);
      expect(patchRes.body.code).toBe('TASK_PHASE_IMMUTABLE');
    });

    it('allows updating non-phase task properties (title, description, dueDate) without error', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [{ title: 'Pre Task 1', description: 'Original', local_id: 'pre1' }],
        },
      });

      const preTask = wr.phases.pre_processing.tasks[0];

      const patchRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${preTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          title: 'Updated Pre Task 1 Title',
          description: 'Updated Description',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.title).toBe('Updated Pre Task 1 Title');
      expect(patchRes.body.data.description).toBe('Updated Description');
      expect(patchRes.body.data.phase).toBe('pre_processing');
    });
  });

  describe('2. Prerequisite Gates (Rule R5 & Spec §3.2)', () => {
    it('rejects advancing a processing task out of Draft while pre_processing tasks are open with 409 PHASE_PREREQUISITE', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Incomplete Pre Task', status: 'Draft', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      // Attempt to advance processing task to 'In Progress'
      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'In Progress',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHASE_PREREQUISITE');
      expect(res.body.detail).toMatch(/pre-processing task/i);
    });

    it('rejects advancing a processing task out of Assigned while a pre_processing task is In Progress with 409', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task In Progress', status: 'In Progress', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task Assigned', status: 'Assigned', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .put(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'In Progress',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHASE_PREREQUISITE');
    });

    it('rejects advancing a processing task directly to Completed while pre_processing tasks are open with 409', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Open Pre Task', status: 'Draft', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'Completed',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHASE_PREREQUISITE');
    });

    it('rejects advancing a processing task to For Review while pre_processing tasks are open with 409', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Open Pre Task', status: 'In Progress', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'For Review',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHASE_PREREQUISITE');
    });

    it('allows transitioning a processing task between Draft and Assigned without 409', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Open Pre Task', status: 'Draft', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      // Updating from Draft to Assigned is NOT advancing out of Draft/Assigned
      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'Assigned',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Assigned');
    });

    it('allows updating non-status fields of a processing task while pre_processing tasks are open', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Open Pre Task', status: 'Draft', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          description: 'Updated draft processing task description',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.description).toBe('Updated draft processing task description');
      expect(res.body.data.status).toBe('Draft');
    });

    it('allows advancing pre_processing tasks freely without prerequisite blocking', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1', status: 'Draft', local_id: 'pre1' },
            { title: 'Pre Task 2', status: 'Draft', local_id: 'pre2' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const preTask1 = wr.phases.pre_processing.tasks[0];

      // Advancing Pre Task 1 to In Progress while Pre Task 2 is Draft is completely valid
      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${preTask1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({
          status: 'In Progress',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In Progress');
    });
  });

  describe('3. Prerequisite Gate Resolution (Advancement Succeeds When All Pre-processing Completed)', () => {
    it('allows advancing a processing task out of Draft once all pre_processing tasks are Completed', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1', status: 'Draft', local_id: 'pre1' },
            { title: 'Pre Task 2', status: 'Draft', local_id: 'pre2' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const [pre1, pre2] = wr.phases.pre_processing.tasks;
      const procTask = wr.phases.processing.tasks[0];

      // Complete Pre Task 1
      await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${pre1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'Completed' });

      // Processing task still blocked because Pre Task 2 is not completed
      const blockedRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'In Progress' });
      expect(blockedRes.status).toBe(409);
      expect(blockedRes.body.code).toBe('PHASE_PREREQUISITE');

      // Complete Pre Task 2
      await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${pre2.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'Completed' });

      // Now all pre_processing tasks are Completed -> advancing processing task succeeds!
      const successRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'In Progress' });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.status).toBe('In Progress');
      expect(successRes.body.data.phase).toBe('processing');
    });

    it('allows subsequent advancement of processing task through review and completion', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1', status: 'Completed', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'In Progress', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      // Advance to For Review
      const reviewRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'For Review' });
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.data.status).toBe('For Review');

      // Advance to Completed
      const completedRes = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'Completed' });
      expect(completedRes.status).toBe(200);
      expect(completedRes.body.data.status).toBe('Completed');
    });
  });

  describe('4. Cancelled Tasks Exclusion (Spec §3.2)', () => {
    it('does NOT block processing task when one pre_processing task is Completed and another is Cancelled', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1 (Completed)', status: 'Completed', local_id: 'pre1' },
            { title: 'Pre Task 2 (Cancelled)', status: 'Cancelled', local_id: 'pre2' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      // Cancelled task is strictly excluded from prerequisite check
      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'In Progress' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In Progress');
    });

    it('does NOT block processing task when ALL pre_processing tasks are Cancelled', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1 (Cancelled)', status: 'Cancelled', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'In Progress' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('In Progress');
    });

    it('still blocks processing task if a Cancelled pre_processing task exists alongside an incomplete active task', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task 1 (Cancelled)', status: 'Cancelled', local_id: 'pre1' },
            { title: 'Pre Task 2 (Draft)', status: 'Draft', local_id: 'pre2' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'In Progress' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PHASE_PREREQUISITE');
    });

    it('allows cancelling a processing task even when pre_processing tasks are open', async () => {
      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            { title: 'Pre Task Open', status: 'Draft', local_id: 'pre1' },
          ],
        },
        processing: {
          tasks: [
            { title: 'Processing Task', status: 'Draft', local_id: 'proc1' },
          ],
        },
      });

      const procTask = wr.phases.processing.tasks[0];

      // Cancelling processing task is allowed
      const res = await request(app)
        .patch(`/v1/work-requests/${wr.id}/tasks/${procTask.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA')
        .send({ status: 'Cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });

  describe('5. Phase Model & Assignees Attribution in API Contracts', () => {
    it('returns phase model fields cleanly in work request and task endpoints', async () => {
      const staffUser = {
        id: '11111111-2222-3333-4444-555555555555',
        email: 'staff-assignee@ata-lta.ph',
        name: 'Staff Assignee',
        role: 'Operations',
        entities: ['ATA'],
      };
      registerUser(staffUser);

      const wr = await createWorkRequestWithPhases({
        pre_processing: {
          tasks: [
            {
              title: 'Attributed Pre Task',
              assignees: [staffUser.id],
              local_id: 'pre1',
            },
          ],
        },
        processing: {
          tasks: [
            {
              title: 'Attributed Proc Task',
              assignees: [staffUser.id],
              local_id: 'proc1',
            },
          ],
        },
      });

      // Verify work request fields
      expect(wr.phase).toBe('pre_processing');
      expect(wr).toHaveProperty('onHold');
      expect(wr).toHaveProperty('phaseEnteredAt');
      expect(wr.phases.pre_processing.tasks).toHaveLength(1);
      expect(wr.phases.processing.tasks).toHaveLength(1);

      // Verify task fields via GET /v1/work-requests/:wrId/tasks/:taskId
      const preTaskId = wr.phases.pre_processing.tasks[0].id;
      const getTaskRes = await request(app)
        .get(`/v1/work-requests/${wr.id}/tasks/${preTaskId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA');

      expect(getTaskRes.status).toBe(200);
      const taskData = getTaskRes.body.data;

      expect(taskData.phase).toBe('pre_processing');
      expect(taskData.qaStatus).toBe('none');
      expect(taskData.qa_status).toBe('none');
      expect(taskData.assignees).toContain(staffUser.id);
      expect(taskData.assignedBy).toBe(adminUser.id);

      // Verify task fields via GET /v1/work-requests/:id
      const getWrRes = await request(app)
        .get(`/v1/work-requests/${wr.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Active-Entity', 'ATA');

      expect(getWrRes.status).toBe(200);
      const wrData = getWrRes.body.data;
      expect(wrData.phase).toBe('pre_processing');
    });
  });
});
