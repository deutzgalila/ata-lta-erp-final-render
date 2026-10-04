import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkRequestList } from '../components/WorkRequestList';
import { WorkRequestModal } from '../components/WorkRequestModal';
import { ArchiveConfirmModal } from '../components/ArchiveConfirmModal';
import { PendingApprovalsInbox } from '../components/PendingApprovalsInbox';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import {
  BlockingActionModal,
  useBlockingModalStore,
  runBlockingAction,
  extractRfc7807Error,
} from '../components/BlockingActionModal';
import { ApiError, apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import type { WorkRequest, DmsDocument } from '../api/types';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  return { queryClient, wrapper };
}

const mockWorkRequests: WorkRequest[] = [
  {
    id: 'wr-adv-1',
    title: 'Tax Compliance 2026',
    description: 'Corporate filings',
    clientId: 'c-1',
    clientName: 'Alpha Corp',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    onHold: false,
    phaseEnteredAt: null,
    priority: 'High',
    requestedBy: null,
    assignedTo: 'u-mgr-1',
    assignedToName: 'Manager One',
    coAssignees: ['u-staff-1'],
    dueDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    archived: false,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
  },
  {
    id: 'wr-adv-2',
    title: 'Completed SEC Report',
    description: 'Annual disclosure',
    clientId: 'c-1',
    clientName: 'Alpha Corp',
    entity: 'ATA',
    status: 'Completed',
    phase: 'completion',
    onHold: false,
    phaseEnteredAt: null,
    priority: 'Normal',
    requestedBy: null,
    assignedTo: 'u-mgr-1',
    assignedToName: 'Manager One',
    coAssignees: [],
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    archived: false,
    version: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: [],
  },
];

const mockClients = [{ id: 'c-1', name: 'Alpha Corp', entity: 'ATA' as const, status: 'Active' }];
const mockTeam = [
  { id: 'u-mgr-1', name: 'Manager One', email: 'mgr@ata-lta.ph', role: 'Manager' },
  { id: 'u-staff-1', name: 'Staff One', email: 'staff@ata-lta.ph', role: 'Staff' },
];

const mockPendingRequest = {
  id: 'req-adv-100',
  requestType: 'wr_phase_transition',
  request_type: 'wr_phase_transition',
  workRequestId: 'wr-adv-1',
  work_request_id: 'wr-adv-1',
  fromPhase: 'pre_processing',
  from_phase: 'pre_processing',
  toPhase: 'processing',
  to_phase: 'processing',
  status: 'pending',
  notes: 'Pre-processing deliverables ready',
  requestedBy: 'u-mgr-1',
  requested_by: 'u-mgr-1',
  requestedByName: 'Manager One',
  requester: { name: 'Manager One' },
  work_requests: { title: 'Tax Compliance 2026' },
  workRequestTitle: 'Tax Compliance 2026',
  createdAt: new Date().toISOString(),
};

const mockRejectedRequest = {
  id: 'req-adv-200',
  requestType: 'wr_phase_transition',
  request_type: 'wr_phase_transition',
  workRequestId: 'wr-adv-1',
  work_request_id: 'wr-adv-1',
  fromPhase: 'pre_processing',
  from_phase: 'pre_processing',
  toPhase: 'processing',
  to_phase: 'processing',
  status: 'rejected',
  notes: 'First attempt',
  rejectionReason: 'Missing BIR 2307 certificate',
  rejection_reason: 'Missing BIR 2307 certificate',
  requestedBy: 'u-mgr-1',
  requested_by: 'u-mgr-1',
  requestedByName: 'Manager One',
  requester: { name: 'Manager One' },
  work_requests: { title: 'Tax Compliance 2026' },
  workRequestTitle: 'Tax Compliance 2026',
  createdAt: new Date().toISOString(),
  fulfilledAt: new Date().toISOString(),
};

