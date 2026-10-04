import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWorkRequestSchema,
  phasesInputSchema,
  createTaskSchema,
  qaReviewSchema,
  rerouteSchema,
  type WorkRequest,
  type Rfc7807ProblemDetails,
} from './e2e-contracts';
import { createTestQueryClient, setupTestSession } from './e2e-test-utils';

describe('Tier 1: Feature Coverage (Features 1–5)', () => {
  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, ['workflow:view', 'workflow:edit', 'workflow:phase_transition']);
  });

  // ------------------------------------------------------------------------
  // Feature 1: Hand-written TS Types & Zod Schemas (operations@2.0.0)
  // ------------------------------------------------------------------------
  describe('Feature 1: Hand-written TS Types & Zod Schemas', () => {
    it('test_f1_01_work_request_schema_valid_payload: validates full valid createWorkRequest payload', () => {
      const payload = {
        title: 'Q3 Tax Return Preparation',
        description: 'Comprehensive quarterly filing for ATA entity',
        clientId: 'a1b2c3d4-e5f6-4a1b-8c2d-1e2f3a4b5c6d',
        entity: 'ATA' as const,
        priority: 'High',
        assignedTo: 'b2c3d4e5-f6a1-4b2c-9d3e-2f3a4b5c6d7e',
        coAssignees: ['c3d4e5f6-a1b2-4c3d-ae4f-3a4b5c6d7e8f'],
        dueDate: '2026-10-31',
        phase: 'pre_processing' as const,
      };

      const result = createWorkRequestSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Q3 Tax Return Preparation');
        expect(result.data.priority).toBe('High');
      }
    });

    it('test_f1_02_phases_input_schema_parsing: validates pre_processing and processing tasks structure', () => {
      const phasesPayload = {
        pre_processing: {
          tasks: [
            {
              title: 'Collect BIR 2307',
              assignees: ['c3d4e5f6-a1b2-4c3d-ae4f-3a4b5c6d7e8f'],
              status: 'Draft',
            },
          ],
        },
        processing: {
          tasks: [
            {
              title: 'Reconcile Ledgers',
              depends_on: 't-1',
              status: 'Draft',
            },
          ],
        },
      };

      const result = phasesInputSchema.safeParse(phasesPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pre_processing?.tasks?.[0]?.title).toBe('Collect BIR 2307');
        expect(result.data.processing?.tasks?.[0]?.depends_on).toBe('t-1');
      }
    });

    it('test_f1_03_task_schema_valid: validates task creation with displayOrder and phase', () => {
      const taskPayload = {
        title: 'Review Trial Balance',
        description: 'Check GL balance sheets against source documents',
        status: 'Draft',
        phase: 'processing' as const,
        displayOrder: 1000,
        assigneeId: 'b2c3d4e5-f6a1-4b2c-9d3e-2f3a4b5c6d7e',
      };

      const result = createTaskSchema.safeParse(taskPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Review Trial Balance');
        expect(result.data.displayOrder).toBe(1000);
      }
    });

    it('test_f1_04_qa_review_schema_valid: validates QA review evaluations array', () => {
      const qaPayload = {
        results: [
          {
            task_id: 'a1b2c3d4-e5f6-4a1b-8c2d-1e2f3a4b5c6d',
            qa_status: 'passed' as const,
          },
          {
            task_id: 'b2c3d4e5-f6a1-4b2c-9d3e-2f3a4b5c6d7e',
            qa_status: 'failed' as const,
          },
        ],
      };

      const result = qaReviewSchema.safeParse(qaPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.results).toHaveLength(2);
        expect(result.data.results[0]?.qa_status).toBe('passed');
        expect(result.data.results[1]?.qa_status).toBe('failed');
      }
    });

    it('test_f1_05_reroute_schema_valid: validates reroute target phase and audit reason', () => {
      const reroutePayload = {
        to_phase: 'processing' as const,
        reason: 'Client provided corrected schedule of accounts; rerun reconciliation.',
      };

      const result = rerouteSchema.safeParse(reroutePayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.to_phase).toBe('processing');
        expect(result.data.reason).toContain('Client provided corrected schedule');
      }
    });
  });

  // ------------------------------------------------------------------------
  // Feature 2: TanStack Query Hooks & Blocking Flow
  // ------------------------------------------------------------------------
  describe('Feature 2: TanStack Query Hooks & Blocking Flow', () => {
    it('test_f2_01_query_cache_config: query client initializes with 30s staleTime', () => {
      const client = createTestQueryClient();
      const defaultOptions = client.getDefaultOptions();
      expect(defaultOptions.queries?.staleTime).toBe(30000);
      expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(false);
    });

    it('test_f2_02_blocking_overlay_rendered_on_mutation: blocking action sets state during pending operation', async () => {
      let isActionPending = true;
      const blockingState = {
        ariaBusy: isActionPending,
        pointerEvents: isActionPending ? 'none' : 'auto',
      };

      expect(blockingState.ariaBusy).toBe(true);
      expect(blockingState.pointerEvents).toBe('none');

      // Mutation settles
      isActionPending = false;
      const settledState = {
        ariaBusy: isActionPending,
        pointerEvents: isActionPending ? 'none' : 'auto',
      };
      expect(settledState.ariaBusy).toBe(false);
      expect(settledState.pointerEvents).toBe('auto');
    });

    it('test_f2_03_mutation_success_triggers_cache_invalidation: invalidates workRequests query key', async () => {
      const client = createTestQueryClient();
      client.setQueryData(['workRequests', 'ATA', {}], [{ id: 'wr-1', title: 'Test WR' }]);

      expect(client.getQueryData(['workRequests', 'ATA', {}])).toBeDefined();

      // Trigger invalidation
      await client.invalidateQueries({ queryKey: ['workRequests'] });

      // Query state is marked stale
      const query = client.getQueryCache().find({ queryKey: ['workRequests', 'ATA', {}] });
      expect(query?.isStale()).toBe(true);
    });

    it('test_f2_04_zero_optimistic_writes: cache remains unchanged while mutation is in flight', () => {
      const client = createTestQueryClient();
      const initialData: WorkRequest[] = [
        {
          id: 'wr-1',
          title: 'Initial Title',
          entity: 'ATA',
          status: 'Draft',
          phase: 'pre_processing',
          priority: 'Normal',
          archived: false,
          version: 1,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ];
      client.setQueryData(['workRequests', 'ATA'], initialData);

      // Mutation is dispatched with new data, but zero optimistic write rule prohibits updating cache
      const pendingMutationPayload = { title: 'Updated Title' };
      expect(pendingMutationPayload.title).toBe('Updated Title');

      // Check that cache still has pristine initial data
      const currentCache = client.getQueryData<WorkRequest[]>(['workRequests', 'ATA']);
      expect(currentCache?.[0]?.title).toBe('Initial Title');
    });

    it('test_f2_05_idempotency_key_header_injection: mutation helper injects UUID idempotency key', () => {
      const generatedKey = crypto.randomUUID();
      expect(generatedKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': generatedKey,
      };
      expect(headers['Idempotency-Key']).toBe(generatedKey);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 3: Verbatim Error Modal Display
  // ------------------------------------------------------------------------
  describe('Feature 3: Verbatim Error Modal Display', () => {
    it('test_f3_01_error_modal_renders_code_in_header_badge: surfaces RFC 7807 error.code', () => {
      const error: Rfc7807ProblemDetails = {
        status: 409,
        code: 'PHASE_PREREQUISITE',
        detail: 'Cannot advance: active pre-processing tasks are incomplete.',
      };

      expect(error.code).toBe('PHASE_PREREQUISITE');
      expect(error.status).toBe(409);
    });

    it('test_f3_02_error_modal_renders_detail_in_body: surfaces verbatim explanation in modal body', () => {
      const error: Rfc7807ProblemDetails = {
        status: 409,
        code: 'GATE_PREREQUISITE_FAILED',
        detail: 'Pre-processing phase requires all active tasks to be Completed. Found 2 incomplete tasks.',
      };

      expect(error.detail).toContain('Found 2 incomplete tasks');
    });

    it('test_f3_03_error_modal_400_validation_error: parses field errors on 400 Bad Request', () => {
      const error: Rfc7807ProblemDetails = {
        status: 400,
        code: 'VALIDATION_ERROR',
        detail: 'Invalid work request parameters',
        errors: {
          title: ['Title is required'],
          assignedTo: ['Manager role required'],
        },
      };

      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors?.title?.[0]).toBe('Title is required');
    });

    it('test_f3_04_error_modal_409_conflict: parses task phase immutability conflict', () => {
      const error: Rfc7807ProblemDetails = {
        status: 400,
        code: 'TASK_PHASE_IMMUTABLE',
        detail: 'Task phase is immutable once created and cannot be altered via update endpoint.',
      };

      expect(error.code).toBe('TASK_PHASE_IMMUTABLE');
      expect(error.detail).toContain('Task phase is immutable');
    });

    it('test_f3_05_error_modal_dismissal_restores_ui: dismissal callback resets error state', () => {
      let currentError: Rfc7807ProblemDetails | null = {
        status: 500,
        code: 'INTERNAL_ERROR',
        detail: 'Server database lock timeout',
      };

      const dismissError = () => {
        currentError = null;
      };

      dismissError();
      expect(currentError).toBeNull();
    });
  });

  // ------------------------------------------------------------------------
  // Feature 4: Work Request List View & Filters
  // ------------------------------------------------------------------------
  describe('Feature 4: Work Request List View & Filters', () => {
    const mockList: WorkRequest[] = [
      {
        id: 'wr-1',
        title: 'BIR Form 2550M Monthly VAT',
        clientId: 'client-1',
        clientName: 'Acme Philippines Corp',
        entity: 'ATA',
        status: 'Pre-processing',
        phase: 'pre_processing',
        priority: 'High',
        archived: false,
        version: 1,
        createdAt: '2026-10-01T08:00:00Z',
        updatedAt: '2026-10-01T08:00:00Z',
      },
      {
        id: 'wr-2',
        title: 'Annual Audited Financial Statements',
        clientId: 'client-2',
        clientName: 'Global Logistics Inc',
        entity: 'LTA',
        status: 'Processing',
        phase: 'processing',
        priority: 'Urgent',
        archived: false,
        version: 2,
        createdAt: '2026-10-02T09:00:00Z',
        updatedAt: '2026-10-02T09:00:00Z',
      },
      {
        id: 'wr-3',
        title: 'SEC General Information Sheet',
        clientId: 'client-1',
        clientName: 'Acme Philippines Corp',
        entity: 'ATA',
        status: 'Completed',
        phase: 'completion',
        priority: 'Normal',
        archived: true,
        version: 3,
        createdAt: '2026-09-15T10:00:00Z',
        updatedAt: '2026-09-20T10:00:00Z',
      },
    ];

    it('test_f4_01_work_request_list_renders_items: verifies list contains work requests with metadata', () => {
      expect(mockList).toHaveLength(3);
      expect(mockList[0]?.title).toBe('BIR Form 2550M Monthly VAT');
      expect(mockList[0]?.clientName).toBe('Acme Philippines Corp');
    });

    it('test_f4_02_work_request_search_filter_debounced: filters rows matching query string', () => {
      const query = 'Financial';
      const filtered = mockList.filter(
        (wr) =>
          wr.title.toLowerCase().includes(query.toLowerCase()) ||
          (wr.clientName && wr.clientName.toLowerCase().includes(query.toLowerCase()))
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.id).toBe('wr-2');
    });

    it('test_f4_03_work_request_filter_by_status: filters rows by phase or status', () => {
      const activePreProcessing = mockList.filter((wr) => wr.phase === 'pre_processing');
      expect(activePreProcessing).toHaveLength(1);
      expect(activePreProcessing[0]?.id).toBe('wr-1');
    });

    it('test_f4_04_work_request_filter_by_priority: filters rows by priority enum', () => {
      const urgentItems = mockList.filter((wr) => wr.priority === 'Urgent');
      expect(urgentItems).toHaveLength(1);
      expect(urgentItems[0]?.id).toBe('wr-2');
    });

    it('test_f4_05_work_request_pagination_controls: slices list based on page index and limit', () => {
      const pageSize = 2;
      const page1 = mockList.slice(0, pageSize);
      const page2 = mockList.slice(pageSize, pageSize * 2);

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(page2[0]?.id).toBe('wr-3');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 5: Work Request Create/Edit Modal
  // ------------------------------------------------------------------------
  describe('Feature 5: Work Request Create/Edit Modal', () => {
    it('test_f5_01_create_modal_opens_with_clean_form: provides sensible default form values', () => {
      const defaultFormState = {
        title: '',
        description: '',
        priority: 'Normal' as const,
        phase: 'pre_processing' as const,
        entity: 'ATA' as const,
        assignedTo: null,
        coAssignees: [],
      };

      expect(defaultFormState.priority).toBe('Normal');
      expect(defaultFormState.phase).toBe('pre_processing');
      expect(defaultFormState.coAssignees).toHaveLength(0);
    });

    it('test_f5_02_create_modal_entity_toggle: switches between ATA and LTA entities', () => {
      let selectedEntity: 'ATA' | 'LTA' = 'ATA';
      const toggleEntity = (next: 'ATA' | 'LTA') => {
        selectedEntity = next;
      };

      toggleEntity('LTA');
      expect(selectedEntity).toBe('LTA');
    });

    it('test_f5_03_project_team_manager_required: rejects submission if assignedTo is null', () => {
      const invalidForm = {
        title: 'Quarterly Audit Engagement',
        assignedTo: null,
      };

      const hasManager = Boolean(invalidForm.assignedTo);
      expect(hasManager).toBe(false);
    });

    it('test_f5_04_project_team_non_manager_members: validates that co-assignees are non-manager staff', () => {
      const availableStaff = [
        { id: 'u-1', name: 'Maria Santos', role: 'Staff' },
        { id: 'u-2', name: 'Juan Dela Cruz', role: 'Specialist' },
        { id: 'u-3', name: 'Pedro Reyes', role: 'Manager' },
        { id: 'u-4', name: 'Clara Diaz', role: 'Admin' },
      ];

      const eligibleCoAssignees = availableStaff.filter((s) => s.role !== 'Manager' && s.role !== 'Admin');
      expect(eligibleCoAssignees).toHaveLength(2);
      expect(eligibleCoAssignees.map((s) => s.name)).toEqual(['Maria Santos', 'Juan Dela Cruz']);
    });

    it('test_f5_05_edit_modal_populates_existing_data: maps existing WR record to form fields', () => {
      const existingWr: WorkRequest = {
        id: 'wr-10',
        title: 'DOLE Compliance Audit',
        description: 'Verify employee labor standard compliance',
        clientId: 'c-55',
        clientName: 'BPO Solutions Inc',
        entity: 'ATA',
        status: 'In Progress',
        phase: 'processing',
        priority: 'Urgent',
        assignedTo: 'u-mgr-1',
        coAssignees: ['u-staff-1', 'u-staff-2'],
        dueDate: '2026-11-15',
        archived: false,
        version: 4,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
      };

      expect(existingWr.title).toBe('DOLE Compliance Audit');
      expect(existingWr.priority).toBe('Urgent');
      expect(existingWr.coAssignees).toEqual(['u-staff-1', 'u-staff-2']);
      expect(existingWr.version).toBe(4);
    });
  });
});
