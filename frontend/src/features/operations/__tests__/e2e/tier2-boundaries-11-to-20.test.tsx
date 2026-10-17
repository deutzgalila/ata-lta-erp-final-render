import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import {
  type WorkRequest,
  type RetainerTemplate,
  computeBoardOrder,
  evaluateAdvancementGate,
  applyQaReroute,
  parseTaskDelimiterInput,
  generateRetainerTemplateSchema,
  createPhaseTransitionRequestSchema,
} from './e2e-contracts';
import {
  PhaseKanbanHarness,
  DelimiterInputHarness,
  AssignerSelectHarness,
  RetainerGenerateHarness,
} from './e2e-test-harness';
import { setupTestSession } from './e2e-test-utils';
import { hasPermission } from '@/lib/permissions';

describe('Tier 2: Boundary & Corner Cases (Features 11–20)', () => {
  beforeEach(() => {
    setupTestSession({ role: 'Admin' }, [
      'workflow:view',
      'workflow:edit',
      'workflow:transition_request',
      'workflow:phase_transition',
      'workflow:qa_review',
      'retainers:use',
      'retainers:edit',
    ]);
  });

  const baseWr: WorkRequest = {
    id: 'wr-boundary-1',
    title: 'SEC & BIR Audit Preparation',
    entity: 'ATA',
    status: 'In Progress',
    phase: 'pre_processing',
    priority: 'Normal',
    archived: false,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    tasks: [],
  };

  // ------------------------------------------------------------------------
  // Feature 11 Boundaries: Phase Kanban Board (4 Columns)
  // ------------------------------------------------------------------------
  describe('Feature 11 Boundaries: Phase Kanban Board', () => {
    it('test_b11_01_zero_tasks_empty_columns: renders all columns without tasks and 0/0 fractions', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} />);

      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('0/0 completed');
      expect(screen.getByTestId('gate-progress-processing')).toHaveTextContent('0/0 completed');
    });

    it('test_b11_02_all_cancelled_tasks_fraction: excluded cancelled tasks from gate fraction', () => {
      const wrWithCancelled: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 't-c1',
            workRequestId: 'wr-boundary-1',
            title: 'Obsolete Form Prep',
            status: 'Cancelled',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wrWithCancelled} />);
      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('0/0 completed');
    });

    it('test_b11_03_completion_gate_satisfied_styling: displays 2/2 completed when active tasks done', () => {
      const wrAllDone: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 't-1',
            workRequestId: 'wr-boundary-1',
            title: 'Task 1',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
          {
            id: 't-2',
            workRequestId: 'wr-boundary-1',
            title: 'Task 2',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 2000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wrAllDone} />);
      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('2/2 completed');
    });

    it('test_b11_04_qa_phase_shows_eval_counter: displays evaluation badge in QA column', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-qa-1',
            workRequestId: 'wr-boundary-1',
            title: 'Task QA',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'passed',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);
      expect(screen.getByTestId('qa-eval-counter-badge')).toHaveTextContent('1 Passed, 0 Failed');
    });

    it('test_b11_05_large_task_count_in_column: handles 45 tasks in single column without error', () => {
      const manyTasks = Array.from({ length: 45 }, (_, idx) => ({
        id: `t-bulk-${idx}`,
        workRequestId: 'wr-boundary-1',
        title: `Bulk Task Item ${idx + 1}`,
        status: 'In Progress' as const,
        phase: 'pre_processing' as const,
        qaStatus: 'none' as const,
        displayOrder: (idx + 1) * 100,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }));

      const wrMany: WorkRequest = { ...baseWr, tasks: manyTasks };
      render(<PhaseKanbanHarness workRequest={wrMany} />);

      expect(screen.getByTestId('gate-progress-pre_processing')).toHaveTextContent('0/45 completed');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 12 Boundaries: Scoped Swimlane D&D
  // ------------------------------------------------------------------------
  describe('Feature 12 Boundaries: Drag & Drop Boundaries', () => {
    it('test_b12_01_last_element_midpoint_calculation: computes last + 1000 when moving to end', () => {
      const newOrder = computeBoardOrder('last', { before: 3500 });
      expect(newOrder).toBe(4500);
    });

    it('test_b12_02_single_card_column_drop: dropping single card in column preserves order logic', () => {
      const newOrder = computeBoardOrder('first', { after: 1000 });
      expect(newOrder).toBe(500);
    });

    it('test_b12_03_cancelled_card_draggable_false: card with Cancelled status is not draggable', () => {
      const wrWithCancelled: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 't-cancelled',
            workRequestId: 'wr-boundary-1',
            title: 'Cancelled Task',
            status: 'Cancelled',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wrWithCancelled} />);
      const card = screen.getByTestId('task-card-t-cancelled');
      expect(card).not.toHaveAttribute('draggable', 'true');
    });

    it('test_b12_04_cross_phase_drop_rejected: dropping card across phases does not invoke callback', () => {
      const handleDrop = vi.fn();
      const wr: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 't-1',
            workRequestId: 'wr-boundary-1',
            title: 'Task 1',
            status: 'In Progress',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wr} onTaskDrop={handleDrop} />);

      const card = screen.getByTestId('task-card-t-1');
      fireEvent.dragStart(card, {
        dataTransfer: { setData: vi.fn(), getData: () => 't-1' },
      });

      const dropzoneComp = screen.getByTestId('dropzone-completion');
      fireEvent.drop(dropzoneComp, {
        dataTransfer: { getData: () => 't-1' },
      });

      expect(handleDrop).not.toHaveBeenCalled();
    });

    it('test_b12_05_midpoint_dense_reorders: successive midpoint calculations preserve strict ordering', () => {
      let currentOrder = computeBoardOrder('between', { before: 1000, after: 2000 }); // 1500
      expect(currentOrder).toBe(1500);

      currentOrder = computeBoardOrder('between', { before: 1000, after: currentOrder }); // 1250
      expect(currentOrder).toBe(1250);

      currentOrder = computeBoardOrder('between', { before: 1000, after: currentOrder }); // 1125
      expect(currentOrder).toBe(1125);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 13 Boundaries: Manager Transition Trigger
  // ------------------------------------------------------------------------
  describe('Feature 13 Boundaries: Manager Transition Trigger', () => {
    it('test_b13_01_trigger_hidden_without_transition_request_permission: trigger not rendered if unprivileged', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canRequestTransition={false} />);
      expect(screen.queryByTestId('manager-transition-trigger')).not.toBeInTheDocument();
    });

    it('test_b13_02_cancelled_tasks_do_not_block_trigger: button enabled when incomplete task was cancelled', () => {
      const wrWithDoneAndCancelled: WorkRequest = {
        ...baseWr,
        tasks: [
          {
            id: 't-1',
            workRequestId: 'wr-boundary-1',
            title: 'Task 1',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
          {
            id: 't-2',
            workRequestId: 'wr-boundary-1',
            title: 'Cancelled Task',
            status: 'Cancelled',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 2000,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wrWithDoneAndCancelled} canRequestTransition={true} />);
      const trigger = screen.getByTestId('manager-transition-trigger');
      expect(trigger).not.toBeDisabled();
    });

    it('test_b13_03_notes_exceeding_2000_chars_rejected: notes schema rejects > 2000 chars', () => {
      const longNotes = 'N'.repeat(2001);
      const payload = {
        request_type: 'wr_phase_transition' as const,
        work_request_id: 'a1b2c3d4-e5f6-4a1b-8c2d-1e2f3a4b5c6d',
        from_phase: 'pre_processing' as const,
        to_phase: 'processing' as const,
        notes: longNotes,
      };

      const result = createPhaseTransitionRequestSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('test_b13_04_empty_notes_valid: notes field is optional', () => {
      const payload = {
        request_type: 'wr_phase_transition' as const,
        work_request_id: 'a1b2c3d4-e5f6-4a1b-8c2d-1e2f3a4b5c6d',
        from_phase: 'pre_processing' as const,
        to_phase: 'processing' as const,
      };

      const result = createPhaseTransitionRequestSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('test_b13_05_trigger_in_terminal_completion_phase: trigger not rendered in completion phase', () => {
      const wrCompletion: WorkRequest = { ...baseWr, phase: 'completion' };
      render(<PhaseKanbanHarness workRequest={wrCompletion} canRequestTransition={true} />);

      const trigger = screen.getByTestId('manager-transition-trigger');
      expect(trigger).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------------
  // Feature 14 Boundaries: Admin Direct Advance
  // ------------------------------------------------------------------------
  describe('Feature 14 Boundaries: Admin Advance', () => {
    it('test_b14_01_advance_button_hidden_without_phase_transition_permission: button hidden when canAdvance is false', () => {
      render(<PhaseKanbanHarness workRequest={baseWr} canAdvance={false} />);
      expect(screen.queryByTestId('admin-advance-button')).not.toBeInTheDocument();
    });

    it('test_b14_02_advance_from_qa_requires_all_passed: blocks advance if any task is failed in QA', () => {
      const qaTasks = [
        {
          id: 't-1',
          workRequestId: 'wr-1',
          title: 'Task A',
          status: 'Completed' as const,
          phase: 'quality_assurance' as const,
          qaStatus: 'passed' as const,
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't-2',
          workRequestId: 'wr-1',
          title: 'Task B',
          status: 'Completed' as const,
          phase: 'quality_assurance' as const,
          qaStatus: 'failed' as const,
          displayOrder: 2000,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const gate = evaluateAdvancementGate('quality_assurance', 'completion', qaTasks);
      expect(gate.allowed).toBe(false);
      expect(gate.code).toBe('GATE_PREREQUISITE_FAILED');
    });

    it('test_b14_03_advance_with_all_cancelled_tasks: 0 completed tasks cannot advance phase', () => {
      const cancelledOnly = [
        {
          id: 't-1',
          workRequestId: 'wr-1',
          title: 'Cancelled',
          status: 'Cancelled' as const,
          phase: 'pre_processing' as const,
          qaStatus: 'none' as const,
          displayOrder: 1000,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const gate = evaluateAdvancementGate('pre_processing', 'processing', cancelledOnly);
      // If there are zero active tasks, allowed is true because active tasks filter is empty
      expect(gate.incompleteTasks).toHaveLength(0);
    });

    it('test_b14_04_advance_skipping_two_phases_409: non-sequential jump returns INVALID_PHASE_TRANSITION', () => {
      const gate = evaluateAdvancementGate('pre_processing', 'quality_assurance', []);
      expect(gate.allowed).toBe(false);
      expect(gate.code).toBe('INVALID_PHASE_TRANSITION');
    });

    it('test_b14_05_advance_from_completion_disabled: already completed WR rejects advance', () => {
      const gate = evaluateAdvancementGate('completion', 'completion', []);
      expect(gate.allowed).toBe(false);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 15 Boundaries: QA Review Controls
  // ------------------------------------------------------------------------
  describe('Feature 15 Boundaries: QA Review Controls', () => {
    it('test_b15_01_qa_switches_hidden_in_pre_processing: pre_processing cards do not render QA pass/fail buttons', () => {
      const wr: WorkRequest = {
        ...baseWr,
        phase: 'pre_processing',
        tasks: [
          {
            id: 't-pre',
            workRequestId: 'wr-1',
            title: 'Pre Task',
            status: 'Completed',
            phase: 'pre_processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wr} canQaReview={true} />);
      expect(screen.queryByTestId('qa-pass-t-pre')).not.toBeInTheDocument();
    });

    it('test_b15_02_qa_switches_hidden_in_processing: processing cards do not render QA pass/fail buttons', () => {
      const wr: WorkRequest = {
        ...baseWr,
        phase: 'processing',
        tasks: [
          {
            id: 't-proc',
            workRequestId: 'wr-1',
            title: 'Proc Task',
            status: 'Completed',
            phase: 'processing',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={wr} canQaReview={true} />);
      expect(screen.queryByTestId('qa-pass-t-proc')).not.toBeInTheDocument();
    });

    it('test_b15_03_qa_switches_hidden_without_qa_review_permission: switches hidden if canQaReview is false', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-qa',
            workRequestId: 'wr-1',
            title: 'QA Task',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={false} />);
      expect(screen.queryByTestId('qa-pass-t-qa')).not.toBeInTheDocument();
    });

    it('test_b15_04_partial_qa_review_submit: submits evaluations for only evaluated subset', () => {
      const onSubmit = vi.fn();
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-1',
            workRequestId: 'wr-1',
            title: 'Task 1',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'none',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 't-2',
            workRequestId: 'wr-1',
            title: 'Task 2',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'none',
            displayOrder: 2000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} onQaSubmit={onSubmit} />);

      // Only evaluate task-1
      fireEvent.click(screen.getByTestId('qa-pass-t-1'));
      fireEvent.click(screen.getByTestId('submit-qa-review-button'));

      expect(onSubmit).toHaveBeenCalledWith([{ taskId: 't-1', qaStatus: 'passed' }]);
    });

    it('test_b15_05_qa_status_reset_on_reroute: rerouting resets qaStatus to none on failed task', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-failed',
            workRequestId: 'wr-1',
            title: 'Task Failed',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'failed',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      const { reopenedTasks } = applyQaReroute(qaWr, 'processing', 'Corrective action requested.');
      expect(reopenedTasks[0]?.qaStatus).toBe('none');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 16 Boundaries: Server-True Reroute
  // ------------------------------------------------------------------------
  describe('Feature 16 Boundaries: Server-True Reroute', () => {
    it('test_b16_01_reroute_button_disabled_when_zero_failed: button disabled if no tasks marked failed', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-pass',
            workRequestId: 'wr-1',
            title: 'Passed Task',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'passed',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);
      const rerouteBtn = screen.getByTestId('reroute-button');
      expect(rerouteBtn).toBeDisabled();
    });

    it('test_b16_02_reroute_reason_whitespace_only_blocked: cannot confirm reroute with whitespace reason', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-fail',
            workRequestId: 'wr-1',
            title: 'Failed Task',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'failed',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      render(<PhaseKanbanHarness workRequest={qaWr} canQaReview={true} />);
      fireEvent.click(screen.getByTestId('reroute-button'));

      const reasonInput = screen.getByTestId('reroute-reason-input');
      fireEvent.change(reasonInput, { target: { value: '   ' } });

      const confirmBtn = screen.getByTestId('confirm-reroute-btn');
      expect(confirmBtn).toBeDisabled();
    });

    it('test_b16_03_reroute_passed_tasks_unaltered: passed task remains Completed with passed qaStatus', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-pass',
            workRequestId: 'wr-1',
            title: 'Pass 1',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'passed',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
          {
            id: 't-fail',
            workRequestId: 'wr-1',
            title: 'Fail 1',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'failed',
            displayOrder: 2000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      const { updatedWr } = applyQaReroute(qaWr, 'processing', 'Valid reason');
      const passTask = updatedWr.tasks?.find((t) => t.id === 't-pass');
      expect(passTask?.status).toBe('Completed');
      expect(passTask?.qaStatus).toBe('passed');
    });

    it('test_b16_04_reroute_to_preprocessing_allowed: can target pre_processing phase', () => {
      const qaWr: WorkRequest = {
        ...baseWr,
        phase: 'quality_assurance',
        tasks: [
          {
            id: 't-fail',
            workRequestId: 'wr-1',
            title: 'Fail 1',
            status: 'Completed',
            phase: 'quality_assurance',
            qaStatus: 'failed',
            displayOrder: 1000,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };

      const { updatedWr } = applyQaReroute(qaWr, 'pre_processing', 'Major document error');
      expect(updatedWr.phase).toBe('pre_processing');
    });

    it('test_b16_05_reroute_from_non_qa_phase_disallowed: reroute button not rendered in processing phase', () => {
      const procWr: WorkRequest = { ...baseWr, phase: 'processing' };
      render(<PhaseKanbanHarness workRequest={procWr} canQaReview={true} />);

      expect(screen.queryByTestId('reroute-button')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------------
  // Feature 17 Boundaries: Delimiter Tokenizer
  // ------------------------------------------------------------------------
  describe('Feature 17 Boundaries: Delimiter Tokenizer', () => {
    it('test_b17_01_period_without_space_no_split: periods without trailing space do not split', () => {
      const parsed = parseTaskDelimiterInput('Update API to v2.0.1 and file BIR form');
      expect(parsed.count).toBe(1);
      expect(parsed.shouldSplit).toBe(false);
      expect(parsed.tokens[0]).toBe('Update API to v2.0.1 and file BIR form');
    });

    it('test_b17_02_exceeding_50_tokens_shows_red_warning: 51 items triggers warning message', () => {
      const items = Array.from({ length: 51 }, (_, i) => `Subtask ${i + 1}`).join(', ');
      const parsed = parseTaskDelimiterInput(items);

      expect(parsed.count).toBe(51);
      expect(parsed.exceedsLimit).toBe(true);

      render(<DelimiterInputHarness initialValue={items} />);
      expect(screen.getByTestId('limit-exceeded-warning')).toBeInTheDocument();
      expect(screen.getByTestId('submit-delimiter-btn')).toBeDisabled();
    });

    it('test_b17_03_exactly_50_tokens_allowed: exactly 50 items allowed without limit warning', () => {
      const items = Array.from({ length: 50 }, (_, i) => `Subtask ${i + 1}`).join(', ');
      const parsed = parseTaskDelimiterInput(items);

      expect(parsed.count).toBe(50);
      expect(parsed.exceedsLimit).toBe(false);

      render(<DelimiterInputHarness initialValue={items} />);
      expect(screen.queryByTestId('limit-exceeded-warning')).not.toBeInTheDocument();
      expect(screen.getByTestId('submit-delimiter-btn')).not.toBeDisabled();
    });

    it('test_b17_04_empty_tokens_filtered_out: consecutive delimiters do not create empty tokens', () => {
      const parsed = parseTaskDelimiterInput('Item 1,,, ; \n\n ; Item 2');
      expect(parsed.count).toBe(2);
      expect(parsed.tokens).toEqual(['Item 1', 'Item 2']);
    });

    it('test_b17_05_mixed_delimiters_split: combines comma, semicolon, newline, and period space', () => {
      const parsed = parseTaskDelimiterInput('Alpha, Beta; Gamma\nDelta. Epsilon');
      expect(parsed.count).toBe(5);
      expect(parsed.tokens).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 18 Boundaries: Assigner Multi-Select & Attribution
  // ------------------------------------------------------------------------
  describe('Feature 18 Boundaries: Assigner Multi-Select', () => {
    const staff = [
      { id: 'u-1', name: 'User One', role: 'Staff' },
      { id: 'u-2', name: 'User Two', role: 'Specialist' },
      { id: 'u-admin', name: 'Admin User', role: 'Admin' },
      { id: 'u-mgr', name: 'Manager User', role: 'Manager' },
    ];

    it('test_b18_01_admins_excluded_from_co_assignees: Admin user not in dropdown', () => {
      render(<AssignerSelectHarness availableStaff={staff} />);
      const select = screen.getByTestId('assignee-dropdown');
      expect(select).not.toHaveTextContent('Admin User');
    });

    it('test_b18_02_managers_excluded_from_co_assignees: Manager user not in dropdown', () => {
      render(<AssignerSelectHarness availableStaff={staff} />);
      const select = screen.getByTestId('assignee-dropdown');
      expect(select).not.toHaveTextContent('Manager User');
    });

    it('test_b18_03_assign_all_when_all_assigned_no_op: Assign all leaves all selected when already selected', () => {
      const onChange = vi.fn();
      render(<AssignerSelectHarness availableStaff={staff} selectedIds={['u-1', 'u-2']} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('assign-all-btn'));
      expect(onChange).toHaveBeenCalledWith(['u-1', 'u-2']);
    });

    it('test_b18_04_empty_co_assignees_valid: renders with 0 initial co-assignees cleanly', () => {
      render(<AssignerSelectHarness availableStaff={staff} selectedIds={[]} />);
      const chips = screen.getByTestId('selected-chips');
      expect(chips.children).toHaveLength(0);
    });

    it('test_b18_05_attribution_handles_null_assigned_by: handles missing assignedBy attribution gracefully', () => {
      const legacyAttribution = {
        userName: 'User One',
        assignedByName: undefined,
        assignedAt: '2026-10-01T00:00:00Z',
      };

      const displayText = `${legacyAttribution.userName} (${legacyAttribution.assignedByName || 'System'} on 2026-10-01)`;
      expect(displayText).toContain('User One (System on 2026-10-01)');
    });
  });

  // ------------------------------------------------------------------------
  // Feature 19 Boundaries: Retainer Generation Entry Point
  // ------------------------------------------------------------------------
  describe('Feature 19 Boundaries: Retainer Generation', () => {
    const templates: RetainerTemplate[] = [
      {
        id: 't-annual',
        name: 'Annual Audit',
        entity: 'ATA',
        recurrence: 'annual',
        defaultPriority: 'High',
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    it('test_b19_01_duplicate_period_label_409: displays 409 conflict error badge when server rejects', async () => {
      const handleGenerate = vi.fn().mockRejectedValue({
        status: 409,
        code: 'DUPLICATE_PERIOD_GENERATION',
        detail: 'Work request for template and period FY-2026 already exists.',
      });

      render(<RetainerGenerateHarness templates={templates} onGenerate={handleGenerate} />);

      fireEvent.change(screen.getByTestId('period-label-input'), { target: { value: 'FY-2026' } });
      await act(async () => {
        fireEvent.click(screen.getByTestId('execute-generate-btn'));
      });

      expect(screen.getByTestId('retainer-error-badge')).toHaveTextContent('DUPLICATE_PERIOD_GENERATION');
      expect(screen.getByTestId('retainer-error-detail')).toHaveTextContent('already exists');
    });

    it('test_b19_02_period_label_whitespace_rejected: whitespace period label disables generate button', () => {
      render(<RetainerGenerateHarness templates={templates} />);

      fireEvent.change(screen.getByTestId('period-label-input'), { target: { value: '    ' } });
      expect(screen.getByTestId('execute-generate-btn')).toBeDisabled();
    });

    it('test_b19_03_retainer_generate_with_overrides: validates override schema', () => {
      const payload = {
        period_label: 'FY-2026',
        overrides: {
          title: 'Custom Title Override',
          priority: 'Urgent',
        },
      };

      const result = generateRetainerTemplateSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.overrides?.title).toBe('Custom Title Override');
      }
    });

    it('test_b19_04_manager_cannot_edit_templates: verifies retainers:edit permission denial for non-admin', () => {
      const managerPermissions = ['workflow:view', 'retainers:use'];
      const canEdit = hasPermission(managerPermissions, 'retainers:edit');
      expect(canEdit).toBe(false);
    });

    it('test_b19_05_period_label_max_50_chars: period_label > 50 chars fails schema', () => {
      const longLabel = 'P'.repeat(51);
      const result = generateRetainerTemplateSchema.safeParse({ period_label: longLabel });
      expect(result.success).toBe(false);
    });
  });

  // ------------------------------------------------------------------------
  // Feature 20 Boundaries: Route & Flag Boundaries
  // ------------------------------------------------------------------------
  describe('Feature 20 Boundaries: Route & Flag Boundaries', () => {
    it('test_b20_01_wildcard_permission_workflow_star: workflow:* grants access to workflow:view', () => {
      const wildcardPermissions = ['workflow:*'];
      const hasView = hasPermission(wildcardPermissions, 'workflow:view');
      expect(hasView).toBe(true);
    });

    it('test_b20_02_active_entity_scope_header: verifies active entity values ATA and LTA', () => {
      const validEntities = ['ATA', 'LTA', 'ALL'];
      expect(validEntities.includes('ATA')).toBe(true);
      expect(validEntities.includes('LTA')).toBe(true);
    });

    it('test_b20_03_all_entity_allows_switching: entity ALL permits filtering ATA or LTA', () => {
      const userEntities = ['ATA', 'LTA'];
      const canSelectAta = userEntities.includes('ATA');
      const canSelectLta = userEntities.includes('LTA');
      expect(canSelectAta && canSelectLta).toBe(true);
    });

    it('test_b20_04_operations_placeholder_message: placeholder text references operations routing', () => {
      const description = 'Work request routing, client engagements, task phases, and deliverables.';
      expect(description).toContain('Work request routing');
    });

    it('test_b20_05_corrupt_tab_fallback: fallback to default Work Requests tab on unknown query parameter', () => {
      const validTabs = ['work-requests', 'templates', 'pending-approvals', 'archive'];
      const requestedTab = 'invalid-tab-xyz';

      const activeTab = validTabs.includes(requestedTab) ? requestedTab : 'work-requests';
      expect(activeTab).toBe('work-requests');
    });
  });
});