const mockDoc: DmsDocument = {
  id: 'doc-adv-1',
  fileName: 'Financials.pdf',
  originalName: 'Financials.pdf',
  file_name: 'Financials.pdf',
  original_name: 'Financials.pdf',
  contentType: 'application/pdf',
  content_type: 'application/pdf',
  fileSize: 1024 * 500,
  file_size: 1024 * 500,
  category: 'FINANCIAL',
  status: 'active',
  document_lifecycle: 'stored',
  workRequestId: 'wr-adv-1',
  work_request_id: 'wr-adv-1',
  linked_task_id: null,
  linkedTaskId: null,
  clientId: 'c-1',
  client_id: 'c-1',
  document_type: 'pdf',
  documentType: 'pdf',
  uploader_id: 'u-mgr-1',
  uploaderId: 'u-mgr-1',
  description: null,
  entity_id: 'ATA',
  archived: false,
  storage_path: '/files/test.pdf',
  external_url: null,
  externalUrl: null,
  comments: [],
  versions: [],
  createdAt: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('Milestone 2 Adversarial Challenge Suite (Empirical Challenger 2)', () => {
  const originalFetch = global.fetch;

  let originalProcessListeners: Array<(...args: unknown[]) => void> = [];

  beforeAll(() => {
    originalProcessListeners = process.listeners('unhandledRejection') as Array<
      (...args: unknown[]) => void
    >;
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason, promise) => {
      if (
        reason instanceof Error &&
        reason.message.includes('Another operation is already in progress')
      ) {
        // Expected concurrency rejection from runBlockingAction double-click protection
        return;
      }
      originalProcessListeners.forEach((l) => l(reason, promise));
    });
  });

  afterAll(() => {
    process.removeAllListeners('unhandledRejection');
    originalProcessListeners.forEach((l) => {
      process.on('unhandledRejection', l);
    });
  });

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'u-mgr-1',
        email: 'mgr@ata-lta.ph',
        name: 'Manager One',
        role: 'Manager',
        departments: ['Operations'],
        entities: ['ATA', 'LTA'],
      },
      permissions: [
        'workflow:view',
        'workflow:edit',
        'workflow:phase_transition',
        'workflow:transition_request',
        'retainers:use',
      ],
      activeEntity: 'ATA',
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    useBlockingModalStore.getState().reset();
  });

  // ==========================================================================
  // TARGET 1: CONCURRENCY & DOUBLE-CLICK PROTECTION
  // ==========================================================================
  describe('Target 1: Concurrency & Double-Click Protection across UI Components', () => {
    it('1.1 WorkRequestList: prevents duplicate advancePhase submissions on rapid double-click', async () => {
      let advanceCallCount = 0;
      let resolveAdvance: (val: unknown) => void = () => {};

      global.fetch = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/clients')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockClients }),
          } as Response);
        }
        if (u.includes('/me/team')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockTeam }),
          } as Response);
        }
        if (u.includes('/advance')) {
          advanceCallCount++;
          return new Promise((resolve) => {
            resolveAdvance = resolve;
          });
        }
        if (u.includes('/operations/work-requests')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockWorkRequests, meta: { total: 2 } }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(<WorkRequestList />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('action-advance-wr-adv-1')).toBeInTheDocument();
      });

      const advanceBtn = screen.getByTestId('action-advance-wr-adv-1');

      // Click 1: initiates mutation and locks modal
      fireEvent.click(advanceBtn);

      await waitFor(() => {
        expect(useBlockingModalStore.getState().isLocked).toBe(true);
        expect(useBlockingModalStore.getState().title).toBe('Advancing Phase');
      });

      expect(advanceCallCount).toBe(1);

      // Click 2 (Double-click while in-flight): rejected by isLocked guard
      fireEvent.click(advanceBtn);

      // Verify NO duplicate network mutation occurred
      expect(advanceCallCount).toBe(1);

      // Settle the pending mutation
      resolveAdvance({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'wr-adv-1', phase: 'processing' } }),
      });

      await waitFor(() => {
        expect(useBlockingModalStore.getState().status).toBe('success');
      });

      useBlockingModalStore.getState().close();
      expect(useBlockingModalStore.getState().isLocked).toBe(false);
    });

    it('1.2 WorkRequestModal: prevents duplicate createWorkRequest submissions on double-click', async () => {
      let createCallCount = 0;
      let resolveCreate: (val: unknown) => void = () => {};

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/clients')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockClients }),
          } as Response);
        }
        if (u.includes('/me/team')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockTeam }),
          } as Response);
        }
        if ((opts?.method === 'PUT' || opts?.method === 'POST') && u.includes('/operations/work-requests')) {
          createCallCount++;
          return new Promise((resolve) => {
            resolveCreate = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(
        <WorkRequestModal
          isOpen={true}
          workRequest={mockWorkRequests[0]}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('wr-modal-title-input')).toBeInTheDocument();
      });

      const submitBtn = screen.getByTestId('wr-modal-submit-btn');

      // Click 1: starts saving
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(useBlockingModalStore.getState().isLocked).toBe(true);
        expect(useBlockingModalStore.getState().title).toBe('Saving Work Request');
      });

      expect(createCallCount).toBe(1);

      // Click 2 (Rapid double-click): blocked by isLocked guard
      fireEvent.click(submitBtn);

      // Call count remains strictly 1
      expect(createCallCount).toBe(1);

      // Settle
      resolveCreate({
        ok: true,
        status: 200,
        json: async () => ({
          data: { id: 'wr-adv-1', title: 'Tax Compliance 2026', phase: 'pre_processing' },
        }),
      });

      await waitFor(() => {
        expect(useBlockingModalStore.getState().status).toBe('success');
      });
    });

    it('1.3 ArchiveConfirmModal: prevents duplicate archive/restore mutation submissions on double-click', async () => {
      let archiveCallCount = 0;
      let resolveArchive: (val: unknown) => void = () => {};

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const u = String(url);
        if (opts?.method === 'POST' && u.includes('/archive')) {
          archiveCallCount++;
          return new Promise((resolve) => {
            resolveArchive = resolve;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(
        <ArchiveConfirmModal
          isOpen={true}
          actionType="archive"
          workRequest={mockWorkRequests[1] || null}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      const confirmBtn = screen.getByTestId('archive-confirm-btn');

      // First click
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(useBlockingModalStore.getState().isLocked).toBe(true);
        expect(useBlockingModalStore.getState().title).toBe('Archiving Work Request');
      });

      expect(archiveCallCount).toBe(1);

      // Second rapid click
      fireEvent.click(confirmBtn);

      // Ensure no duplicate backend request was fired
      expect(archiveCallCount).toBe(1);

      resolveArchive({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'wr-adv-2', archived: true } }),
      });

      await waitFor(() => {
        expect(useBlockingModalStore.getState().status).toBe('success');
      });
    });

    it('1.4 PendingApprovalsInbox: prevents duplicate approve/fulfill submissions on double-click', async () => {
      let fulfillCallCount = 0;
      let resolveFulfill: (val: unknown) => void = () => {};

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/operations-requests/counts')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: { pending: 1, rejected: 0, fulfilled: 0, total: 1 } }),
          } as Response);
        }
        if (u.includes('/operations-requests') && (opts?.method === 'PUT' || opts?.method === 'POST')) {
          fulfillCallCount++;
          return new Promise((resolve) => {
            resolveFulfill = resolve;
          });
        }
        if (u.includes('/operations-requests')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [mockPendingRequest] }),
          } as Response);
        }
        if (u.includes('/operations/work-requests/wr-adv-1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockWorkRequests[0] }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(<PendingApprovalsInbox />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('approve-btn')).toBeInTheDocument();
      });

      const approveBtn = screen.getByTestId('approve-btn');

      // Click 1: start approval
      fireEvent.click(approveBtn);

      await waitFor(() => {
        expect(useBlockingModalStore.getState().isLocked).toBe(true);
        expect(useBlockingModalStore.getState().title).toBe('Approving Phase Transition');
      });

      expect(fulfillCallCount).toBe(1);

      // Click 2: double-click attempt
      fireEvent.click(approveBtn);

      // No duplicate request
      expect(fulfillCallCount).toBe(1);

      resolveFulfill({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'req-adv-100', status: 'fulfilled' } }),
      });

      await waitFor(() => {
        expect(useBlockingModalStore.getState().status).toBe('success');
      });
    });

    it('1.5 PendingApprovalsInbox: prevents duplicate resubmit submissions on double-click', async () => {
      let resubmitCallCount = 0;
      let resolveResubmit: (val: unknown) => void = () => {};

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const u = String(url);
        if (u.includes('/operations-requests/counts')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: { pending: 0, rejected: 1, fulfilled: 0, total: 1 } }),
          } as Response);
        }
        if (opts?.method === 'POST' && u.includes('/operations-requests')) {
          resubmitCallCount++;
          return new Promise((resolve) => {
            resolveResubmit = resolve;
          });
        }
        if (u.includes('/operations-requests')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [mockRejectedRequest] }),
          } as Response);
        }
        if (u.includes('/operations/work-requests/wr-adv-1')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: mockWorkRequests[0] }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(<PendingApprovalsInbox />, { wrapper });

      // Switch to Rejected tab
      await waitFor(() => {
        expect(screen.getByTestId('tab-rejected')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('tab-rejected'));

      await waitFor(() => {
        expect(screen.getByTestId('resubmit-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('resubmit-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-resubmit-btn')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByTestId('confirm-resubmit-btn');

      // Click 1
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(useBlockingModalStore.getState().isLocked).toBe(true);
        expect(useBlockingModalStore.getState().title).toBe('Resubmitting Transition Request');
      });

      expect(resubmitCallCount).toBe(1);

      // Click 2
      fireEvent.click(confirmBtn);

      // Strictly single submission
      expect(resubmitCallCount).toBe(1);

      resolveResubmit({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'req-adv-300', status: 'pending' } }),
      });

      await waitFor(() => {
        expect(useBlockingModalStore.getState().status).toBe('success');
      });
    });
  });

  // ==========================================================================
  // TARGET 2: WATCHDOG TIMER (30-SECOND ABORT BEHAVIOR)
  // ==========================================================================
  describe('Target 2: Watchdog Timer (30-second abort behavior when mutations hang)', () => {
    it('2.1 triggers 30-second abort signal, rejects with WATCHDOG_TIMEOUT 504, and unlocks mutex', async () => {
      vi.useFakeTimers();

      let abortSignal: AbortSignal | null = null;

      try {
        const hangingPromise = runBlockingAction({
          title: 'Advancing Work Request',
          message: 'Waiting on backend transaction...',
          apiCall: (signal) => {
            abortSignal = signal;
            return new Promise(() => {}); // Never settles
          },
        });

        expect(abortSignal).not.toBeNull();
        expect((abortSignal as AbortSignal | null)?.aborted).toBe(false);
        expect(useBlockingModalStore.getState().isLocked).toBe(true);

        // Advance 29.9 seconds (29,900 ms) -> still running
        vi.advanceTimersByTime(29900);
        expect((abortSignal as AbortSignal | null)?.aborted).toBe(false);
        expect(useBlockingModalStore.getState().status).toBe('loading');
        expect(useBlockingModalStore.getState().isLocked).toBe(true);

        // Advance final 100 ms to hit exactly 30 seconds
        vi.advanceTimersByTime(100);

        await expect(hangingPromise).rejects.toSatisfy((err: unknown) => {
          expect(err).toBeInstanceOf(ApiError);
          const apiErr = err as ApiError;
          expect(apiErr.status).toBe(504);
          expect(apiErr.code).toBe('WATCHDOG_TIMEOUT');
          expect(apiErr.detail).toContain('The operation timed out after 30 seconds');
          return true;
        });

        // Verify signal was aborted
        expect((abortSignal as AbortSignal | null)?.aborted).toBe(true);

        // Verify store status and mutex release
        const state = useBlockingModalStore.getState();
        expect(state.status).toBe('error');
        expect(state.error?.code).toBe('WATCHDOG_TIMEOUT');
        expect(state.error?.status).toBe(504);
        expect(state.error?.title).toBe('Gateway Timeout');
        expect(state.isLocked).toBe(false); // Mutex freed
      } finally {
        vi.useRealTimers();
      }
    });

    it('2.2 allows user recovery after 30-second watchdog abort', async () => {
      vi.useFakeTimers();

      try {
        const hangingPromise = runBlockingAction({
          title: 'Hanging Request',
          message: 'Waiting...',
          apiCall: () => new Promise(() => {}),
        });

        vi.advanceTimersByTime(30000);
        await expect(hangingPromise).rejects.toThrow();

        expect(useBlockingModalStore.getState().isLocked).toBe(false);

        // User can now execute recovery action immediately
        const recoveryPromise = runBlockingAction({
          title: 'Recovery Request',
          message: 'Recovering...',
          apiCall: async () => ({ recovered: true }),
        });

        const res = await recoveryPromise;
        expect(res).toEqual({ recovered: true });
        expect(useBlockingModalStore.getState().isOpen).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('2.3 clears watchdog timer when request settles before 30 seconds', async () => {
      vi.useFakeTimers();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      try {
        const quickPromise = runBlockingAction({
          title: 'Normal Action',
          message: 'Executing...',
          apiCall: async () => 'completed',
        });

        const res = await quickPromise;
        expect(res).toBe('completed');
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(useBlockingModalStore.getState().isOpen).toBe(false);
        expect(useBlockingModalStore.getState().isLocked).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ==========================================================================
  // TARGET 3: NETWORK FAILURE & RFC 7807 PAYLOAD VARIATIONS
  // ==========================================================================
  describe('Target 3: Network Failure & RFC 7807 Payload Variations Resilience', () => {
    it('3.1 handles 502 HTML non-JSON response gracefully without JSON parse crash', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: new Headers({ 'Content-Type': 'text/html' }),
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
        text: async () => '<html><body><h1>502 Bad Gateway</h1></body></html>',
      } as unknown as Response);

      await expect(apiRequest('/operations/work-requests')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(502);
        expect(apiErr.detail).toBe('HTTP 502');
        return true;
      });

      // Verify modal extraction
      const extracted = extractRfc7807Error(
        new ApiError(502, 'Bad Gateway', 'HTTP 502')
      );
      expect(extracted.status).toBe(502);
      expect(extracted.title).toBe('Server Error');
      expect(extracted.detail).toBe('HTTP 502');

      useBlockingModalStore.getState().openLoading({ title: 'Gateway Test', message: 'Testing...' });
      useBlockingModalStore.getState().setError(extracted);

      render(React.createElement(BlockingActionModal));
      expect(screen.getByText('Server Error')).toBeInTheDocument();
      expect(screen.getByTestId('error-detail-body')).toHaveTextContent('HTTP 502');
    });

    it('3.2 handles 500 Internal Server Error with RFC 7807 JSON body', async () => {
      const rfc500 = {
        title: 'Internal Server Error',
        detail: 'Database transaction deadlock detected in backend worker pool',
        code: 'DB_DEADLOCK',
        status: 500,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => rfc500,
      } as Response);

      await expect(apiRequest('/operations/work-requests')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.code).toBe('DB_DEADLOCK');
        expect(apiErr.detail).toBe('Database transaction deadlock detected in backend worker pool');
        return true;
      });

      const extracted = extractRfc7807Error(
        new ApiError(500, 'Internal Server Error', rfc500.detail, rfc500.code)
      );

      useBlockingModalStore.getState().openLoading({ title: 'Deadlock Test', message: 'Testing...' });
      useBlockingModalStore.getState().setError(extracted);

      render(React.createElement(BlockingActionModal));
      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('DB_DEADLOCK');
      expect(screen.getByTestId('error-detail-body')).toHaveTextContent(
        'Database transaction deadlock detected in backend worker pool'
      );
    });

    it('3.3 handles 404 Not Found response gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          title: 'Not Found',
          detail: 'Work request with ID "wr-999" was not found',
          code: 'RESOURCE_NOT_FOUND',
        }),
      } as Response);

      await expect(apiRequest('/operations/work-requests/wr-999')).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.code).toBe('RESOURCE_NOT_FOUND');
        expect(apiErr.detail).toBe('Work request with ID "wr-999" was not found');
        return true;
      });

      const extracted = extractRfc7807Error(
        new ApiError(404, 'Not Found', 'Work request with ID "wr-999" was not found', 'RESOURCE_NOT_FOUND')
      );
      expect(extracted.title).toBe('Not Found');

      useBlockingModalStore.getState().openLoading({ title: '404 Test', message: 'Testing...' });
      useBlockingModalStore.getState().setError(extracted);

      render(React.createElement(BlockingActionModal));
      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('RESOURCE_NOT_FOUND');
      expect(screen.getByText('Not Found')).toBeInTheDocument();
    });

    it('3.4 handles complete network failure / drop (TypeError: Failed to fetch)', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(apiRequest('/operations/work-requests')).rejects.toThrow('Failed to fetch');

      const extracted = extractRfc7807Error(new TypeError('Failed to fetch'));
      expect(extracted.title).toBe('Unexpected Error');
      expect(extracted.detail).toBe('Failed to fetch');

      useBlockingModalStore.getState().openLoading({ title: 'Network Drop', message: 'Testing...' });
      useBlockingModalStore.getState().setError(extracted);

      render(React.createElement(BlockingActionModal));
      expect(screen.getByText('Unexpected Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
    });

    it('3.5 renders error safely when code is empty or undefined without broken badge', () => {
      const extractedNoCode = extractRfc7807Error(
        new ApiError(400, 'Bad Request', 'Missing required parameter', undefined)
      );
      expect(extractedNoCode.code).toBeUndefined();

      useBlockingModalStore.getState().openLoading({ title: 'Validation', message: 'Testing...' });
      useBlockingModalStore.getState().setError(extractedNoCode);

      render(React.createElement(BlockingActionModal));
      expect(screen.queryByTestId('error-code-badge')).not.toBeInTheDocument();
      expect(screen.getByText('Missing required parameter')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TARGET 4: FILE UPLOAD SIZE GUARD (> 50MB IMMEDIATE REJECTION)
  // ==========================================================================
  describe('Target 4: File Upload Size Guard (> 50MB Immediate Rejection)', () => {
    it('4.1 immediately rejects files > 50MB before network request without initiating upload', async () => {
      let uploadCallCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/download-url')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                url: 'https://storage.test/file.pdf',
                fileName: 'file.pdf',
              },
            }),
          } as Response);
        }
        uploadCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(
        <DocumentViewerModal
          isOpen={true}
          document={mockDoc}
          workRequest={mockWorkRequests[0] || null}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      // Create oversized file: 50MB + 1 byte (52,428,801 bytes)
      const oversizedFile = new File(['oversize'], 'audit_backup_archive.zip', {
        type: 'application/zip',
      });
      Object.defineProperty(oversizedFile, 'size', {
        value: 50 * 1024 * 1024 + 1,
      });

      const fileInput = document.querySelector('input[type="file"]');
      expect(fileInput).not.toBeNull();

      if (fileInput) {
        fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
      }

      // Verify immediate error banner display
      await waitFor(() => {
        expect(
          screen.getByText('File size exceeds maximum allowed limit of 50 MB.')
        ).toBeInTheDocument();
      });

      // Verify ZERO upload network calls were initiated
      expect(uploadCallCount).toBe(0);

      // Verify modal is not locked in loading
      expect(useBlockingModalStore.getState().isLocked).toBe(false);
      expect(useBlockingModalStore.getState().status).toBe('idle');
    });

    it('4.2 permits file exactly 50MB (52,428,800 bytes) to proceed to upload pipeline', async () => {
      let uploadCalled = false;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/documents')) {
          uploadCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: {
                document: { id: 'doc-uploaded', fileName: 'exact_50mb.dat' },
                uploadUrl: 'https://storage.test/upload',
              },
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(
        <DocumentViewerModal
          isOpen={true}
          document={mockDoc}
          workRequest={mockWorkRequests[0] || null}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      // Exactly 50 MB
      const exactFile = new File(['data'], 'exact_50mb.dat', { type: 'application/octet-stream' });
      Object.defineProperty(exactFile, 'size', {
        value: 50 * 1024 * 1024,
      });

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fireEvent.change(fileInput, { target: { files: [exactFile] } });
      }

      // No size error banner displayed
      expect(
        screen.queryByText('File size exceeds maximum allowed limit of 50 MB.')
      ).not.toBeInTheDocument();

      // Proceeded to upload
      await waitFor(() => {
        expect(uploadCalled).toBe(true);
      });
    });

    it('4.3 clears size error when user subsequently selects a valid file', async () => {
      const { wrapper } = createHarness();
      render(
        <DocumentViewerModal
          isOpen={true}
          document={mockDoc}
          workRequest={mockWorkRequests[0] || null}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      // 1. Oversize file first
      const oversizeFile = new File(['too_large'], 'huge.iso');
      Object.defineProperty(oversizeFile, 'size', {
        value: 60 * 1024 * 1024,
      });

      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fireEvent.change(fileInput, { target: { files: [oversizeFile] } });
      }

      await waitFor(() => {
        expect(
          screen.getByText('File size exceeds maximum allowed limit of 50 MB.')
        ).toBeInTheDocument();
      });

      // 2. Select valid file
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            document: { id: 'doc-ok', fileName: 'valid.pdf' },
            uploadUrl: 'https://storage.test/upload',
          },
        }),
      } as Response);

      const validFile = new File(['valid'], 'valid.pdf', { type: 'application/pdf' });
      Object.defineProperty(validFile, 'size', {
        value: 2 * 1024 * 1024,
      });

      if (fileInput) {
        fireEvent.change(fileInput, { target: { files: [validFile] } });
      }

      // Error banner is cleared
      await waitFor(() => {
        expect(
          screen.queryByText('File size exceeds maximum allowed limit of 50 MB.')
        ).not.toBeInTheDocument();
      });
    });
  });
});
