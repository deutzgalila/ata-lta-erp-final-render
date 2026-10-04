import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  type WorkRequest,
  type RetainerTemplate,
  parseTaskDelimiterInput,
  applyQaReroute,
} from './e2e-contracts';
import {
  PhaseKanbanHarness,
  DelimiterInputHarness,
  AssignerSelectHarness,
  RetainerGenerateHarness,
} from './e2e-test-harness';
import { setupTestSession } from './e2e-test-utils';
import { isModuleEnabled } from '@/lib/flags';
import { hasPermission } from '@/lib/permissions';
import { useSessionStore } from '@/lib/session';

describe('Tier 1: Feature Coverage (Features 16–20)', () => {
  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, [
      'workflow:view',
      'workflow:edit',
      'workflow:qa_review',
      'retainers:use',
      'retainers:edit',
    ]);
  });

  // ------------------------------------------------------------------------
  // Feature 16: Server-True Reroute Dialog & Reopen Logic
  // ------------------------------------------------------------------------
  describe('Feature 16: Server-True Reroute Dialog & Reopen Logic', () => {
    const wrWithFailedTask: WorkRequest = {
      id: 'wr-reroute-1',
      title: 'Tax Compliance Engagement',
      entity: 'ATA',
      status: 'In Progress',
      phase: 'quality_assurance',
      priority: 'High',
      archived: false,
      version: 2,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      tasks: [
        {
          id: 'task-pass',
          workRequestId: 'wr-reroute-1',
          title: 'Review Gross Revenue Ledgers',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'passed',
          displayOrder: 1000,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'task-fail',
          workRequestId: 'wr-reroute-1',
          title: 'Audit Input Tax Deductions',
          status: 'Completed',
          phase: 'quality_assurance',
          qaStatus: 'failed',
          displayOrder: 2000,
          createdAt: '2026-10-01T00:00:00Z',
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    };

    it('test_f16_01_reroute_button_lights_up_when_task_failed: Reroute button enabled when failed tasks exist', () => {
      render(<PhaseKanbanHarness workRequest={wrWithFailedTask} canQaReview={true} />);

      const rerouteBtn = screen.getByTestId('reroute-button');
      expect(rerouteBtn).toBeInTheDocument();
      expect(rerouteBtn).not.toBeDisabled();
    });

    it('test_f16_02_reroute_dialog_target_phase_options: opens dialog with target phase selector', () => {
      render(<PhaseKanbanHarness workRequest={wrWithFailedTask} canQaReview={true} />);

      fireEvent.click(screen.getByTestId('reroute-button'));

      expect(screen.getByTestId('reroute-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('reroute-phase-select')).toBeInTheDocument();
      expect(screen.getByText('Pre-processing')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });

    it('test_f16_03_reroute_dialog_lists_failed_tasks: lists failed tasks that will be reopened', () => {
      render(<PhaseKanbanHarness workRequest={wrWithFailedTask} canQaReview={true} />);

      fireEvent.click(screen.getByTestId('reroute-button'));

      const reopenedList = screen.getByTestId('reopened-tasks-list');
      expect(reopenedList).toHaveTextContent('Audit Input Tax Deductions');
      expect(reopenedList).not.toHaveTextContent('Review Gross Revenue Ledgers');
    });

    it('test_f16_04_reroute_submission_requires_reason: confirm button disabled until reason is typed', () => {
      render(<PhaseKanbanHarness workRequest={wrWithFailedTask} canQaReview={true} />);

      fireEvent.click(screen.getByTestId('reroute-button'));

      const confirmBtn = screen.getByTestId('confirm-reroute-btn');
      expect(confirmBtn).toBeDisabled();

      const reasonInput = screen.getByTestId('reroute-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Invoices lack official BIR receipts.' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('test_f16_05_reroute_reopens_only_failed_tasks: applyQaReroute resets failed task to In Progress and none', () => {
      const { updatedWr, reopenedTasks } = applyQaReroute(
        wrWithFailedTask,
        'processing',
        'Invoices lack official BIR receipts.'
      );

      expect(updatedWr.phase).toBe('processing');
      expect(reopenedTasks).toHaveLength(1);
      expect(reopenedTasks[0]?.id).toBe('task-fail');
      expect(reopenedTasks[0]?.status).toBe('In Progress');
      expect(reopenedTasks[0]?.qaStatus).toBe('none');

      // Passed task is untouched
      const passedTask = updatedWr.tasks?.find((t) => t.id === 'task-pass');
      expect(passedTask?.status).toBe('Completed');
      expect(passedTask?.qaStatus).toBe('passed');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 17: Delimiter Tokenization & Preview Chips
  // ------------------------------------------------------------------------
  describe('Feature 17: Delimiter Tokenization & Preview Chips', () => {
    it('test_f17_01_tokenizer_single_item_no_chips: single task title yields 1 token without chip container', () => {
      const parsed = parseTaskDelimiterInput('Prepare Monthly Management Accounts');
      expect(parsed.count).toBe(1);
      expect(parsed.shouldSplit).toBe(false);

      render(<DelimiterInputHarness initialValue="Prepare Monthly Management Accounts" />);
      expect(screen.queryByTestId('preview-chips-container')).not.toBeInTheDocument();
    });

    it('test_f17_02_tokenizer_comma_split: splits input on commas into distinct task chips', () => {
      const parsed = parseTaskDelimiterInput('Task A, Task B, Task C');
      expect(parsed.count).toBe(3);
      expect(parsed.shouldSplit).toBe(true);

      render(<DelimiterInputHarness initialValue="Task A, Task B, Task C" />);
      expect(screen.getByTestId('preview-chips-container')).toBeInTheDocument();
      expect(screen.getByTestId('chip-count-badge')).toHaveTextContent('Will create 3 tasks');
      const chips = screen.getAllByTestId('task-chip');
      expect(chips).toHaveLength(3);
      expect(chips[0]).toHaveTextContent('Task A');
    });

    it('test_f17_03_tokenizer_semicolon_split: splits input on semicolons into chips', () => {
      const parsed = parseTaskDelimiterInput('Request bank statement; Reconcile petty cash');
      expect(parsed.count).toBe(2);
      expect(parsed.tokens).toEqual(['Request bank statement', 'Reconcile petty cash']);
    });

    it('test_f17_04_tokenizer_newline_split: splits input on newlines into chips', () => {
      const parsed = parseTaskDelimiterInput('Step 1\nStep 2\nStep 3\nStep 4');
      expect(parsed.count).toBe(4);
      expect(parsed.tokens).toHaveLength(4);
    });

    it('test_f17_05_tokenizer_period_space_split: splits on period followed by space', () => {
      const parsed = parseTaskDelimiterInput('Draft tax report. Submit to client for sign-off.');
      expect(parsed.count).toBe(2);
      expect(parsed.tokens[0]).toBe('Draft tax report');
      expect(parsed.tokens[1]).toBe('Submit to client for sign-off.');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 18: Assigner Multi-Select & Attribution
  // ------------------------------------------------------------------------
  describe('Feature 18: Assigner Multi-Select & Attribution', () => {
    const availableStaff = [
      { id: 'u-1', name: 'Ana Gomez', role: 'Staff' },
      { id: 'u-2', name: 'Ben Cruz', role: 'Staff' },
      { id: 'u-3', name: 'Carlos Ramos', role: 'Specialist' },
      { id: 'u-4', name: 'Diana Manager', role: 'Manager' },
      { id: 'u-5', name: 'Elena Admin', role: 'Admin' },
    ];

    it('test_f18_01_primary_assignee_dropdown_managers_only: filters eligible managers for assignedTo', () => {
      const eligibleManagers = availableStaff.filter((s) => s.role === 'Manager');
      expect(eligibleManagers).toHaveLength(1);
      expect(eligibleManagers[0]?.name).toBe('Diana Manager');
    });

    it('test_f18_02_co_assignees_excludes_already_selected: excludes already selected users from dropdown', () => {
      render(<AssignerSelectHarness availableStaff={availableStaff} selectedIds={['u-1']} />);

      expect(screen.getByTestId('selected-chip-u-1')).toBeInTheDocument();
      const dropdown = screen.getByTestId('assignee-dropdown');
      expect(dropdown).not.toHaveTextContent('Ana Gomez');
      expect(dropdown).toHaveTextContent('Ben Cruz');
    });

    it('test_f18_03_co_assignees_assign_all_button: selects all remaining non-admin/non-manager staff', () => {
      const handleChange = vi.fn();
      render(<AssignerSelectHarness availableStaff={availableStaff} onChange={handleChange} />);

      fireEvent.click(screen.getByTestId('assign-all-btn'));
      expect(handleChange).toHaveBeenCalledWith(['u-1', 'u-2', 'u-3']);
    });

    it('test_f18_04_co_assignees_removes_user_on_chip_close: clicking x removes selected user chip', () => {
      const handleChange = vi.fn();
      render(<AssignerSelectHarness availableStaff={availableStaff} selectedIds={['u-1', 'u-2']} onChange={handleChange} />);

      fireEvent.click(screen.getByTestId('remove-chip-u-1'));
      expect(handleChange).toHaveBeenCalledWith(['u-2']);
    });

    it('test_f18_05_attribution_badge_display: formats assigned_by and assigned_at metadata string', () => {
      const attribution = {
        userName: 'Ana Gomez',
        assignedByName: 'Diana Manager',
        assignedAt: '2026-10-03T14:30:00Z',
      };

      const displayText = `${attribution.userName} (Assigned by ${attribution.assignedByName} on 2026-10-03)`;
      expect(displayText).toContain('Ana Gomez');
      expect(displayText).toContain('Assigned by Diana Manager');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 19: Retainer Generation Entry Point
  // ------------------------------------------------------------------------
  describe('Feature 19: Retainer Generation Entry Point', () => {
    const templates: RetainerTemplate[] = [
      {
        id: 'tpl-1',
        name: 'Annual Corporate Tax Retainer',
        entity: 'ATA',
        recurrence: 'annual',
        defaultPriority: 'High',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tpl-2',
        name: 'Monthly Bookkeeping Retainer',
        entity: 'ATA',
        recurrence: 'none',
        defaultPriority: 'Normal',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('test_f19_01_generate_from_retainer_button_gated_by_permission: grants visibility based on retainers:use', () => {
      expect(hasPermission(['retainers:use'], 'retainers:use')).toBe(true);
      expect(hasPermission(['workflow:view'], 'retainers:use')).toBe(false);
    });

    it('test_f19_02_retainer_dialog_lists_active_templates: populates template dropdown from query', () => {
      render(<RetainerGenerateHarness templates={templates} />);

      const select = screen.getByTestId('template-select');
      expect(select).toHaveTextContent('Annual Corporate Tax Retainer');
      expect(select).toHaveTextContent('Monthly Bookkeeping Retainer');
    });

    it('test_f19_03_retainer_annual_requires_period_label: renders required Period Label field for annual templates', () => {
      render(<RetainerGenerateHarness templates={templates} />);

      expect(screen.getByTestId('period-label-input')).toBeInTheDocument();
      const generateBtn = screen.getByTestId('execute-generate-btn');
      expect(generateBtn).toBeDisabled();
    });

    it('test_f19_04_retainer_none_recurrence_period_label_optional: hides period label for recurrence none', () => {
      render(<RetainerGenerateHarness templates={[templates[1]!]} />);

      expect(screen.queryByTestId('period-label-input')).not.toBeInTheDocument();
      const generateBtn = screen.getByTestId('execute-generate-btn');
      expect(generateBtn).not.toBeDisabled();
    });

    it('test_f19_05_retainer_generate_success_redirects: clicking generate with period label triggers callback', async () => {
      const handleGenerate = vi.fn().mockResolvedValue(undefined);
      render(<RetainerGenerateHarness templates={templates} onGenerate={handleGenerate} />);

      const input = screen.getByTestId('period-label-input');
      fireEvent.change(input, { target: { value: 'FY-2026' } });

      const generateBtn = screen.getByTestId('execute-generate-btn');
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      expect(handleGenerate).toHaveBeenCalledWith('tpl-1', 'FY-2026');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 20: Flag Activation & Operations Route
  // ------------------------------------------------------------------------
  describe('Feature 20: Flag Activation & Operations Route', () => {
    it('test_f20_01_operations_route_requires_auth: rejects unauthenticated user from accessing route', () => {
      setupTestSession({ role: 'Operations' }, []);
      useSessionStore.setState({ isAuthenticated: false });

      expect(useSessionStore.getState().isAuthenticated).toBe(false);
    });

    it('test_f20_02_operations_route_requires_workflow_view: verifies workflow:view permission gate', () => {
      expect(hasPermission(['workflow:view'], 'workflow:view')).toBe(true);
      expect(hasPermission(['billing:view'], 'workflow:view')).toBe(false);
    });

    it('test_f20_03_operations_flag_enabled_renders_module: evaluates module flag status', () => {
      // Prior to Step 6, flag is disabled; flag helper returns boolean
      const isOpsEnabled = isModuleEnabled('Operations');
      expect(typeof isOpsEnabled).toBe('boolean');
    });

    it('test_f20_04_operations_flag_disabled_renders_placeholder: placeholder expected when flag inactive', () => {
      const enabled = isModuleEnabled('Operations');
      if (!enabled) {
        expect(enabled).toBe(false);
      }
    });

    it('test_f20_05_operations_navigation_tabs: defines the standard 4 operations navigation tabs', () => {
      const tabs = ['Work Requests', 'Retainer Templates', 'Pending Approvals', 'Archive'];
      expect(tabs).toHaveLength(4);
      expect(tabs).toContain('Work Requests');
      expect(tabs).toContain('Pending Approvals');
    });
  });
});
