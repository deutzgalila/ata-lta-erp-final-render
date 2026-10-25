jest.mock('../src/services/supabaseClient', () => {
  const { supabaseAdmin } = require('./fixtures/supabaseMock');
  return { supabaseAdmin };
});

const { randomUUID } = require('crypto');
const request = require('supertest');
const { app } = require('./helpers/testServer');
const { registerUser, resetMock, seedDefaults, mockTables, supabaseAdmin } = require('./fixtures/supabaseMock');

describe('Checklist persistence and failed reads', () => {
  let token;
  let wr;
  let task;
  let doc;
  let prerequisite;
  const path = () => `/v1/operations/work-requests/${wr.id}/tasks/${task.id}`;
  const authorized = (req) => req.set('Authorization', `Bearer ${token}`).set('X-Active-Entity', 'ATA');

  beforeEach(() => {
    resetMock();
    seedDefaults();
    const userId = randomUUID();
    token = registerUser({ id: userId, role: 'Admin', name: 'Checklist owner', entities: ['ATA'], email: 'checklist@example.test' });
    wr = { id: randomUUID(), entity_id: 'ent-ata', title: 'Checklist request', phase: 'pre_processing', status: 'Pre-processing', version: 1, deleted_at: null };
    task = { id: randomUUID(), work_request_id: wr.id, title: 'Prepare filing', phase: 'pre_processing', status: 'Draft', version: 1, deleted_at: null };
    prerequisite = { id: randomUUID(), task_id: task.id, text: 'Collect records', category: 'subtask', completed: false, created_at: '2026-10-01T00:00:00Z' };
    doc = { id: randomUUID(), task_id: task.id, text: 'Tax certificate', category: 'document', completed: false,
      period_year: '2025/2026', depends_on: [prerequisite.id], assignee_id: userId, assignee_name: 'Checklist owner', created_at: '2026-10-02T00:00:00Z' };
    mockTables.work_requests.set(wr.id, wr);
    mockTables.tasks.set(task.id, task);
    mockTables.task_checklists.set(doc.id, doc);
    mockTables.task_checklists.set(prerequisite.id, prerequisite);
  });

  afterEach(() => jest.restoreAllMocks());

  const failChecklistReads = () => {
    const original = supabaseAdmin.from;
    jest.spyOn(supabaseAdmin, 'from').mockImplementation((name) => {
      const query = original(name);
      if (name === 'task_checklists') {
        query.then = (resolve) => Promise.resolve({ data: null, error: { code: 'XX000', message: 'Checklist storage unavailable' } }).then(resolve);
      }
      return query;
    });
  };

  const readRoutes = [
    () => path(),
    () => `/v1/operations/work-requests/${wr.id}/tasks`,
    () => `/v1/operations/work-requests/${wr.id}`,
    () => '/v1/operations/work-requests?includeTasks=true',
  ];

  it.each(readRoutes)('reads saved checklists without a nonexistent sort_order column (%#)', async (route) => {
    const original = supabaseAdmin.from;
    jest.spyOn(supabaseAdmin, 'from').mockImplementation((name) => {
      const query = original(name);
      if (name === 'task_checklists') {
        const order = query.order;
        query.order = (column, options) => {
          if (column === 'sort_order') {
            query.then = (resolve) => Promise.resolve({ data: null, error: { code: '42703', message: 'column task_checklists.sort_order does not exist' } }).then(resolve);
          }
          return order(column, options);
        };
      }
      return query;
    });
    const res = await authorized(request(app).get(route())).expect(200);
    const graph = Array.isArray(res.body.data) ? res.body.data[0] : res.body.data;
    const readTask = graph.tasks?.[0] || graph;
    expect(readTask.checklist.map((item) => item.id)).toEqual([prerequisite.id, doc.id]);
    expect(readTask.checklist[1]).toMatchObject({ category: 'document', periodYear: '2025/2026', dependsOn: [prerequisite.id] });
  });

  it.each(readRoutes)('reports a checklist query failure instead of a successful empty checklist (%#)', async (route) => {
    failChecklistReads();
    const res = await authorized(request(app).get(route())).expect(500);
    expect(res.body.code).toBe('TASK_CHECKLIST_READ_FAILED');
  });

  it('rejects a replacement when the current checklist could not be read', async () => {
    const before = [...mockTables.task_checklists.values()].map((item) => ({ ...item }));
    failChecklistReads();
    await authorized(request(app).put(path())).send({ checklist: [{ text: 'New item', completed: false }] }).expect(500);
    expect([...mockTables.task_checklists.values()]).toEqual(before);
    expect(mockTables.tasks.get(task.id).version).toBe(1);
  });

  it('preserves omitted metadata when a legacy client adds an item', async () => {
    const log = { id: randomUUID(), task_id: task.id, checklist_item_id: doc.id, date: '2026-10-01', hours: 1 };
    mockTables.task_time_logs.set(log.id, log);
    await authorized(request(app).put(path())).send({ checklist: [
      { id: prerequisite.id, text: prerequisite.text, completed: true },
      { id: doc.id, text: doc.text, completed: false },
      { text: 'Review filing', category: 'subtask', completed: false },
    ] }).expect(200);
    expect(mockTables.task_checklists.get(doc.id)).toMatchObject(doc);
    expect(mockTables.task_time_logs.get(log.id)).toEqual(log);
    expect(mockTables.task_checklists.size).toBe(3);
  });

  it('allows explicitly clearing metadata on retained items', async () => {
    await authorized(request(app).put(path())).send({ checklist: [
      { id: prerequisite.id, text: prerequisite.text, completed: false },
      { id: doc.id, text: doc.text, completed: false, category: 'subtask', periodYear: null,
        assigneeId: null, assigneeName: null, dependsOn: [] },
    ] }).expect(200);
    expect(mockTables.task_checklists.get(doc.id)).toMatchObject({ category: 'subtask', period_year: null,
      assignee_id: null, assignee_name: null, depends_on: [] });
  });

  it('rejects a stale checklist snapshot without replacing newer items', async () => {
    mockTables.tasks.get(task.id).version = 2;
    const before = [...mockTables.task_checklists.values()].map((item) => ({ ...item }));
    const res = await authorized(request(app).put(path())).send({
      expectedVersion: 1, checklist: [{ text: 'Stale replacement', completed: false }],
    }).expect(409);
    expect(res.body.code).toBe('ERR_CONCURRENCY_CONFLICT');
    expect([...mockTables.task_checklists.values()]).toEqual(before);
  });

  it('creates same-title tasks with their own checklist IDs, document periods and prerequisites', async () => {
    const clientId = randomUUID();
    mockTables.clients.set(clientId, { id: clientId, entity_id: 'ent-ata', name: 'Filing client', deleted_at: null });
    const firstId = randomUUID();
    const secondId = randomUUID();
    const thirdId = randomUUID();
    const res = await authorized(request(app).post('/v1/operations/work-requests')).send({
      title: 'New checklist request', clientId, entity: 'ATA', dueDate: '2026-12-31',
      phases: {
        pre_processing: { tasks: [{ title: 'Filing', local_id: 'pre', checklist: [
          { id: firstId, text: 'Collect', category: 'subtask', completed: false },
          { id: secondId, text: 'Certificate', category: 'document', periodYear: '2025/2026', dependsOn: firstId, completed: false },
        ] }] },
        processing: { tasks: [{ title: 'Filing', local_id: 'proc', checklist: [
          { id: thirdId, text: 'Submit', category: 'subtask', completed: false },
        ] }] },
      },
    }).expect(201);
    const [pre, proc] = res.body.data.tasks;
    expect(pre.checklist.map((item) => item.id)).toEqual([firstId, secondId]);
    expect(proc.checklist.map((item) => item.id)).toEqual([thirdId]);
    const saved = await authorized(request(app).get(`/v1/operations/work-requests/${res.body.data.id}`)).expect(200);
    expect(saved.body.data.tasks.find((item) => item.id === pre.id).checklist.find((item) => item.id === secondId))
      .toMatchObject({ periodYear: '2025/2026', dependsOn: [firstId], category: 'document' });
  });
});
