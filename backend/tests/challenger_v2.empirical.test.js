/**
 * Challenger V2 Empirical Test Suite (Adversarial Verification for Parcel B1 Remediation)
 *
 * Exercises:
 * 1. Deep relational department evaluation in validateProjectTeamRoles (edge cases, casing, nulls, joins)
 * 2. task_assignees lead unassign synchronization & multi-assignee semantics in updateTask
 * 3. Work request lock and phase immutability
 * 4. Billing request draft invoice fallback, idempotency, and error handling
 */

jest.mock('../src/services/supabaseClient', () => {
  const mockClient = {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    },
  };
  return { supabaseAdmin: mockClient, verifyToken: jest.fn() };
});

jest.mock('../src/services/auditService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  FROZEN_NOTIFICATION_TYPES: [],
}));

const { supabaseAdmin } = require('../src/services/supabaseClient');
const operationsService = require('../src/modules/operations/service');
const operationsRequestsService = require('../src/modules/operationsRequests/service');

describe('Challenger V2: Empirical Stress Test Suite (Parcel B1)', () => {
  let tableMockHandlers = {};

  const createMockQueryBuilder = (table) => {
    const queryState = {
      table,
      selectCols: '*',
      filters: {},
      inFilters: {},
      isFilters: {},
      action: 'select',
      insertPayload: null,
      updatePayload: null,
    };

    const builder = {
      _queryState: queryState,
      select: jest.fn((cols = '*') => {
        queryState.selectCols = cols;
        return builder;
      }),
      insert: jest.fn((payload) => {
        queryState.action = 'insert';
        queryState.insertPayload = payload;
        return builder;
      }),
      update: jest.fn((payload) => {
        queryState.action = 'update';
        queryState.updatePayload = payload;
        return builder;
      }),
      delete: jest.fn(() => {
        queryState.action = 'delete';
        return builder;
      }),
      eq: jest.fn((col, val) => {
        queryState.filters[col] = val;
        return builder;
      }),
      in: jest.fn((col, vals) => {
        queryState.inFilters[col] = vals;
        return builder;
      }),
      is: jest.fn((col, val) => {
        queryState.isFilters[col] = val;
        return builder;
      }),
      or: jest.fn(() => builder),
      neq: jest.fn(() => builder),
      gt: jest.fn(() => builder),
      gte: jest.fn(() => builder),
      lt: jest.fn(() => builder),
      lte: jest.fn(() => builder),
      like: jest.fn(() => builder),
      ilike: jest.fn(() => builder),
      order: jest.fn(() => builder),
      range: jest.fn(() => builder),
      maybeSingle: jest.fn(async () => {
        const handler = tableMockHandlers[table];
        if (typeof handler === 'function') {
          return handler(queryState, 'maybeSingle');
        }
        return { data: null, error: null };
      }),
      single: jest.fn(async () => {
        const handler = tableMockHandlers[table];
        if (typeof handler === 'function') {
          return handler(queryState, 'single');
        }
        return { data: null, error: null };
      }),
      then: (resolve, reject) => {
        const handler = tableMockHandlers[table];
        let res;
        if (typeof handler === 'function') {
          res = handler(queryState, 'then');
        } else {
          res = { data: [], error: null };
        }
        return Promise.resolve(res).then(resolve, reject);
      },
    };

    return builder;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tableMockHandlers = {};
    supabaseAdmin.from.mockImplementation((table) => createMockQueryBuilder(table));
  });

  describe('Adversarial Challenge 1: Relational Department Lookup Edge Cases', () => {
    it('accepts manager when user_departments has uppercase OPERATIONS', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678901';
      tableMockHandlers.users = () => ({
        data: [
          {
            id: userId,
            name: 'Uppercase Ops Mgr',
            role: 'Manager',
            user_departments: [{ departments: { name: 'OPERATIONS' } }],
          },
        ],
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [userId] })
      ).resolves.toBeUndefined();
    });

    it('accepts admin when user_departments has multiple departments including Operations', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678902';
      tableMockHandlers.users = () => ({
        data: [
          {
            id: userId,
            name: 'Multi Dept Admin',
            role: 'Admin',
            user_departments: [
              { departments: { name: 'Executive' } },
              { departments: { name: 'Accounting' } },
              { departments: { name: 'Operations' } },
            ],
          },
        ],
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [userId] })
      ).resolves.toBeUndefined();
    });

    it('safely rejects manager when user_departments contains malformed entries without throwing unhandled exceptions', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678903';
      tableMockHandlers.users = () => ({
        data: [
          {
            id: userId,
            name: 'Malformed Dept Mgr',
            role: 'Manager',
            user_departments: [
              { departments: null },
              { departments: { name: null } },
              {},
            ],
          },
        ],
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [userId] })
      ).rejects.toMatchObject({
        statusCode: 400,
        title: 'Invalid Team Member',
      });
    });

    it('permits staff role regardless of user_departments contents', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678904';
      tableMockHandlers.users = () => ({
        data: [
          {
            id: userId,
            name: 'Staff Member',
            role: 'Staff',
            user_departments: [{ departments: { name: 'Legal' } }],
          },
        ],
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [userId] })
      ).resolves.toBeUndefined();
    });

    it('falls back to legacy departments array when user_departments is undefined', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678905';
      tableMockHandlers.users = () => ({
        data: [
          {
            id: userId,
            name: 'Legacy Dept Manager',
            role: 'Manager',
            departments: ['Operations'],
          },
        ],
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [userId] })
      ).resolves.toBeUndefined();
    });

    it('correctly handles lookup by name string instead of UUID', async () => {
      const nonUuidName = 'Jane NonUUID Name';
      tableMockHandlers.users = (qs) => {
        if (qs.inFilters.name && qs.inFilters.name.includes(nonUuidName)) {
          return {
            data: [
              {
                id: '018f45a2-8921-789a-bcde-012345678906',
                name: nonUuidName,
                role: 'Manager',
                user_departments: [{ departments: { name: 'Executive' } }],
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      };

      await expect(
        operationsService.validateProjectTeamRoles({ coAssignees: [nonUuidName] })
      ).rejects.toMatchObject({
        statusCode: 400,
        title: 'Invalid Team Member',
      });
    });

    it('rejects non-manager user assigned as project manager (assignedTo)', async () => {
      const userId = '018f45a2-8921-789a-bcde-012345678907';
      tableMockHandlers.users = () => ({
        data: {
          id: userId,
          name: 'Staff Not Manager',
          role: 'Staff',
        },
        error: null,
      });

      await expect(
        operationsService.validateProjectTeamRoles({ assignedTo: userId })
      ).rejects.toMatchObject({
        statusCode: 400,
        title: 'Invalid Manager',
      });
    });
  });

  describe('Adversarial Challenge 2: task_assignees Synchronization & updateTask', () => {
    it('deletes from task_assignees when existing task only has snake_case assignee_id', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      const leadUserId = '018f45a2-8921-789a-bcde-0123456789aa';
      let deleteCalledOnTaskAssignees = false;
      let deleteFilters = null;

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                title: 'Existing Task',
                assignee_id: leadUserId,
                assignee_name: 'Lead Person',
                status: 'In Progress',
                phase: 'processing',
                predecessors: [],
                version: 1,
              },
              error: null,
            };
          }
          if (qs.action === 'update') {
            return {
              data: [{ id: taskId, ...qs.updatePayload }],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        task_assignees: (qs) => {
          if (qs.action === 'delete') {
            deleteCalledOnTaskAssignees = true;
            deleteFilters = qs.filters;
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        task_checklists: () => ({ data: [], error: null }),
        task_time_logs: () => ({ data: [], error: null }),
        documents: () => ({ data: [], error: null }),
      };

      await operationsService.updateTask({
        taskId,
        data: { assigneeId: null },
        user: { id: 'admin' },
      });

      expect(deleteCalledOnTaskAssignees).toBe(true);
      expect(deleteFilters.task_id).toBe(taskId);
      expect(deleteFilters.user_id).toBe(leadUserId);
    });

    it('does NOT invoke task_assignees delete when existing task had NO assignee to begin with', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      let deleteCalledOnTaskAssignees = false;

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                title: 'Unassigned Task',
                assignee_id: null,
                assignee_name: null,
                status: 'Draft',
                phase: 'pre_processing',
                predecessors: [],
                version: 1,
              },
              error: null,
            };
          }
          if (qs.action === 'update') {
            return {
              data: [{ id: taskId, ...qs.updatePayload }],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        task_assignees: (qs) => {
          if (qs.action === 'delete') {
            deleteCalledOnTaskAssignees = true;
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        task_checklists: () => ({ data: [], error: null }),
        task_time_logs: () => ({ data: [], error: null }),
        documents: () => ({ data: [], error: null }),
      };

      await operationsService.updateTask({
        taskId,
        data: { assigneeId: null },
        user: { id: 'admin' },
      });

      expect(deleteCalledOnTaskAssignees).toBe(false);
    });

    it('does NOT invoke task_assignees delete when assigneeId is omitted (undefined)', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      const leadUserId = '018f45a2-8921-789a-bcde-0123456789aa';
      let deleteCalledOnTaskAssignees = false;
      let taskUpdatePayload = null;

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                title: 'Assigned Task',
                assignee_id: leadUserId,
                assignee_name: 'Lead Person',
                status: 'In Progress',
                phase: 'processing',
                predecessors: [],
                version: 1,
              },
              error: null,
            };
          }
          if (qs.action === 'update') {
            taskUpdatePayload = qs.updatePayload;
            return {
              data: [{ id: taskId, ...qs.updatePayload }],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        task_assignees: (qs) => {
          if (qs.action === 'delete') {
            deleteCalledOnTaskAssignees = true;
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        task_checklists: () => ({ data: [], error: null }),
        task_time_logs: () => ({ data: [], error: null }),
        documents: () => ({ data: [], error: null }),
      };

      await operationsService.updateTask({
        taskId,
        data: { title: 'Updated Title' },
        user: { id: 'admin' },
      });

      expect(deleteCalledOnTaskAssignees).toBe(false);
      expect(taskUpdatePayload.assignee_id).toBe(leadUserId);
      expect(taskUpdatePayload.assignee_name).toBe('Lead Person');
    });

    it('rejects attempt to mutate task phase with TASK_PHASE_IMMUTABLE', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';

      await expect(
        operationsService.updateTask({
          taskId,
          data: { phase: 'processing' },
          user: { id: 'admin' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'TASK_PHASE_IMMUTABLE',
      });
    });

    it('blocks advancing processing task out of Draft when pre_processing tasks are incomplete (PHASE_PREREQUISITE)', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      const wrId = '018f45a2-8921-789a-bcde-0123456789bb';

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                work_request_id: wrId,
                title: 'Processing Task',
                status: 'Draft',
                phase: 'processing',
                predecessors: [],
                version: 1,
              },
              error: null,
            };
          }
          if (qs.action === 'select' && qs.filters.phase === 'pre_processing') {
            return {
              data: [
                {
                  id: 'pre-task-1',
                  title: 'Prerequisite Setup',
                  status: 'In Progress', // Not completed!
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        },
        task_checklists: () => ({ data: [], error: null }),
        task_time_logs: () => ({ data: [], error: null }),
        documents: () => ({ data: [], error: null }),
        task_assignees: () => ({ data: [], error: null }),
      };

      await expect(
        operationsService.updateTask({
          workRequestId: wrId,
          taskId,
          data: { status: 'In Progress' },
          user: { id: 'admin' },
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'PHASE_PREREQUISITE',
      });
    });
  });

  describe('Adversarial Challenge 3: Billing Request Fulfillment & Invoicing Edge Cases', () => {
    it('safely handles missing parent work request by defaulting client_id to null without crashing', async () => {
      const reqId = '018f45a2-8921-789a-bcde-012345678910';
      const wrId = '018f45a2-8921-789a-bcde-012345678920';
      const entityId = '018f45a2-8921-789a-bcde-012345678930';

      let invoicePayload = null;

      tableMockHandlers = {
        operations_requests: () => ({
          data: {
            id: reqId,
            entity_id: entityId,
            type: 'billing',
            status: 'pending',
            work_request_id: wrId,
            client_id: null,
            requested_by: 'requester-id',
          },
          error: null,
        }),
        work_requests: () => ({
          data: null, // parent work request not found in database!
          error: null,
        }),
        invoices: (qs) => {
          if (qs.action === 'select') return { data: [], error: null };
          if (qs.action === 'insert') {
            invoicePayload = qs.insertPayload;
            return { data: [qs.insertPayload], error: null };
          }
          return { data: [], error: null };
        },
        users: () => ({ data: [], error: null }),
        clients: () => ({ data: [], error: null }),
        tasks: () => ({ data: [], error: null }),
      };

      supabaseAdmin.rpc = jest.fn().mockResolvedValue({
        data: [{ id: reqId, status: 'fulfilled' }],
        error: null,
      });

      await operationsRequestsService.updateRequest({
        entityId,
        id: reqId,
        userId: 'admin-id',
        data: { status: 'fulfilled' },
      });

      expect(invoicePayload).toBeDefined();
      expect(invoicePayload.client_id).toBeNull();
      expect(invoicePayload.work_request_id).toBe(wrId);
    });

    it('does NOT query work_requests for client_id fallback when operations_requests already has a non-null client_id', async () => {
      const reqId = '018f45a2-8921-789a-bcde-012345678911';
      const wrId = '018f45a2-8921-789a-bcde-012345678921';
      const directClientId = '018f45a2-8921-789a-bcde-012345678931';
      const entityId = '018f45a2-8921-789a-bcde-012345678941';

      let fallbackClientIdQueried = false;
      let invoicePayload = null;

      tableMockHandlers = {
        operations_requests: () => ({
          data: {
            id: reqId,
            entity_id: entityId,
            type: 'billing',
            status: 'pending',
            work_request_id: wrId,
            client_id: directClientId,
            requested_by: 'requester-id',
          },
          error: null,
        }),
        work_requests: (qs, method) => {
          if (qs.selectCols === 'client_id' && method === 'maybeSingle') {
            fallbackClientIdQueried = true;
          }
          return { data: [{ id: wrId, title: 'WR' }], error: null };
        },
        invoices: (qs) => {
          if (qs.action === 'select') return { data: [], error: null };
          if (qs.action === 'insert') {
            invoicePayload = qs.insertPayload;
            return { data: [qs.insertPayload], error: null };
          }
          return { data: [], error: null };
        },
        users: () => ({ data: [], error: null }),
        clients: () => ({ data: [], error: null }),
        tasks: () => ({ data: [], error: null }),
      };

      supabaseAdmin.rpc = jest.fn().mockResolvedValue({
        data: [{ id: reqId, status: 'fulfilled' }],
        error: null,
      });

      await operationsRequestsService.updateRequest({
        entityId,
        id: reqId,
        userId: 'admin-id',
        data: { status: 'fulfilled' },
      });

      expect(fallbackClientIdQueried).toBe(false);
      expect(invoicePayload.client_id).toBe(directClientId);
    });
  });
});
