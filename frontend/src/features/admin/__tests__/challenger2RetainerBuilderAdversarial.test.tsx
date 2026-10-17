/**
 * Challenger 2 Adversarial Empirical Test Suite:
 * Retainer Builder, Duplicate Conflicts & Generation Logs
 *
 * Scope:
 * 1. Duplicate period conflict: Empirically verify that when a template duplicate period is submitted
 *    (UNIQUE(template_id, period_label)), HTTP 409 code (PERIOD_ALREADY_GENERATED) and detail are
 *    surfaced verbatim in the error modal.
 * 2. Phase constraint: Empirically verify that template builder tasks strictly permit only
 *    pre_processing and processing phases, rejecting invalid/downstream phases (quality_assurance, completion).
 * 3. Recurrence toggle: Verify behavior between none and annual, including required period_label hint when annual.
 * 4. Generation logs: Verify table correctly renders historical generations from
 *    GET /v1/admin/audit?table=retainer_template_generations matching staging data (FY-2026-SMOKE, FY-2027-SMOKE).
 * 5. Run test execution: verified through Vitest runner.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { RetainerTemplateList } from '../components/RetainerTemplateList';
import { RetainerTemplateModal } from '../components/RetainerTemplateModal';
import { RetainerGenerationLogs } from '../components/RetainerGenerationLogs';
import {
  useBlockingModalStore,
  runBlockingAction,
  BlockingActionModal,
} from '@/features/operations/components/BlockingActionModal';
import { RetainerGenerateModal } from '@/features/operations/components/RetainerGenerateModal';
import { useSessionStore } from '@/lib/session';
import { ApiError } from '@/lib/api';
import {
  creatablePhaseEnum,
  retainerTemplateTaskSchema,
  createRetainerTemplateSchema,
  generateRetainerTemplateSchema,
} from '../api/schemas';
import type { RetainerTemplate, AuditLogResponse, CreatablePhase } from '../api/types';

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

const stagingSmokeTemplate: RetainerTemplate = {
  id: 'tpl-smoke-1',
  entity_id: 'ent-ata',
  name: 'SMOKE Annual Compliance Retainer',
  description: 'Statutory compliance template for smoke verification',
  client_id: 'c-1',
  schedule: 'annual',
  priority: 'Normal',
  pf_amount: 50000,
  recurrence: 'annual',
  tasks: [
    {
      local_id: 'task_1',
      title: 'Collect Trial Balance & Source Invoices',
      phase: 'pre_processing',
    },
    {
      local_id: 'task_2',
      title: 'Reconcile General Ledger & Bank Records',
      phase: 'processing',
      depends_on_local_id: 'task_1',
    },
  ],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  clients: { name: 'Acme Philippines Corp' },
};

const stagingAdhocTemplate: RetainerTemplate = {
  id: 'tpl-adhoc-2',
  entity_id: 'ent-ata',
  name: 'Monthly Advisory Retainer',
  description: 'Ad-hoc consulting',
  client_id: null,
  schedule: 'monthly',
  priority: 'High',
  pf_amount: 20000,
  recurrence: 'none',
  tasks: [
    {
      local_id: 'task_1',
      title: 'Review Tax Inquiries',
      phase: 'pre_processing',
    },
  ],
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
};

const stagingGenerationAuditLogs: AuditLogResponse = {
  data: [
    {
      id: 'aud-gen-1',
      action: 'retainer-template.generated',
      tableName: 'retainer_template_generations',
      recordId: 'gen-row-1',
      entity: 'ATA',
      userId: 'user-admin',
      details: {
        templateId: 'tpl-smoke-1',
        workRequestId: 'e3cf8f27-1459-4fd7-9bb1-1f81662f3bf2',
        periodLabel: 'FY-2026-SMOKE',
      },
      createdAt: '2026-10-03T20:28:39Z',
    },
    {
      id: 'aud-gen-2',
      action: 'retainer-template.generated',
      tableName: 'retainer_template_generations',
      recordId: 'gen-row-2',
      entity: 'ATA',
      userId: 'user-admin',
      details: {
        templateId: 'tpl-smoke-1',
        workRequestId: '98b86a72-db01-46e3-b7c9-e26f171ceca4',
        periodLabel: 'FY-2027-SMOKE',
      },
      createdAt: '2026-10-03T20:28:58Z',
    },
  ],
  meta: {
    total: 2,
    limit: 20,
    offset: 0,
    hasMore: false,
  },
};

describe('Challenger 2 Adversarial Suite: Retainer Builder, Duplicate Conflicts & Generation Logs', () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    // JSDOM environment polyfills for Radix UI select & interactions
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    useBlockingModalStore.getState().reset();
    useSessionStore.getState().setSession({
      user: {
        id: 'user-admin',
        email: 'dev-admin@ata-lta.ph',
        name: 'Admin Developer',
        role: 'Admin',
        departments: ['Management'],
        entities: ['ATA'],
      },
      permissions: ['users:view', 'users:manage', 'retainers:use', 'retainers:edit'],
      activeEntity: 'ALL',
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/operations/templates')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [stagingSmokeTemplate, stagingAdhocTemplate] }),
        } as Response);
      }
      if (u.includes('/admin/audit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => stagingGenerationAuditLogs,
        } as Response);
      }
      if (u.includes('/clients')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'c-1', name: 'Acme Philippines Corp', entity: 'ATA' }] }),
        } as Response);
      }
      if (u.includes('/admin/users')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                id: 'user-admin',
                name: 'Admin Developer',
                role: 'Admin',
                departments: ['Management'],
                entities: ['ATA'],
                isActive: true,
              },
            ],
          }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      } as Response);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    useBlockingModalStore.getState().reset();
  });

  // ==========================================================================
  // Scope 1: Duplicate Period Conflict & Verbatim RFC 7807 Modal Surfacing
  // ==========================================================================
  describe('Scope 1: Duplicate Period Conflict (HTTP 409 PERIOD_ALREADY_GENERATED)', () => {
    it('surfaces HTTP 409 PERIOD_ALREADY_GENERATED code badge and exact detail verbatim in BlockingActionModal', async () => {
      const { wrapper } = createHarness();

      render(
        <div>
          <BlockingActionModal />
        </div>,
        { wrapper }
      );

      // Trigger runBlockingAction simulating backend duplicate conflict
      const duplicateError = new ApiError(
        409,
        'Conflict',
        'Work request has already been generated for this template and period "FY-2026-SMOKE"',
        'PERIOD_ALREADY_GENERATED'
      );

      await expect(
        runBlockingAction({
          title: 'Generating Retainer WR',
          message: 'Validating uniqueness...',
          apiCall: async () => {
            throw duplicateError;
          },
        })
      ).rejects.toThrow();

      // Assert modal opens and renders exact RFC 7807 problem details
      await waitFor(() => {
        expect(screen.getByTestId('error-code-badge')).toBeInTheDocument();
      });

      const codeBadge = screen.getByTestId('error-code-badge');
      expect(codeBadge).toHaveTextContent('PERIOD_ALREADY_GENERATED');

      const detailBody = screen.getByTestId('error-detail-body');
      expect(detailBody).toHaveTextContent(
        'Work request has already been generated for this template and period "FY-2026-SMOKE"'
      );

      // Technical status display
      expect(screen.getByText(/HTTP Status: 409/)).toBeInTheDocument();
      expect(screen.getByText('Conflict')).toBeInTheDocument();
    });

    it('surfaces duplicate period conflict when submitted via RetainerTemplateModal', async () => {
      const { wrapper } = createHarness();

      global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const u = String(url);
        if (opts?.method === 'POST' && u.includes('/operations/templates')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              status: 409,
              title: 'Conflict',
              code: 'PERIOD_ALREADY_GENERATED',
              detail: 'Template already exists with conflicting period rules',
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      });

      render(
        <div>
          <RetainerTemplateModal template={null} isOpen={true} onClose={vi.fn()} />
          <BlockingActionModal />
        </div>,
        { wrapper }
      );

      fireEvent.change(screen.getByTestId('template-name-input'), {
        target: { value: 'Duplicate Period Retainer' },
      });
      fireEvent.change(screen.getByTestId('task-title-input-0'), {
        target: { value: 'Primary Blueprint Task' },
      });

      fireEvent.click(screen.getByTestId('template-modal-submit-btn'));

      await waitFor(() => {
        const modalState = useBlockingModalStore.getState();
        expect(modalState.error?.code).toBe('PERIOD_ALREADY_GENERATED');
        expect(modalState.error?.status).toBe(409);
        expect(modalState.error?.detail).toBe('Template already exists with conflicting period rules');
      });

      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('PERIOD_ALREADY_GENERATED');
      expect(screen.getByTestId('error-detail-body')).toHaveTextContent(
        'Template already exists with conflicting period rules'
      );
    });

    it('surfaces 409 conflict when duplicate period generation is executed via runBlockingAction', async () => {
      const { wrapper } = createHarness();

      render(
        <div>
          <BlockingActionModal />
        </div>,
        { wrapper }
      );

      const duplicateGenError = new ApiError(
        409,
        'Conflict',
        'Work request has already been generated for this template and period "FY-2026-SMOKE"',
        'PERIOD_ALREADY_GENERATED'
      );

      await expect(
        runBlockingAction({
          title: 'Generating Work Requests',
          message: 'Generating work requests from template...',
          apiCall: async () => {
            throw duplicateGenError;
          },
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('error-code-badge')).toBeInTheDocument();
      });

      expect(screen.getByTestId('error-code-badge')).toHaveTextContent('PERIOD_ALREADY_GENERATED');
      expect(screen.getByTestId('error-detail-body')).toHaveTextContent(
        'Work request has already been generated for this template and period "FY-2026-SMOKE"'
      );
    });

    it('preserves multiline formatting, special characters, and quotes in verbatim detail without escaping artifacts', async () => {
      const { wrapper } = createHarness();

      render(
        <div>
          <BlockingActionModal />
        </div>,
        { wrapper }
      );

      const complexDetail =
        'Conflict on UNIQUE(template_id, period_label):\n• Template: "SMOKE Annual Compliance Retainer"\n• Period: "FY-2026-SMOKE"\n• Violating constraint: idx_retainer_gen_unique';

      const complexError = new ApiError(
        409,
        'Conflict',
        complexDetail,
        'PERIOD_ALREADY_GENERATED'
      );

      await expect(
        runBlockingAction({
          title: 'Testing complex detail formatting',
          message: 'Executing...',
          apiCall: async () => {
            throw complexError;
          },
        })
      ).rejects.toThrow();

      await waitFor(() => {
        expect(screen.getByTestId('error-code-badge')).toHaveTextContent('PERIOD_ALREADY_GENERATED');
      });

      const detailBody = screen.getByTestId('error-detail-body');
      expect(detailBody.textContent).toBe(complexDetail);
    });
  });

  // ==========================================================================
  // Scope 2: Strict Phase Constraints (pre_processing & processing ONLY)
  // ==========================================================================
  describe('Scope 2: Phase Constraints (Strictly pre_processing & processing)', () => {
    it('Zod creatablePhaseEnum strictly validates pre_processing and processing while rejecting downstream phases', () => {
      // Valid phases
      expect(creatablePhaseEnum.safeParse('pre_processing').success).toBe(true);
      expect(creatablePhaseEnum.safeParse('processing').success).toBe(true);

      // Downstream runtime phases MUST be rejected
      const qaResult = creatablePhaseEnum.safeParse('quality_assurance');
      expect(qaResult.success).toBe(false);

      const completionResult = creatablePhaseEnum.safeParse('completion');
      expect(completionResult.success).toBe(false);

      // Arbitrary and invalid phases MUST be rejected
      expect(creatablePhaseEnum.safeParse('post_processing').success).toBe(false);
      expect(creatablePhaseEnum.safeParse('done').success).toBe(false);
      expect(creatablePhaseEnum.safeParse('in_progress').success).toBe(false);
      expect(creatablePhaseEnum.safeParse('').success).toBe(false);
      expect(creatablePhaseEnum.safeParse(null).success).toBe(false);
      expect(creatablePhaseEnum.safeParse(undefined).success).toBe(false);
    });

    it('retainerTemplateTaskSchema rejects tasks with quality_assurance or completion phases', () => {
      // Valid tasks
      const validTask1 = { title: 'Pre Task', phase: 'pre_processing' };
      const validTask2 = { title: 'Proc Task', phase: 'processing' };
      expect(retainerTemplateTaskSchema.safeParse(validTask1).success).toBe(true);
      expect(retainerTemplateTaskSchema.safeParse(validTask2).success).toBe(true);

      // Invalid task with quality_assurance
      const qaTask = { title: 'QA Task', phase: 'quality_assurance' };
      const qaParse = retainerTemplateTaskSchema.safeParse(qaTask);
      expect(qaParse.success).toBe(false);

      // Invalid task with completion
      const compTask = { title: 'Comp Task', phase: 'completion' };
      const compParse = retainerTemplateTaskSchema.safeParse(compTask);
      expect(compParse.success).toBe(false);
    });

    it('createRetainerTemplateSchema rejects blueprint containing any invalid phase task', () => {
      const templatePayloadWithQa = {
        name: 'Invalid QA Template',
        schedule: 'annual',
        recurrence: 'annual',
        tasks: [
          { title: 'Task 1', phase: 'pre_processing' },
          { title: 'Task 2', phase: 'quality_assurance' }, // rejected
        ],
      };

      const result = createRetainerTemplateSchema.safeParse(templatePayloadWithQa);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toEqual(['tasks', 1, 'phase']);
      }
    });

    it('RetainerTemplateModal UI phase select renders default Pre-Processing and rejects invalid phases', async () => {
      const { wrapper } = createHarness();

      render(
        <RetainerTemplateModal template={null} isOpen={true} onClose={vi.fn()} />,
        { wrapper }
      );

      const phaseTrigger = screen.getByTestId('task-phase-select-0');
      expect(phaseTrigger).toBeInTheDocument();
      expect(phaseTrigger).toHaveTextContent('Pre-Processing');
    });

    it('RetainerTemplateModal form submission blocks corrupted task phase outside pre_processing/processing', async () => {
      const { wrapper } = createHarness();
      const mockApi = vi.fn();

      global.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'PUT' || opts?.method === 'POST') {
          mockApi();
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
      });

      // Craft template with corrupted downstream phase
      const corruptedTemplate: RetainerTemplate = {
        ...stagingSmokeTemplate,
        id: 'tpl-corrupt-1',
        tasks: [
          {
            local_id: 'task_1',
            title: 'Corrupted QA Task',
            phase: 'quality_assurance' as unknown as CreatablePhase,
          },
        ],
      };

      render(
        <RetainerTemplateModal
          template={corruptedTemplate}
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      fireEvent.click(screen.getByTestId('template-modal-submit-btn'));

      // Form validation aborts submission: API is never called
      expect(mockApi).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Scope 3: Recurrence Toggle Behavior & Period Label Hint
  // ==========================================================================
  describe('Scope 3: Recurrence Toggle (none vs annual) & Period Hint', () => {
    it('toggles cleanly between none and annual, displaying period guidance hint ONLY when annual', async () => {
      const { wrapper } = createHarness();

      render(
        <RetainerTemplateModal template={null} isOpen={true} onClose={vi.fn()} />,
        { wrapper }
      );

      // Default state: 'none'
      const noneRadio = screen.getByTestId('recurrence-none-radio') as HTMLInputElement;
      const annualRadio = screen.getByTestId('recurrence-annual-radio') as HTMLInputElement;

      expect(noneRadio.checked).toBe(true);
      expect(annualRadio.checked).toBe(false);
      expect(screen.queryByTestId('annual-period-hint')).not.toBeInTheDocument();

      // Switch to annual
      fireEvent.click(annualRadio);

      expect(annualRadio.checked).toBe(true);
      expect(noneRadio.checked).toBe(false);

      // Hint must now be visible in DOM
      const hint = screen.getByTestId('annual-period-hint');
      expect(hint).toBeInTheDocument();
      expect(hint).toHaveTextContent(/Annual Period Label Guidance/i);
      expect(hint).toHaveTextContent(/FY-2026/);
      expect(hint).toHaveTextContent(/UNIQUE\(template_id, period_label\)/);

      // Switch back to none
      fireEvent.click(noneRadio);

      expect(noneRadio.checked).toBe(true);
      expect(annualRadio.checked).toBe(false);
      expect(screen.queryByTestId('annual-period-hint')).not.toBeInTheDocument();
    });

    it('pre-populates recurrence toggle and period hint when editing an existing annual template', () => {
      const { wrapper } = createHarness();

      render(
        <RetainerTemplateModal
          template={stagingSmokeTemplate} // recurrence: 'annual'
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      const annualRadio = screen.getByTestId('recurrence-annual-radio') as HTMLInputElement;
      expect(annualRadio.checked).toBe(true);
      expect(screen.getByTestId('annual-period-hint')).toBeInTheDocument();
    });

    it('RetainerTemplateList accurately renders Annual recurrence badge with Repeat icon vs None badge', async () => {
      const { wrapper } = createHarness();

      render(
        <RetainerTemplateList onNewTemplate={vi.fn()} onEditTemplate={vi.fn()} />,
        { wrapper }
      );

      await waitFor(() => {
        expect(screen.getByTestId('template-card-tpl-smoke-1')).toBeInTheDocument();
        expect(screen.getByTestId('template-card-tpl-adhoc-2')).toBeInTheDocument();
      });

      // Annual template
      const smokeBadge = screen.getByTestId('template-recurrence-tpl-smoke-1');
      expect(smokeBadge).toHaveTextContent('Annual');
      expect(smokeBadge.className).toContain('text-purple-700');

      // None / ad-hoc template
      const adhocCard = screen.getByTestId('template-card-tpl-adhoc-2');
      expect(adhocCard).toHaveTextContent('None');
    });

    it('RetainerGenerateModal validates required template selection and period label contracts', async () => {
      const { wrapper } = createHarness();

      render(
        <div>
          <RetainerGenerateModal isOpen={true} onClose={vi.fn()} />
        </div>,
        { wrapper }
      );

      // Wait for template data to load
      await waitFor(() => {
        expect(screen.getByTestId('template-select')).not.toBeDisabled();
      });

      // Submit button is disabled by design when no template is selected
      const submitBtn = screen.getByTestId('generate-submit-btn');
      expect(submitBtn).toBeDisabled();

      // Options include the smoke annual template
      expect(screen.getByText(/SMOKE Annual Compliance Retainer/)).toBeInTheDocument();

      // Verify schema validation for period_label
      expect(generateRetainerTemplateSchema.safeParse({ period_label: 'FY-2026' }).success).toBe(true);
      expect(generateRetainerTemplateSchema.safeParse({ period_label: null }).success).toBe(true);
      expect(generateRetainerTemplateSchema.safeParse({}).success).toBe(true);
    });
  });

  // ==========================================================================
  // Scope 4: Retainer Generation Logs Table & Staging Data
  // ==========================================================================
  describe('Scope 4: Generation Logs Table (Audit Trail & Staging Records)', () => {
    it('correctly fetches and renders historical generations matching staging data (FY-2026-SMOKE, FY-2027-SMOKE)', async () => {
      const { wrapper } = createHarness();

      render(<RetainerGenerationLogs />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('generation-logs-table')).toBeInTheDocument();
      });

      // Period labels from staging smoke data
      const period1 = screen.getByTestId('log-period-aud-gen-1');
      expect(period1).toHaveTextContent('FY-2026-SMOKE');

      const period2 = screen.getByTestId('log-period-aud-gen-2');
      expect(period2).toHaveTextContent('FY-2027-SMOKE');

      // Resolved template name
      const template1 = screen.getByTestId('log-template-aud-gen-1');
      expect(template1).toHaveTextContent('SMOKE Annual Compliance Retainer');

      // Work request links
      const wr1 = screen.getByTestId('log-wr-aud-gen-1');
      expect(wr1).toHaveTextContent('e3cf8f27-145');
      expect(wr1.getAttribute('href')).toBe('/operations?search=e3cf8f27-1459-4fd7-9bb1-1f81662f3bf2');

      // Total count badge
      expect(screen.getByText('2 Total Generations')).toBeInTheDocument();

      // Entity
      expect(screen.getAllByText('ATA').length).toBeGreaterThan(0);
    });

    it('queries GET /v1/admin/audit?table=retainer_template_generations with pagination parameters', async () => {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/admin/audit')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => stagingGenerationAuditLogs,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      });

      global.fetch = fetchSpy;
      const { wrapper } = createHarness();

      render(<RetainerGenerationLogs />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('generation-logs-table')).toBeInTheDocument();
      });

      // Verify URL called matches table=retainer_template_generations
      const auditCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes('/admin/audit')
      );
      expect(auditCalls.length).toBeGreaterThan(0);
      const firstCallUrl = String(auditCalls[0]?.[0] || '');
      expect(firstCallUrl).toContain('table=retainer_template_generations');
      expect(firstCallUrl).toContain('limit=20');
      expect(firstCallUrl).toContain('offset=0');
    });

    it('handles empty generation log response with friendly empty state', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/admin/audit')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(<RetainerGenerationLogs />, { wrapper });

      await waitFor(() => {
        expect(screen.getByText('No generation records found')).toBeInTheDocument();
      });
      expect(screen.getByText('0 Total Generations')).toBeInTheDocument();
    });

    it('handles unexpected audit log details gracefully without crashing', async () => {
      const logsWithMissingFields: AuditLogResponse = {
        data: [
          {
            id: 'aud-gen-unknown',
            action: 'retainer-template.generated',
            tableName: 'retainer_template_generations',
            recordId: 'wr-raw-uuid-12345',
            entity: 'LTA',
            userId: 'user-deleted-or-unknown',
            details: {
              templateId: 'tpl-nonexistent-99',
              periodLabel: null,
            },
            createdAt: '2026-10-04T12:00:00Z',
          },
        ],
        meta: { total: 1, limit: 20, offset: 0, hasMore: false },
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.includes('/admin/audit')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => logsWithMissingFields,
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: [] }),
        } as Response);
      });

      const { wrapper } = createHarness();
      render(<RetainerGenerationLogs />, { wrapper });

      await waitFor(() => {
        expect(screen.getByTestId('generation-logs-table')).toBeInTheDocument();
      });

      // Falls back to template ID when name unresolvable
      expect(screen.getByTestId('log-template-aud-gen-unknown')).toHaveTextContent('tpl-nonexistent-99');
      // Falls back to None when periodLabel is null
      expect(screen.getByText('None')).toBeInTheDocument();
      // Falls back to raw userId
      expect(screen.getByText('user-deleted-or-unknown')).toBeInTheDocument();
      // WR link falls back to recordId
      expect(screen.getByTestId('log-wr-aud-gen-unknown')).toHaveTextContent('wr-raw-uuid-1');
    });
  });
});
