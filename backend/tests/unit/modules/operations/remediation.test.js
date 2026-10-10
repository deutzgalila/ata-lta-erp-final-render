/**
 * Unit tests for Operations Module Field Feedback Remediation (Parcel B1)
 * Genuine unit test suite exercising actual service implementations against mocked Supabase client.
 */

// Mock Supabase admin client and dependencies
jest.mock('../../../../src/services/supabaseClient', () => {
  const mockClient = {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    },
  };
  return { supabaseAdmin: mockClient, verifyToken: jest.fn() };
});

jest.mock('../../../../src/services/auditService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../src/services/notify', () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  FROZEN_NOTIFICATION_TYPES: [
    'pending_request.resolved',
    'wr.transition_request.received',
    'wr.transition_request.resolved',
    'wr.qa_reroute',
  ],
}));

const { supabaseAdmin } = require('../../../../src/services/supabaseClient');
const operationsService = require('../../../../src/modules/operations/service');
const operationsRequestsService = require('../../../../src/modules/operationsRequests/service');

describe('Operations Module Remediation Suite (Parcel B1)', () => {
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

  describe('VALID_TRANSITIONS alignment', () => {
    it('allows transition from Processing to For Billing', () => {
      expect(operationsService.VALID_TRANSITIONS).toBeDefined();
      expect(operationsService.VALID_TRANSITIONS.Processing).toContain('For Billing');
      expect(operationsService.VALID_TRANSITIONS.Processing).toContain('Billing');
    });
  });

  describe('isManager Role Classification', () => {
    it('does not classify Admin with Management department as Manager', () => {
      const adminUser = {
        name: 'Lorein Wong',
        email: 'lorein@ata-lta.ph',
        role: 'Admin',
        departments: ['Management'],
      };
      expect(operationsService.isManager(adminUser)).toBe(false);
    });

    it('classifies actual Manager as Manager', () => {
      const managerUser = {
        name: 'Henry Wong',
        email: 'henry@ata-lta.ph',
        role: 'Manager',
        departments: ['Operations'],
      };
      expect(operationsService.isManager(managerUser)).toBe(true);
    });
  });

  describe('Task Lead Unassign Logic', () => {
    it('properly clears assignee and synchronizes task_assignees deletion when null is passed', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      const leadUserId = '018f45a2-8921-789a-bcde-0123456789ab';
      const wrId = '018f45a2-8921-789a-bcde-0123456789cd';

      let taskAssigneesDeleteQuery = null;
      let taskUpdatePayload = null;

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                work_request_id: wrId,
                title: 'Task with lead',
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
            taskAssigneesDeleteQuery = qs;
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
        task_checklists: () => ({ data: [], error: null }),
        task_time_logs: () => ({ data: [], error: null }),
        documents: () => ({ data: [], error: null }),
      };

      // 1. Pass assigneeId: null -> clears fields and deletes join entry
      await operationsService.updateTask({
        workRequestId: wrId,
        taskId,
        data: {
          assigneeId: null,
          assigneeName: null,
        },
        user: { id: 'admin-user' },
      });

      expect(taskUpdatePayload).toBeDefined();
      expect(taskUpdatePayload.assignee_id).toBeNull();
      expect(taskUpdatePayload.assignee_name).toBeNull();
      expect(taskAssigneesDeleteQuery).toBeDefined();
      expect(taskAssigneesDeleteQuery.filters.task_id).toBe(taskId);
      expect(taskAssigneesDeleteQuery.filters.user_id).toBe(leadUserId);

      // 2. Omit assigneeId -> preserves existing assignee
      taskUpdatePayload = null;
      await operationsService.updateTask({
        workRequestId: wrId,
        taskId,
        data: {
          title: 'Updated title without touching assignee',
        },
        user: { id: 'admin-user' },
      });

      expect(taskUpdatePayload).toBeDefined();
      expect(taskUpdatePayload.assignee_id).toBe(leadUserId);
      expect(taskUpdatePayload.assignee_name).toBe('Lead Person');
    });
  });

  describe('Dual-Role Team Member Validation', () => {
    it('permits a manager who belongs to Operations department as a co-assignee via user_departments', async () => {
      const lovelynId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      let selectedCols = null;

      tableMockHandlers = {
        users: (qs) => {
          selectedCols = qs.selectCols;
          return {
            data: [
              {
                id: lovelynId,
                name: 'Lovelyn Rebong',
                role: 'Manager',
                user_departments: [{ departments: { name: 'Operations' } }],
              },
            ],
            error: null,
          };
        },
      };

      await expect(
        operationsService.validateProjectTeamRoles({
          coAssignees: [lovelynId],
        })
      ).resolves.toBeUndefined();

      expect(selectedCols).toContain('user_departments(departments(name))');
    });

    it('rejects an executive manager who is NOT in Operations department', async () => {
      const execManagerId = '84a92c01-7fa1-432a-bc91-381c85d820d9';

      tableMockHandlers = {
        users: () => ({
          data: [
            {
              id: execManagerId,
              name: 'Executive Manager',
              role: 'Manager',
              user_departments: [
                { departments: { name: 'Executive' } },
                { departments: { name: 'Legal' } },
              ],
            },
          ],
          error: null,
        }),
      };

      await expect(
        operationsService.validateProjectTeamRoles({
          coAssignees: [execManagerId],
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        title: 'Invalid Team Member',
      });
    });
  });

  describe('Completed Work Request Lock', () => {
    it('detects and blocks modifications to completed work requests with HTTP 400', async () => {
      const wrId = '018f45a2-8921-789a-bcde-0123456789ee';

      tableMockHandlers = {
        work_requests: () => ({
          data: {
            id: wrId,
            entity_id: '018f45a2-8921-789a-bcde-0123456789ff',
            status: 'Completed',
            title: 'Finished WR',
            submitted_by: 'admin-user',
          },
          error: null,
        }),
        tasks: () => ({ data: [], error: null }),
        entities: () => ({ data: { code: 'ATA' }, error: null }),
      };

      await expect(
        operationsService.updateWorkRequest({
          id: wrId,
          entityId: '018f45a2-8921-789a-bcde-0123456789ff',
          data: { title: 'Attempted edit to finished WR' },
          user: { id: 'admin-user', role: 'Admin' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        detail: 'Completed Work Requests are locked and cannot be modified',
      });
    });
  });

  describe('Task Dependencies Enforcement', () => {
    it('blocks completing task when upstream predecessors are incomplete (TASK_PREDECESSORS_INCOMPLETE)', async () => {
      const taskId = '05c93540-c3d3-460f-90e9-74d47c2bc386';
      const predTaskId = '018f45a2-8921-789a-bcde-012345678911';
      const wrId = '018f45a2-8921-789a-bcde-012345678922';

      tableMockHandlers = {
        tasks: (qs, method) => {
          if (qs.action === 'select' && method === 'maybeSingle') {
            return {
              data: {
                id: taskId,
                work_request_id: wrId,
                title: 'Downstream Task',
                status: 'In Progress',
                phase: 'processing',
                predecessors: [predTaskId],
                version: 1,
              },
              error: null,
            };
          }
          if (qs.action === 'select' && qs.inFilters.id) {
            return {
              data: [
                {
                  id: predTaskId,
                  title: 'Prerequisite Task',
                  status: 'In Progress',
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
          data: { status: 'Completed' },
          user: { id: 'admin-user' },
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'TASK_PREDECESSORS_INCOMPLETE',
      });
    });
  });

  describe('Billing Request Fulfillment & Draft Invoice Generation', () => {
    it('auto-generates draft invoice and falls back to parent work request client_id when missing', async () => {
      const reqId = '018f45a2-8921-789a-bcde-012345678933';
      const wrId = '018f45a2-8921-789a-bcde-012345678944';
      const parentClientId = '018f45a2-8921-789a-bcde-012345678955';
      const entityId = '018f45a2-8921-789a-bcde-012345678966';

      let invoiceInsertPayload = null;

      tableMockHandlers = {
        operations_requests: () => ({
          data: {
            id: reqId,
            entity_id: entityId,
            type: 'billing',
            status: 'pending',
            work_request_id: wrId,
            client_id: null, // missing client_id triggers fallback to parent work request
            requested_by: '018f45a2-8921-789a-bcde-012345678977',
          },
          error: null,
        }),
        work_requests: (qs, method) => {
          if (method === 'maybeSingle') {
            return {
              data: {
                id: wrId,
                client_id: parentClientId,
              },
              error: null,
            };
          }
          return {
            data: [
              {
                id: wrId,
                title: 'Work Request with Client',
                client_id: parentClientId,
                entity_id: entityId,
              },
            ],
            error: null,
          };
        },
        invoices: (qs) => {
          if (qs.action === 'select') {
            return { data: [], error: null };
          }
          if (qs.action === 'insert') {
            invoiceInsertPayload = qs.insertPayload;
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
        userId: 'admin-user-id',
        data: { status: 'fulfilled' },
      });

      expect(supabaseAdmin.rpc).toHaveBeenCalledWith(
        'operations_request_fulfill',
        expect.objectContaining({ p_id: reqId })
      );
      expect(invoiceInsertPayload).toBeDefined();
      expect(invoiceInsertPayload.work_request_id).toBe(wrId);
      expect(invoiceInsertPayload.client_id).toBe(parentClientId);
      expect(invoiceInsertPayload.status).toBe('Draft');
    });
  });
});
